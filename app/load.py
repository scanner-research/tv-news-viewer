import math
import os
from os import path
from pathlib import Path

from captions import CaptionIndex, Documents, Lexicon   # type: ignore
from rs_intervalset import (                            # type: ignore
    MmapIntervalSetMapping, MmapIntervalListMapping)

from .types import *
from .parsing import *


def get_video_name(s: str) -> str:
    return Path(s).name.split('.')[0]


def load_video_data(data_dir: str) -> Tuple[
    Dict[str, Video],
    MmapIntervalSetMapping,
    FaceIntervals,
    AllPersonIntervals
]:
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

    def parse_person_name(fname: str) -> str:
        return fname.split('.', 1)[0]

    person_ilist_dir = path.join(data_dir, 'people')
    person_iset_dir = path.join(data_dir, 'derived', 'people')
    person_names = {
        parse_person_name(person_file)
        for person_file in os.listdir(person_ilist_dir)
    }
    all_person_intervals = {
        person_name: PersonIntervals(
            ilistmap=MmapIntervalListMapping(
                path.join(person_ilist_dir, person_name + '.ilist.bin'), 1),
            isetmap=MmapIntervalSetMapping(
                path.join(person_iset_dir, person_name + '.iset.bin'))
        ) for person_name in person_names
    }
    return videos, commercials, face_intervals, all_person_intervals


def load_index(index_dir: str) -> Tuple[CaptionIndex, Documents, Lexicon]:
    print('Loading caption index: please wait...')
    documents = Documents.load(path.join(index_dir, 'docs.list'))
    lexicon = Lexicon.load(path.join(index_dir, 'words.lex'),
                           lazy_lemmas=False)
    index = CaptionIndex(path.join(index_dir, 'index.bin'),
                         lexicon, documents)
    return index, documents, lexicon
