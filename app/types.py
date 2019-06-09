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
    mentions = 'transcript mentions'
    facetime = 'face time'
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

    mention_text = 'text'
    face = 'face'

    channel = 'channel'
    show = 'show'
    hour = 'hour'
    day_of_week = 'dayofweek'
    onscreen_face = 'onscreen.face'
    caption_text = 'transcript.text'
    caption_window = 'transcript.window'
    is_commercial = 'iscommercial'

    video_ids = 'ids'


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


AllPersonIntervals = Dict[str, PersonIntervals]

Number = Union[int, float]
Interval = Tuple[Number, Number]
Caption = Tuple[float, float, str]
JsonObject = Dict[str, object]

VideoFilterFn = Callable[[Video], bool]
AggregateFn = Callable[[datetime], datetime]
FaceTimeAggregateFn = Callable[[Video, List[Interval]], float]
FaceTimeIntersectFn = Callable[[Video, List[Interval]], List[Interval]]
