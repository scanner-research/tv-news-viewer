from datetime import datetime
from typing import Callable, Dict, List, Set, Tuple, NamedTuple, Union

from rs_intervalset import MmapIntervalSetMapping       # type: ignore


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
    man: MmapIntervalSetMapping
    woman: MmapIntervalSetMapping
    host: MmapIntervalSetMapping
    nonhost: MmapIntervalSetMapping
    man_host: MmapIntervalSetMapping
    man_nonhost: MmapIntervalSetMapping
    woman_host: MmapIntervalSetMapping
    woman_nonhost: MmapIntervalSetMapping


VideoFilterFn = Callable[[Video], bool]
AggregateFn = Callable[[datetime], datetime]
OnScreenFilterFn = Callable[[int, int], bool]
Number = Union[int, float]
Interval = Tuple[Number, Number]
Caption = Tuple[float, float, str]
JsonObject = Dict[str, object]
IdIntervals = Dict[str, MmapIntervalSetMapping]
