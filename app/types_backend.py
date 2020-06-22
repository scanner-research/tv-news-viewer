"""
Data types used by the backend server.
"""

from datetime import datetime
from typing import Callable, Dict, List, Tuple, NamedTuple, Union


class Video(NamedTuple):
    id: int
    name: str
    show: str
    channel: str
    date: datetime
    dayofweek: int
    hour: int
    num_frames: int
    fps: float
    width: int
    height: int


class FaceIntervals(NamedTuple):
    all_ilistmap: 'MmapIntervalListMapping'
    num_faces_ilistmap: 'MmapIntervalListMapping'

    all_isetmap: 'MmapIntervalSetMapping'
    male_isetmap: 'MmapIntervalSetMapping'
    female_isetmap: 'MmapIntervalSetMapping'
    host_isetmap: 'MmapIntervalSetMapping'
    nonhost_isetmap: 'MmapIntervalSetMapping'
    male_host_isetmap: 'MmapIntervalSetMapping'
    male_nonhost_isetmap: 'MmapIntervalSetMapping'
    female_host_isetmap: 'MmapIntervalSetMapping'
    female_nonhost_isetmap: 'MmapIntervalSetMapping'


class PersonIntervals(NamedTuple):
    name: str
    ilistmap: 'MmapIntervalListMapping'
    isetmap: 'MmapIntervalSetMapping'
    screen_time_seconds: float


class Tag(NamedTuple):
    name: str
    source: str


class AllPersonTags(object):

    def __init__(self, name_to_tags: Dict[str, List[Tag]]):
        self._name_to_tags = name_to_tags
        tag_name_to_names = {}
        tag_to_names = {}
        for k, vs in sorted(name_to_tags.items()):
            for v in vs:
                if v.name not in tag_name_to_names:
                    tag_name_to_names[v.name] = []
                tag_name_to_names[v.name].append(k)
                if v not in tag_to_names:
                    tag_to_names[v] = []
                tag_to_names[v].append(k)
        self._tag_name_to_names = tag_name_to_names
        self._tag_to_names = tag_to_names

    def tag_name_to_names(self, tag: str) -> List[str]:
        return self._tag_name_to_names.get(tag)

    def name_to_tags(self, name: str) -> List[Tag]:
        return self._name_to_tags.get(name, [])

    @property
    def tag_dict(self) -> Dict[Tag, List[str]]:
        return self._tag_to_names

    @property
    def tag_name_dict(self) -> Dict[Tag, List[str]]:
        return self._tag_name_to_names


AllPersonIntervals = Dict[str, PersonIntervals]

Number = Union[int, float]
Interval = Tuple[Number, Number]
Caption = Tuple[float, float, str]
JsonObject = Dict[str, object]

VideoFilterFn = Callable[[Video], bool]
AggregateFn = Callable[[datetime], datetime]
