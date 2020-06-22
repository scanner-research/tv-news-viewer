"""
Module for loading the data.
"""

import math
import re
import os
import csv
import json
from os import path
from collections import Counter, OrderedDict, defaultdict
from pathlib import Path
from typing import NamedTuple, Dict, Set, Tuple

from pytz import timezone

from captions import CaptionIndex, Documents, Lexicon       # type: ignore
from rs_intervalset import (                                # type: ignore
    MmapIntervalSetMapping, MmapIntervalListMapping)
from rs_intervalset.wrapper import MmapIListToISetMapping   # type: ignore

from .types_backend import (
    Video, FaceIntervals, PersonIntervals, Tag, AllPersonTags,
    AllPersonIntervals)
from .types_frontend import GLOBAL_TAGS
from .parsing import load_json, parse_date_from_video_name


MAX_PERSON_ATTRIBUTE_LEN = 50
MIN_PERSON_ATTRIBUTE_LEN = 3


def get_video_name(s: str) -> str:
    s = Path(s).name
    if s.endswith('.srt'):
        return s[:-len('.srt')]
    if s.endswith('.mp4'):
        return s[:-len('.mp4')]
    return s

class VideoDataContext(NamedTuple):
    """Wrapper object for video data"""
    video_dict: Dict[str, Video]
    video_by_id: Dict[int, Video]
    commercial_isetmap: MmapIntervalSetMapping
    face_intervals: FaceIntervals
    all_person_intervals: AllPersonIntervals
    all_person_tags: AllPersonTags
    cached_tag_intervals: Dict[str, MmapIntervalListMapping]
    host_to_channels: Dict[str, Set[str]]


class CaptionDataContext(NamedTuple):
    """Wrapper object for caption data"""
    index: CaptionIndex
    documents: Documents
    lexicon: Lexicon
    document_by_name: Dict[str, Documents.Document]


def load_videos(data_dir: str, tz: timezone) -> Dict[str, Video]:
    videos = OrderedDict()
    video_path = path.join(data_dir, 'videos.json')
    for v in sorted(load_json(video_path), key=lambda x: x[0]):
        (
            vid,
            name,
            show,
            channel,
            num_frames,
            fps,
            width,
            height
        ) = v
        assert isinstance(vid, int)
        assert isinstance(name, str)
        assert isinstance(show, str)
        assert isinstance(channel, str)
        assert isinstance(num_frames, int)
        assert isinstance(fps, float)
        assert isinstance(width, int)
        assert isinstance(height, int)

        video_name = get_video_name(name)
        assert video_name not in videos, '{} is duplicated'.format(name)
        date, minute = parse_date_from_video_name(video_name, tz)
        assert date is not None
        dayofweek = date.isoweekday()  # Mon == 1, Sun == 7
        videos[name] = Video(
            id=vid, name=video_name, show=show, channel=channel,
            date=date, dayofweek=dayofweek, hour=math.floor(minute / 60),
            num_frames=num_frames, fps=fps, width=width, height=height
        )
    return videos


def _load_face_intervals(data_dir: str) -> FaceIntervals:
    face_iset_dir = path.join(data_dir, 'derived', 'face')
    face_intervals = FaceIntervals(
        all_ilistmap=MmapIntervalListMapping(
            path.join(data_dir, 'faces.ilist.bin'), 1),
        num_faces_ilistmap=MmapIntervalListMapping(
            path.join(data_dir, 'derived', 'num_faces.ilist.bin'), 1),
        all_isetmap=MmapIntervalSetMapping(
            path.join(face_iset_dir, 'all.iset.bin')),
        male_isetmap=MmapIntervalSetMapping(
            path.join(face_iset_dir, 'male.iset.bin')),
        female_isetmap=MmapIntervalSetMapping(
            path.join(face_iset_dir, 'female.iset.bin')),
        host_isetmap=MmapIntervalSetMapping(
            path.join(face_iset_dir, 'host.iset.bin')),
        nonhost_isetmap=MmapIntervalSetMapping(
            path.join(face_iset_dir, 'nonhost.iset.bin')),
        male_host_isetmap=MmapIntervalSetMapping(
            path.join(face_iset_dir, 'male_host.iset.bin')),
        female_host_isetmap=MmapIntervalSetMapping(
            path.join(face_iset_dir, 'female_host.iset.bin')),
        male_nonhost_isetmap=MmapIntervalSetMapping(
            path.join(face_iset_dir, 'male_nonhost.iset.bin')),
        female_nonhost_isetmap=MmapIntervalSetMapping(
            path.join(face_iset_dir, 'female_nonhost.iset.bin')))
    return face_intervals


def _sanitize_name(name):
    return re.sub(r'[^\w\- :]', r'', name)


MIN_NAME_TOKEN_LEN = 3


def _load_person_intervals(
        data_dir: str,
        caption_data: CaptionDataContext,
        min_person_screen_time: int
) -> Dict[str, PersonIntervals]:

    def parse_person_file_prefix(fname: str) -> str:
        return path.splitext(path.splitext(fname)[0])[0]

    person_ilist_dir = path.join(data_dir, 'people')
    person_iset_dir = path.join(data_dir, 'derived', 'people')
    person_file_prefixes = {
        parse_person_file_prefix(person_file)
        for person_file in os.listdir(person_ilist_dir)
    }

    skipped_count = 0
    skipped_time = 0.
    skipped_counter = Counter()
    all_person_intervals = []
    for person_file_prefix in person_file_prefixes:
        person_name = _sanitize_name(person_file_prefix)
        person_name_lower = person_name.lower()

        person_iset_path = path.join(
            person_iset_dir, person_file_prefix + '.iset.bin')
        person_ilist_path = path.join(
            person_ilist_dir, person_file_prefix + '.ilist.bin')
        try:
            # Heuristic to filter out people who cannot pass the threshold
            # This assumes a 3s sample rate and assigns 3s for each 8 bytes of
            # interval file as a prefilter for whether to open the file or not.
            if os.path.getsize(person_ilist_path) / 4 / 2 * 3 < min_person_screen_time:
                skipped_counter[person_name_lower] = min_person_screen_time
                skipped_count += 1
                skipped_time += min_person_screen_time
                continue

            person_ilist_map = MmapIntervalListMapping(person_ilist_path, 1)
            person_isetmap = (
                MmapIntervalSetMapping(person_iset_path)
                if os.path.isfile(person_iset_path) else
                MmapIListToISetMapping(person_ilist_map, 0, 0, 3000, 100))

            person_time = person_isetmap.sum() / 1000
            if (
                    person_time < min_person_screen_time
            ):
                skipped_count += 1
                skipped_time += person_time
                skipped_counter[person_name_lower] = person_time
                continue

            person_intervals = PersonIntervals(
                name=person_name, ilistmap=person_ilist_map,
                isetmap=person_isetmap, screen_time_seconds=person_time)
            all_person_intervals.append((person_name_lower, person_intervals))
        except Exception as e:
            print('Unable to load: {} - {}'.format(person_name, e))
            skipped_count += 1

    print('  Loaded intervals for {} people. Skipped {}, totaling {}h.'.format(
          len(all_person_intervals), skipped_count, int(skipped_time) / 3600))

    if len(skipped_counter) > 0:
        print('  Skipped people with largest time:')
        for k, v in skipped_counter.most_common(25):
            print('    {}: {}s'.format(k, int(v)))

    all_person_intervals.sort()
    return OrderedDict(all_person_intervals)


def sanitize_tag(tag: str) -> str:
    tag = re.sub(r'\W+', '', tag.lower())
    # FIXME: this avoids a conflict with the presenter tag
    if tag in GLOBAL_TAGS:
        tag = 'tv_' + tag
    return tag


def _load_person_metadata(data_dir: str, all_people: Set[str]) -> AllPersonTags:
    """Read in metadata attributes on individuals"""

    person_metadata_path = path.join(data_dir, 'people.metadata.json')
    person_to_tags = {}
    if os.path.exists(person_metadata_path):
        with open(person_metadata_path) as f:
            for name, tags in json.load(f).items():
                filtered_tags = []
                for tag, tag_source in tags:
                    tag = sanitize_tag(tag)
                    if (
                            len(tag) > MIN_PERSON_ATTRIBUTE_LEN
                            and len(tag) < MAX_PERSON_ATTRIBUTE_LEN
                    ):
                        filtered_tags.append(Tag(tag, tag_source))
                name_lower = name.lower()

                if name_lower in all_people:
                    person_to_tags[name_lower] = filtered_tags
    else:
        print('No person tags found. Skipping.')
    return AllPersonTags(person_to_tags)


def _load_tag_intervals(data_dir: str) -> Dict[str, MmapIntervalListMapping]:
    tag_ilist_dir = os.path.join(data_dir, 'derived', 'tags')

    def parse_tag_name(fname: str) -> str:
        return path.splitext(path.splitext(fname)[0])[0]

    tag_to_intervals = {}
    if os.path.isdir(tag_ilist_dir):
        for tag_file in os.listdir(tag_ilist_dir):
            tag_path = os.path.join(tag_ilist_dir, tag_file)
            tag = sanitize_tag(parse_tag_name(tag_file))
            tag_to_intervals[tag] = MmapIntervalListMapping(tag_path, 1)
    return tag_to_intervals


def load_caption_data(index_dir: str) -> CaptionDataContext:
    """Load the captions"""

    documents = Documents.load(path.join(index_dir, 'documents.txt'))
    lexicon = Lexicon.load(path.join(index_dir, 'lexicon.txt'),
                           lazy_lemmas=False)
    index = CaptionIndex(path.join(index_dir, 'index.bin'),
                         lexicon, documents)

    # Convert the document names so that they match the video names
    documents = Documents([
        d._replace(name=get_video_name(d.name)) for d in documents])
    documents.configure(path.join(index_dir, 'data'))
    return CaptionDataContext(
        index, documents, lexicon, {d.name: d for d in documents})


def _load_hosts(host_file):
    hosts = defaultdict(set)
    if os.path.exists(host_file):
        with open(host_file) as fp:
            reader = csv.DictReader(fp)
            for row in reader:
                host_name = _sanitize_name(row['name']).lower()
                channel_name = row['channel']
                hosts[host_name].add(channel_name)
    return hosts


def load_app_data(
        index_dir: str,
        data_dir: str,
        tz: timezone,
        min_person_screen_time: int
) -> Tuple[CaptionDataContext, VideoDataContext]:
    """Load all of the site's static data"""

    print('Loading caption index: please wait...')
    caption_data = load_caption_data(index_dir)

    print('Loading video data: please wait...')
    videos = load_videos(data_dir, tz)

    n_videos_with_captions = sum(1 for d in caption_data.documents
                                 if d.name in videos)
    print('  {} / {} videos have captions'.format(
        n_videos_with_captions, len(videos)))

    print('Loading commercial intervals: please wait...')
    commercials = MmapIntervalSetMapping(
        path.join(data_dir, 'commercials.iset.bin'))

    print('Loading face intervals: please wait...')
    face_intervals = _load_face_intervals(data_dir)
    all_person_intervals = _load_person_intervals(
        data_dir, caption_data, min_person_screen_time)

    print('Loading person metadata tags: please wait...')
    all_person_tags = _load_person_metadata(
        data_dir, set(all_person_intervals.keys()))

    print('Loading cached tag intervals: please wait...')
    cached_tag_intervals = _load_tag_intervals(data_dir)

    print('Loading host list: please wait...')
    host_to_channels = _load_hosts(path.join(data_dir, 'hosts.csv'))

    print('Done loading data!')
    return (caption_data,
            VideoDataContext(
                videos, {v.id: v for v in videos.values()},
                commercials, face_intervals, all_person_intervals,
                all_person_tags, cached_tag_intervals, host_to_channels))
