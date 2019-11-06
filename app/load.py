import math
import re
import os
import json
import unidecode
from os import path
from collections import Counter
from pathlib import Path
from typing import NamedTuple, Dict, Set, Tuple

from captions import CaptionIndex, Documents, Lexicon       # type: ignore
from captions.query import Query                            # type: ignore
from rs_intervalset import (                                # type: ignore
    MmapIntervalSetMapping, MmapIntervalListMapping)
from rs_intervalset.wrapper import MmapIListToISetMapping   # type: ignore

from .types import (
    Video, FaceIntervals, PersonIntervals, Tag, AllPersonTags,
    AllPersonIntervals)
from .parsing import load_json, parse_date_from_video_name


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
    cached_tag_intervals: Dict[str, MmapIntervalListMapping]


class CaptionDataContext(NamedTuple):
    """Wrapper object for caption data"""
    index: CaptionIndex
    documents: Documents
    lexicon: Lexicon


def _load_videos(data_dir: str) -> Dict[str, Video]:
    videos = {}
    video_path = path.join(data_dir, 'videos.json')
    for v in load_json(video_path):
        (
            id,
            name,
            show,
            channel,
            num_frames,
            fps,
            width,
            height
        ) = v
        video_name = get_video_name(name)
        date, minute = parse_date_from_video_name(video_name)
        assert date is not None
        dayofweek = date.isoweekday()  # Mon == 1, Sun == 7
        videos[name] = Video(
            id=id, name=video_name, show=show, channel=channel,
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


AWS_NAME_PREFIX = 'aws '
MIN_NAME_TOKEN_LEN = 3


def _load_person_intervals(
    data_dir: str, caption_data: CaptionDataContext
) -> Dict[str, PersonIntervals]:

    def parse_person_file_prefix(fname: str) -> str:
        return path.splitext(path.splitext(fname)[0])[0]

    def check_person_name_in_lexicon(name: str) -> bool:
        if name.startswith(AWS_NAME_PREFIX):
            name = name[len(AWS_NAME_PREFIX):].strip()
        tokens = [t for t in name.split(' ') if len(t) > MIN_NAME_TOKEN_LEN]
        if len(tokens) == 0:
            return False
        for t in tokens:
            if (t.upper() not in caption_data.lexicon
                and unidecode.unidecode(t).upper() not in caption_data.lexicon
            ):
                return False
        return True

    person_ilist_dir = path.join(data_dir, 'people')
    person_iset_dir = path.join(data_dir, 'derived', 'people')
    person_file_prefixes = {
        parse_person_file_prefix(person_file)
        for person_file in os.listdir(person_ilist_dir)
    }

    skipped_count = 0
    skipped_time = 0.
    skipped_counter = Counter()
    all_person_intervals = {}
    for person_file_prefix in person_file_prefixes:
        person_name = re.sub(r'[^\w :]', r'', person_file_prefix)
        person_name_lower = person_name.lower()

        person_iset_path = path.join(
            person_iset_dir, person_file_prefix + '.iset.bin')
        person_ilist_path = path.join(
            person_ilist_dir, person_file_prefix + '.ilist.bin')
        try:
            person_ilist_map = MmapIntervalListMapping(person_ilist_path, 1)
            person_isetmap = (
                MmapIntervalSetMapping(person_iset_path)
                if os.path.isfile(person_iset_path) else
                MmapIListToISetMapping(person_ilist_map, 0, 0, 3000, 100))

            if not check_person_name_in_lexicon(person_name_lower):
                skipped_count += 1
                person_time = person_isetmap.sum() / 60000
                skipped_time += person_time
                skipped_counter[person_name_lower] = person_time
                continue

            person_intervals = PersonIntervals(
                name=person_name, ilistmap=person_ilist_map,
                isetmap=person_isetmap)
            all_person_intervals[person_name_lower] = person_intervals
        except Exception as e:
            print('Unable to load: {} - {}'.format(person_name, e))
            skipped_count += 1

    print('  Loaded intervals for {} people. Skipped {}, totaling {}m.'.format(
          len(all_person_intervals), skipped_count, int(skipped_time)))
    if len(skipped_counter) > 0:
        print('  Skipped people with largest time:')
        for k, v in skipped_counter.most_common(25):
            print('    {}: {}m'.format(k, int(v)))
    return all_person_intervals


def sanitize_tag(tag: str) -> str:
    return re.sub(r'\W+', '', tag.lower())


def _load_person_metadata(
    data_dir: str, all_people: Set[str]
) -> AllPersonTags:
    # FIXME: remove AWS options
    has_aws = any(p.startswith(AWS_NAME_PREFIX) for p in all_people)

    with open(path.join(data_dir, 'people.wikidata.json')) as f:
        person_to_tags = {}
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

            # FIXME: remove AWS options
            if has_aws:
                name_lower = AWS_NAME_PREFIX + name_lower

            if name_lower in all_people:
                person_to_tags[name_lower] = filtered_tags
        all_person_tags = AllPersonTags(person_to_tags)
    return all_person_tags


def _load_tag_intervals(data_dir: str) -> Dict[str, MmapIntervalListMapping]:
    tag_ilist_dir = os.path.join(data_dir, 'derived', 'tags')

    def parse_tag_name(fname: str) -> str:
        return path.splitext(path.splitext(fname)[0])[0]

    tag_to_intervals = {}
    for tag_file in os.listdir(tag_ilist_dir):
        tag_path = os.path.join(tag_ilist_dir, tag_file)
        tag = sanitize_tag(parse_tag_name(tag_file))
        tag_to_intervals[tag] = MmapIntervalListMapping(tag_path, 1)
    return tag_to_intervals


def load_caption_data(index_dir: str) -> CaptionDataContext:
    documents = Documents.load(path.join(index_dir, 'docs.list'))
    lexicon = Lexicon.load(path.join(index_dir, 'words.lex'),
                           lazy_lemmas=False)
    index = CaptionIndex(path.join(index_dir, 'index.bin'),
                         lexicon, documents)
    return CaptionDataContext(index, documents, lexicon)


def load_app_data(
    index_dir: str, data_dir: str
) -> Tuple[CaptionDataContext, VideoDataContext]:
    print('Loading caption index: please wait...')
    caption_data = load_caption_data(index_dir)

    print('Loading video data: please wait...')
    videos = _load_videos(data_dir)

    caption_data = caption_data._replace(
        documents=Documents([
            d._replace(name=get_video_name(d.name))
            for d in caption_data.documents])
    )
    n_videos_with_captions = sum(1 for d in caption_data.documents
                                 if d.name in videos)
    print('  {} / {} videos have captions'.format(
          n_videos_with_captions, len(videos)))

    print('Loading commercial intervals: please wait...')
    commercials = MmapIntervalSetMapping(
        path.join(data_dir, 'commercials.iset.bin'))

    print('Loading face intervals: please wait...')
    face_intervals = _load_face_intervals(data_dir)
    all_person_intervals = _load_person_intervals(data_dir, caption_data)

    print('Loading metadata tags: please wait...')
    all_person_tags = _load_person_metadata(
        data_dir, set(all_person_intervals.keys()))

    print('Loading cached tag intervals: please wait...')
    cached_tag_intervals = _load_tag_intervals(data_dir)

    print('Done loading data!')
    return (caption_data,
            VideoDataContext(
                videos, commercials, face_intervals, all_person_intervals,
                all_person_tags, cached_tag_intervals))
