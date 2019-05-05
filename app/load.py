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
    MmapIntervalListMapping,
    FaceIntervals,
    PersonIntervals
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
        path.join(data_dir, 'commercials.bin'))

    all_faces = MmapIntervalListMapping(path.join(data_dir, 'faces.bin'), 1)

    face_dir = path.join(data_dir, 'face')
    face_intervals = FaceIntervals(
        all=MmapIntervalSetMapping(path.join(face_dir, 'all.bin')),
        male=MmapIntervalSetMapping(path.join(face_dir, 'male.bin')),
        female=MmapIntervalSetMapping(path.join(face_dir, 'female.bin')),
        host=MmapIntervalSetMapping(path.join(face_dir, 'host.bin')),
        nonhost=MmapIntervalSetMapping(path.join(face_dir, 'nonhost.bin')),
        male_host=MmapIntervalSetMapping(path.join(face_dir, 'male_host.bin')),
        female_host=MmapIntervalSetMapping(
            path.join(face_dir, 'female_host.bin')),
        male_nonhost=MmapIntervalSetMapping(
            path.join(face_dir, 'male_nonhost.bin')),
        female_nonhost=MmapIntervalSetMapping(
            path.join(face_dir, 'female_nonhost.bin')))

    def parse_person_name(fname: str) -> str:
        return fname.split('.', 1)[0]

    person_dir = path.join(data_dir, 'people')
    person_intervals = {
        parse_person_name(person_file): MmapIntervalSetMapping(
            path.join(person_dir, person_file))
        for person_file in os.listdir(person_dir)
    }
    return videos, commercials, all_faces, face_intervals, person_intervals


def load_index(index_dir: str) -> Tuple[CaptionIndex, Documents, Lexicon]:
    print('Loading caption index: please wait...')
    documents = Documents.load(path.join(index_dir, 'docs.list'))
    lexicon = Lexicon.load(path.join(index_dir, 'words.lex'),
                           lazy_lemmas=False)
    index = CaptionIndex(path.join(index_dir, 'index.bin'),
                         lexicon, documents)
    return index, documents, lexicon
