#!/usr/bin/env python3

import argparse
import os
import json
import heapq
from collections import Counter, defaultdict
from multiprocessing import Pool
from typing import List, Tuple

from rs_intervalset import MmapIntervalListMapping
from rs_intervalset.writer import (
    IntervalSetMappingWriter, IntervalListMappingWriter)

U32_MAX = 0xFFFFFFFF


def get_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('--datadir', type=str, default='data')
    return parser.parse_args()


def mkdir_if_not_exists(d: str) -> bool:
    if not os.path.exists(d):
        os.makedirs(d)
        return True
    return False


# TODO(james): investigate why derived data are subtly different from Spark
class IntervalAccumulator(object):

    def __init__(self, fuzz: int = 250):
        self._intervals = None
        self._fuzz = fuzz

    def add(self, start: int, end: int) -> None:
        assert start <= end
        if not self._intervals:
            self._intervals = [(start, end)]
        else:
            last_int = self._intervals[-1]
            if start > last_int[1] + self._fuzz:
                self._intervals.append((start, end))
            elif end > last_int[1]:
                assert start >= last_int[0]
                assert last_int[0] <= end
                self._intervals[-1] = (last_int[0], end)

    def get(self):
        return self._intervals


# TODO(james): not sure this is actually catching any errors
def build_error_callback(message):
    def cb(e):
        print(message)
        raise e
    return cb


def derive_face_iset(
    face_ilist_file: str, payload_mask: int, payload_value: int, outfile: str
) -> None:
    ilistmap = MmapIntervalListMapping(face_ilist_file, 1)
    print('Writing:', outfile)
    with IntervalSetMappingWriter(outfile) as writer:
        for video_id in ilistmap.get_ids():
            acc = IntervalAccumulator()
            for interval in ilistmap.intersect(
                video_id, [(0, U32_MAX)], payload_mask, payload_value, False
            ):
                acc.add(*interval)
            result = acc.get()
            if result:
                writer.write(video_id, result)
    print('Done:', outfile)


def derive_face_isets(
    workers: Pool, face_ilist_file: str, outdir: str
) -> None:
    mkdir_if_not_exists(outdir)

    def helper(mask: int, value: int, outfile: str) -> None:
        workers.apply_async(
            derive_face_iset,
            (face_ilist_file, mask, value, os.path.join(outdir, outfile)),
            error_callback=build_error_callback('Failed on: ' + face_ilist_file))

    helper(0, 0, 'all.iset.bin')
    helper(0b1, 0b1, 'male.iset.bin')
    helper(0b1, 0b0, 'female.iset.bin')
    helper(0b10, 0b10, 'host.iset.bin')
    helper(0b10, 0b00, 'nonhost.iset.bin')
    helper(0b11, 0b11, 'male_host.iset.bin')
    helper(0b11, 0b01, 'male_nonhost.iset.bin')
    helper(0b11, 0b10, 'female_host.iset.bin')
    helper(0b11, 0b00, 'female_nonhost.iset.bin')


IntervalAndPayload = Tuple[int, int, int]


def derive_num_faces_ilist(face_ilist_file: str, outfile: str) -> None:
    ilistmap = MmapIntervalListMapping(face_ilist_file, 1)

    def deoverlap(
        intervals: List[IntervalAndPayload], fuzz: int = 250
    ) -> List[IntervalAndPayload]:
        result = []
        for i in intervals:
            if len(result) == 0:
                result.append(i)
            else:
                last = result[-1]
                if last[2] == i[2] and i[0] - last[1] <= fuzz:
                    result[-1] = (min(i[0], last[0]), max(i[1], last[1]), i[2])
                else:
                    result.append(i)
        return result

    with IntervalListMappingWriter(outfile, 1) as writer:
        for video_id in ilistmap.get_ids():
            intervals = []
            curr_interval = None
            curr_interval_count = None
            for interval in ilistmap.get_intervals(video_id, 0, 0, False):
                if not curr_interval:
                    curr_interval = interval
                    curr_interval_count = 1
                else:
                    if interval == curr_interval:
                        curr_interval_count += 1
                    else:
                        intervals.append((*curr_interval, curr_interval_count))
                        curr_interval = interval
                        curr_interval_count = 1
            else:
                if curr_interval:
                    intervals.append((*curr_interval, curr_interval_count))
                    del curr_interval
                    del curr_interval_count

            if len(intervals) > 0:
                writer.write(video_id, deoverlap(intervals))


def derive_person_iset(person_ilist_file: str, outfile: str) -> None:
    ilistmap = MmapIntervalListMapping(person_ilist_file, 1)

    print('Writing:', outfile)
    with IntervalSetMappingWriter(outfile) as writer:
        for video_id in ilistmap.get_ids():
            acc = IntervalAccumulator()

            for interval in ilistmap.intersect(
                video_id, [(0, U32_MAX)],
                0, 0,              # Keep all faces
                False
            ):
                acc.add(*interval)
            result = acc.get()
            if result:
                writer.write(video_id, result)
    print('Done:', outfile)


def parse_person_name(fname: str) -> str:
    return os.path.splitext(os.path.splitext(fname)[0])[0]


def derive_person_isets(
    workers: Pool, person_ilist_dir: str, outdir: str,
    threshold_in_bytes: int = 100 * (2 ** 10)
) -> None:
    mkdir_if_not_exists(outdir)

    for person_file in os.listdir(person_ilist_dir):
        if not person_file.endswith('.ilist.bin'):
            print('Skipping:', person_file)
            continue
        person_path = os.path.join(person_ilist_dir, person_file)
        if os.path.getsize(person_path) < threshold_in_bytes:
            print('Skipping (too small):', person_file)
            continue

        person_name = parse_person_name(person_file)
        workers.apply_async(
            derive_person_iset,
            (
                person_path, os.path.join(outdir, person_name + '.iset.bin')
            ),
            error_callback=build_error_callback('Failed on: ' + person_file))


def derive_tag_ilist(person_ilist_files: str, outfile: str) -> None:
    ilistmaps = [MmapIntervalListMapping(f, 1) for f in person_ilist_files]

    id_set = set()
    for ilist in ilistmaps:
        id_set.update(ilist.get_ids())

    print('Writing:', outfile)
    with IntervalListMappingWriter(outfile, 1) as writer:
        for i in sorted(id_set):
            intervals = []
            for ilist in ilistmaps:
                intervals.append(ilist.get_intervals_with_payload(i, True))
            writer.write(i, list(heapq.merge(*intervals)))
    print('Done:', outfile)


def derive_tag_ilists(
    workers: Pool, person_ilist_dir: str, metadata_path: str, outdir: str,
    threshold: int = 100
) -> None:
    people_available = {
        parse_person_name(p) for p in os.listdir(person_ilist_dir)
        if p.endswith('.ilist.bin')
    }

    with open(metadata_path) as f:
        people_to_tags = json.load(f)
        people_to_tags = {
            k.lower(): v for k, v in people_to_tags.items()
            if k.lower() in people_available
        }

    tag_to_people = defaultdict(list)
    for person, tags in people_to_tags.items():
        for tag, _ in tags:
            tag_to_people[tag].append(person)

    mkdir_if_not_exists(outdir)

    for tag, people in tag_to_people.items():
        if len(people) >= threshold:
            people_ilist_files = [
                os.path.join(person_ilist_dir, '{}.ilist.bin'.format(p))
                for p in people]
            workers.apply_async(
                derive_tag_ilist,
                (
                    people_ilist_files,
                    os.path.join(outdir, tag + '.ilist.bin')
                ),
                error_callback=build_error_callback('Failed on: ' + tag))


def main(datadir: str) -> None:
    outdir = os.path.join(datadir, 'derived')
    mkdir_if_not_exists(outdir)

    with Pool() as workers:
        derive_face_isets(
            workers, os.path.join(datadir, 'faces.ilist.bin'),
            os.path.join(outdir, 'face'))
        derive_person_isets(
            workers, os.path.join(datadir, 'people'),
            os.path.join(outdir, 'people'))
        derive_tag_ilists(
            workers, os.path.join(datadir, 'people'),
            os.path.join(datadir, 'people.metadata.json'),
            os.path.join(outdir, 'tags'))

        workers.apply_async(
            derive_num_faces_ilist,
            (
                os.path.join(datadir, 'faces.ilist.bin'),
                os.path.join(outdir, 'num_faces.ilist.bin')
            ),
            error_callback=build_error_callback('Failed on: num faces ilist'))

        workers.close()
        workers.join()


if __name__ == '__main__':
    main(**vars(get_args()))
