import json
import re
from datetime import datetime
from pytz import timezone
from typing import Optional, Set, Tuple, NamedTuple, List

from .types_backend import JsonObject
from .error import InvalidUsage


def load_json(file_path: str) -> JsonObject:
    with open(file_path, 'rb') as f:
        return json.load(f)


def parse_date(s: Optional[str]) -> Optional[datetime]:
    return datetime.strptime(s, '%Y-%m-%d') if s else None


def format_date(d: datetime) -> str:
    return d.strftime('%Y-%m-%d')


UTC = timezone('UTC')
DATE_FORMAT = '%Y-%m-%d'


def parse_date_from_video_name(p: str, tz: timezone) -> Tuple[datetime, int]:
    channel, ymd, hms = p.split('_', 3)[:3]
    timestamp = datetime.strptime(ymd + hms, '%Y%m%d%H%M%S')
    timestamp_et = timestamp.replace(tzinfo=UTC).astimezone(tz=tz)
    assert timestamp.hour != timestamp_et.hour
    return (parse_date(timestamp_et.strftime(DATE_FORMAT)),
            timestamp_et.hour * 60 + timestamp_et.minute)


HOUR_RE = re.compile(r'(\d+)(?:-(\d+))?')


def parse_hour_set(s: str) -> Set[int]:
    result = None
    m = HOUR_RE.match(s)
    if m:
        h0 = int(m[1])
        if h0 < 24:
            if m[2]:
                h1 = int(m[2])
                if h0 < h1 and h1 <= 23:
                    result = set(range(h0, h1 + 1))
            else:
                result = {h0}
    if result is None:
        raise InvalidUsage('Invalid hour filter:'.format(s))
    return result


DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
DAY_OF_WEEK_RE = re.compile(r'(\w{3})(?:-(\w{3}))?')


def parse_day_of_week_set(s: str) -> Set[int]:
    result = None
    m = DAY_OF_WEEK_RE.match(s)
    if m:
        try:
            d0 = m[1].lower()
            d0_idx = DAYS_OF_WEEK.index(d0.strip())
            if m[2]:
                d1 = m[2].lower()
                d1_idx = DAYS_OF_WEEK.index(d0.strip())
                if d0_idx < d1_idx:
                    result = set(range(d0_idx + 1, d1_idx + 2))
            else:
                result = {d0_idx + 1}
        except ValueError:
            pass
    if result is None:
        raise InvalidUsage('invalid day of week filter: {}'.format(s))
    return result


class ParsedTags(NamedTuple):
    tags: Set[str]
    join_op: str


def parse_tags(s: str) -> ParsedTags:
    return ParsedTags(tags={t.strip() for t in s.split(',')}, join_op='AND')
