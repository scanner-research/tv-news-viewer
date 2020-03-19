#!/usr/bin/env python3

import argparse
import os
import json
import heapq
import time
from collections import Counter, defaultdict
from functools import wraps
from inspect import getfullargspec
from multiprocessing import Pool
from typing import List, Tuple

from rs_intervalset import MmapIntervalListMapping, MmapIntervalSetMapping
from rs_intervalset.writer import (
    IntervalSetMappingWriter, IntervalListMappingWriter)

U32_MAX = 0xFFFFFFFF

# Mask for data bits that are used
PAYLOAD_DATA_MASK = 0b00000111
PAYLOAD_LEN = 1


def get_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('--datadir', type=str, default='data')
    parser.add_argument(
        '-i', '--incremental', action='store_true',
        help='Incrementally update existing derived files (skips video ids with existing derived data).')
    parser.add_argument(
        '-t', '--tag-limit', type=int, default=250,
        help='Tags exceeding this number of individuals will be precomputed.')
    parser.add_argument(
        '-p', '--person-limit', type=int, default=2 ** 20,    # 1MB
        help='Person isets will be precomputed for people ilists exceeding this size.')
    return parser.parse_args()


def mkdir_if_not_exists(d: str):
    os.makedirs(d, exist_ok=True)


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


def print_task_info(f):
    arg_spec = getfullargspec(f)
    arg_idx = arg_spec.args.index('outfile')
    assert arg_idx >= 0

    @wraps(f)
    def _task_info(*args, **kwargs):
        outfile = args[arg_idx]
        print('Writing:', outfile)
        start_time = time.time()
        result = f(*args, **kwargs)
        print('Done:', outfile, '({:0.3f}s)'.format(time.time() - start_time))
        return result
    return _task_info


@print_task_info
def derive_face_iset(
    face_ilist_file: str, payload_mask: int, payload_value: int, outfile: str,
    is_incremental: bool
) -> None:
    ilistmap = MmapIntervalListMapping(face_ilist_file, PAYLOAD_LEN)
    video_ids = set(ilistmap.get_ids())
    if is_incremental and os.path.exists(outfile):
        video_ids -= get_iset_ids(outfile)

    with IntervalSetMappingWriter(outfile, append=is_incremental) as writer:
        for video_id in sorted(video_ids):
            acc = IntervalAccumulator()
            for interval in ilistmap.intersect(
                video_id, [(0, U32_MAX)], payload_mask, payload_value, False
            ):
                acc.add(*interval)
            result = acc.get()
            if result:
                writer.write(video_id, result)


def derive_face_isets(
    workers: Pool, face_ilist_file: str, outdir: str, is_incremental: bool
) -> None:
    mkdir_if_not_exists(outdir)

    def helper(mask: int, value: int, outfile: str) -> None:
        workers.apply_async(
            derive_face_iset,
            (
                face_ilist_file, mask, value, os.path.join(outdir, outfile),
                is_incremental
            ),
            error_callback=build_error_callback('Failed on: ' + face_ilist_file))

    # There are 3 bits in the encoding
    #   The 1's place is binary gender. 1 if male, 0 if female. Ignore if
    #       the 2's place is 1.
    #   The 2's place is nonbinary gender. If 1, ignore the 1's place.
    #       This individual counted in neither male nor female aggregations
    #   The 4's place is 1 if the individual is a host of the show, 0 otherwise
    helper(0b000, 0b000, 'all.iset.bin')
    helper(0b011, 0b001, 'male.iset.bin')
    helper(0b011, 0b000, 'female.iset.bin')
    helper(0b100, 0b100, 'host.iset.bin')
    helper(0b100, 0b000, 'nonhost.iset.bin')
    helper(0b111, 0b101, 'male_host.iset.bin')
    helper(0b111, 0b001, 'male_nonhost.iset.bin')
    helper(0b111, 0b100, 'female_host.iset.bin')
    helper(0b111, 0b000, 'female_nonhost.iset.bin')


IntervalAndPayload = Tuple[int, int, int]


def get_ilist_ids(fname):
    return set(MmapIntervalListMapping(fname, PAYLOAD_LEN).get_ids())


def get_iset_ids(fname):
    return set(MmapIntervalSetMapping(fname).get_ids())


@print_task_info
def derive_num_faces_ilist(
    face_ilist_file: str, outfile: str, is_incremental: bool
) -> None:

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

    ilistmap = MmapIntervalListMapping(face_ilist_file, PAYLOAD_LEN)
    video_ids = set(ilistmap.get_ids())
    if is_incremental and os.path.exists(outfile):
        video_ids -= get_ilist_ids(outfile)

    with IntervalListMappingWriter(
        outfile, PAYLOAD_LEN, append=is_incremental
    ) as writer:
        for video_id in sorted(video_ids):
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


@print_task_info
def derive_person_iset(
    person_ilist_file: str, outfile: str, is_incremental: bool
) -> None:
    ilistmap = MmapIntervalListMapping(person_ilist_file, PAYLOAD_LEN)
    video_ids = set(ilistmap.get_ids())
    if is_incremental and os.path.exists(outfile):
        video_ids -= get_iset_ids(outfile)

    with IntervalSetMappingWriter(outfile, append=is_incremental) as writer:
        for video_id in sorted(video_ids):
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


def parse_person_name(fname: str) -> str:
    return os.path.splitext(os.path.splitext(fname)[0])[0]


def derive_person_isets(
    workers: Pool, person_ilist_dir: str, outdir: str, threshold_in_bytes: int,
    is_incremental: bool
) -> None:
    mkdir_if_not_exists(outdir)

    skipped_count = 0
    for person_file in os.listdir(person_ilist_dir):
        if not person_file.endswith('.ilist.bin'):
            print('Skipping:', person_file)
            continue
        person_path = os.path.join(person_ilist_dir, person_file)
        if os.path.getsize(person_path) < threshold_in_bytes:
            if skipped_count < 100:
                print('Skipping (too small):', person_file)
            skipped_count += 1
            continue

        person_name = parse_person_name(person_file)
        workers.apply_async(
            derive_person_iset,
            (
                person_path, os.path.join(outdir, person_name + '.iset.bin'),
                is_incremental
            ),
            error_callback=build_error_callback('Failed on: ' + person_file))
    if skipped_count > 0:
        print('Skipped {} people (files too small).'.format(skipped_count))


@print_task_info
def derive_tag_ilist(
    person_ilist_files: str, outfile: str, is_incremental: bool
) -> None:
    ilistmaps = [MmapIntervalListMapping(f, PAYLOAD_LEN)
                 for f in person_ilist_files]

    video_id_set = set()
    for ilist in ilistmaps:
        video_id_set.update(ilist.get_ids())

    def deoverlap_intervals(intervals):
        payload_dict = defaultdict(lambda: IntervalAccumulator())
        for a, b, c in heapq.merge(*intervals):
            payload_dict[c & PAYLOAD_DATA_MASK].add(a, b)
        return list(heapq.merge(*[
            [(a, b, payload) for a, b in acc.get()]
            for payload, acc in payload_dict.items()
        ]))

    if is_incremental and os.path.exists(outfile):
        video_id_set -= get_ilist_ids(outfile)

    with IntervalListMappingWriter(
        outfile, PAYLOAD_LEN, append=is_incremental
    ) as writer:
        for i in sorted(video_id_set):
            intervals = []
            for ilist in ilistmaps:
                intervals.append(ilist.get_intervals_with_payload(i, True))
            writer.write(i, deoverlap_intervals(intervals))


def derive_tag_ilists(
    workers: Pool, person_ilist_dir: str, metadata_path: str, outdir: str,
    threshold: int, is_incremental: bool
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
                    os.path.join(outdir, tag + '.ilist.bin'),
                    is_incremental
                ),
                error_callback=build_error_callback('Failed on: ' + tag))


def main(datadir: str, incremental: bool, tag_limit: int,
         person_limit: int) -> None:
    outdir = os.path.join(datadir, 'derived')
    mkdir_if_not_exists(outdir)

    with Pool() as workers:
        derive_face_isets(
            workers, os.path.join(datadir, 'faces.ilist.bin'),
            os.path.join(outdir, 'face'), incremental)
        derive_person_isets(
            workers, os.path.join(datadir, 'people'),
            os.path.join(outdir, 'people'),
            person_limit, incremental)
        derive_tag_ilists(
            workers, os.path.join(datadir, 'people'),
            os.path.join(datadir, 'people.metadata.json'),
            os.path.join(outdir, 'tags'),
            tag_limit, incremental)

        workers.apply_async(
            derive_num_faces_ilist,
            (
                os.path.join(datadir, 'faces.ilist.bin'),
                os.path.join(outdir, 'num_faces.ilist.bin'),
                incremental
            ),
            error_callback=build_error_callback('Failed on: num faces ilist'))

        workers.close()
        workers.join()
    print('Done!')


if __name__ == '__main__':
    main(**vars(get_args()))
