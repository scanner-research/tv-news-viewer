import math
import re
import os
import json
from os import path
from pathlib import Path
from typing import NamedTuple, Dict

from captions import CaptionIndex, Documents, Lexicon   # type: ignore
from rs_intervalset import (                            # type: ignore
    MmapIntervalSetMapping, MmapIntervalListMapping)

from .types import *
from .parsing import *


MAX_PERSON_ATTRIBUTE_LEN = 50
MIN_PERSON_ATTRIBUTE_LEN = 3


def get_video_name(s: str) -> str:
    s = Path(s).name
    if s.endswith('.word.srt'):
        return s[:-len('.word.srt')]
    else:
        return os.path.splitext(s)[0]


class VideoDataContext(NamedTuple):
    """Wrapper object for video data"""
    video_dict: Dict[str, Video]
    commercial_isetmap: MmapIntervalSetMapping
    face_intervals: FaceIntervals
    all_person_intervals: AllPersonIntervals
    all_person_tags: AllPersonTags


class CaptionDataContext(NamedTuple):
    """Wrapper object for caption data"""
    index: CaptionIndex
    documents: Documents
    lexicon: Lexicon


def load_video_data(data_dir: str) -> VideoDataContext:
    print('Loading video data: please wait...')
    videos = {}
    for v in load_json(path.join(data_dir, 'videos.json')):
        (
            id,
            name,
            show,
            channel,
            date_str,
            minute,
            num_frames,
            fps,
            width,
            height
        ) = v
        name = get_video_name(name)
        date = parse_date(date_str)
        assert date is not None
        dayofweek = date.isoweekday()  # Mon == 1, Sun == 7
        videos[name] = Video(
            id=id, name=name, show=show, channel=channel,
            date=date, dayofweek=dayofweek, hour=math.floor(minute / 60),
            num_frames=num_frames, fps=fps, width=width, height=height
        )

    commercials = MmapIntervalSetMapping(
        path.join(data_dir, 'commercials.iset.bin'))

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

    def parse_person_file_prefix(fname: str) -> str:
        return path.splitext(path.splitext(fname)[0])[0]

    person_ilist_dir = path.join(data_dir, 'people')
    person_iset_dir = path.join(data_dir, 'derived', 'people')
    person_file_prefixes = {
        parse_person_file_prefix(person_file)
        for person_file in os.listdir(person_ilist_dir)
    }

    all_person_intervals = {}
    for person_file_prefix in person_file_prefixes:
        person_name = re.sub(r'[^\w :]', r'', person_file_prefix.lower())
        try:
            person_intervals = PersonIntervals(
                ilistmap=MmapIntervalListMapping(
                    path.join(
                        person_ilist_dir,
                        person_file_prefix + '.ilist.bin'), 1),
                isetmap=MmapIntervalSetMapping(
                    path.join(
                        person_iset_dir,
                        person_file_prefix + '.iset.bin')))
            all_person_intervals[person_name] = person_intervals
        except Exception as e:
            print('Unable to load: {} - {}'.format(person_name, e))

    # FIXME: remove AWS options
    has_aws = any(p.startswith('aws ') for p in all_person_intervals)

    with open(path.join(data_dir, 'people.wikidata.json')) as f:
        raw_person_tags = {}
        for name, tags in json.load(f).items():
            filtered_tags = []
            for tag in tags:
                tag = re.sub(r'\W+', '', tag.lower())
                if (
                    len(tag) > MIN_PERSON_ATTRIBUTE_LEN
                    and len(tag) < MAX_PERSON_ATTRIBUTE_LEN
                ):
                    filtered_tags.append(tag)
            name_lower = name.lower()

            # FIXME: remove AWS options
            if has_aws:
                name_lower = 'aws ' + name_lower

            if name_lower in all_person_intervals:
                raw_person_tags[name_lower] = filtered_tags
        all_person_tags = AllPersonTags(raw_person_tags)

    return VideoDataContext(
        videos, commercials, face_intervals, all_person_intervals,
        all_person_tags)


def load_index(index_dir: str) -> CaptionDataContext:
    print('Loading caption index: please wait...')
    documents = Documents.load(path.join(index_dir, 'docs.list'))
    lexicon = Lexicon.load(path.join(index_dir, 'words.lex'),
                           lazy_lemmas=False)
    index = CaptionIndex(path.join(index_dir, 'index.bin'),
                         lexicon, documents)
    return CaptionDataContext(index, documents, lexicon)
