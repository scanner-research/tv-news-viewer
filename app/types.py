from datetime import datetime
from enum import Enum
from typing import Callable, Dict, List, Set, Tuple, NamedTuple, Union

from rs_intervalset import MmapIntervalSetMapping       # type: ignore


class Aggregate(Enum):
    day = 'day'
    week = 'week'
    month = 'month'
    year = 'year'


class Countable(Enum):
    mentions = 'caption occurences'
    facetime = 'face time'
    videotime = 'screen time'


class Ternary(Enum):
    true = 'true'
    false = 'false'
    both = 'both'


class SearchParameter(Enum):
    count = 'count'
    aggregate = 'aggregate'
    start_date = 'start_date'
    end_date = 'end_date'
    detailed = 'detailed'

    mention_text = 'text'

    face_gender = 'gender'
    face_role = 'role'
    face_person = 'person'

    channel = 'channel'
    show = 'show'
    hour = 'hour'
    day_of_week = 'dayofweek'
    onscreen_face = 'onscreen.face'
    onscreen_person = 'onscreen.person'
    caption_text = 'caption.text'
    caption_window = 'caption.window'
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
    all: MmapIntervalSetMapping
    male: MmapIntervalSetMapping
    female: MmapIntervalSetMapping
    host: MmapIntervalSetMapping
    nonhost: MmapIntervalSetMapping
    male_host: MmapIntervalSetMapping
    male_nonhost: MmapIntervalSetMapping
    female_host: MmapIntervalSetMapping
    female_nonhost: MmapIntervalSetMapping


PersonIntervals = Dict[str, MmapIntervalSetMapping]

Number = Union[int, float]
Interval = Tuple[Number, Number]
Caption = Tuple[float, float, str]
JsonObject = Dict[str, object]

VideoFilterFn = Callable[[Video], bool]
AggregateFn = Callable[[datetime], datetime]
OnScreenFilterFn = Callable[[int, int], bool]
FaceTimeAggregateFn = Callable[[Video, List[Interval]], float]
FaceTimeIntersectFn = Callable[[Video, List[Interval]], List[Interval]]
