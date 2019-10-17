from datetime import datetime
from enum import Enum
from typing import Callable, Dict, List, Set, Tuple, NamedTuple, Union

from rs_intervalset import MmapIntervalSetMapping, MmapIntervalListMapping  # type: ignore


class Aggregate(Enum):
    day = 'day'
    week = 'week'
    month = 'month'
    year = 'year'


class Countable(Enum):
    videotime = 'screen time'


class Ternary(Enum):
    true = 'true'
    false = 'false'
    both = 'both'


class SearchParameter:
    count = 'count'
    aggregate = 'aggregate'
    start_date = 'start_date'
    end_date = 'end_date'
    detailed = 'detailed'

    video = 'video'
    channel = 'channel'
    show = 'show'
    hour = 'hour'
    day_of_week = 'dayofweek'

    onscreen_face = 'face'
    onscreen_numfaces = 'face.count'

    caption_text = 'transcript'
    caption_window = 'transcript.window'

    is_commercial = 'iscommercial'

    video_ids = 'ids'

    alias = 'seriesname'


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
    all_ilistmap: MmapIntervalListMapping
    num_faces_ilistmap: MmapIntervalListMapping

    all_isetmap: MmapIntervalSetMapping
    male_isetmap: MmapIntervalSetMapping
    female_isetmap: MmapIntervalSetMapping
    host_isetmap: MmapIntervalSetMapping
    nonhost_isetmap: MmapIntervalSetMapping
    male_host_isetmap: MmapIntervalSetMapping
    male_nonhost_isetmap: MmapIntervalSetMapping
    female_host_isetmap: MmapIntervalSetMapping
    female_nonhost_isetmap: MmapIntervalSetMapping


class PersonIntervals(NamedTuple):
    ilistmap: MmapIntervalListMapping
    isetmap: MmapIntervalSetMapping


class LoginCredentials(NamedTuple):
    username: str
    password_hash: bytes


class AllPersonTags(object):

    def __init__(self, name_to_tags: Dict[str, List[str]]):
        self._name_to_tags = name_to_tags
        tag_to_names = {}
        for k, vs in sorted(name_to_tags.items()):
            for v in vs:
                if v not in tag_to_names:
                    tag_to_names[v] = []
                tag_to_names[v].append(k)
        self._tag_to_names = tag_to_names

    def tag_to_names(self, tag: str) -> List[str]:
        return self._tag_to_names.get(tag)

    def name_to_tags(self, name: str) -> List[str]:
        return self._name_to_tags.get(name, [])

    @property
    def tags(self) -> List[str]:
        ret = list(self._tag_to_names.keys())
        ret.sort()
        return ret

    @property
    def tag_dict(self) -> Dict[str, List[str]]:
        return self._tag_to_names


AllPersonIntervals = Dict[str, PersonIntervals]

Number = Union[int, float]
Interval = Tuple[Number, Number]
Caption = Tuple[float, float, str]
JsonObject = Dict[str, object]

VideoFilterFn = Callable[[Video], bool]
AggregateFn = Callable[[datetime], datetime]
