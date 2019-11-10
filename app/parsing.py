import json
from datetime import datetime
from pytz import timezone
from typing import Optional, Set, Tuple, NamedTuple, List

from .types import JsonObject
from .error import InvalidUsage


def load_json(file_path: str) -> JsonObject:
    with open(file_path, 'rb') as f:
        return json.load(f)


def parse_date(s: Optional[str]) -> Optional[datetime]:
    return datetime.strptime(s, '%Y-%m-%d') if s else None


def format_date(d: datetime) -> str:
    return d.strftime('%Y-%m-%d')


UTC = timezone('UTC')
ET = timezone('US/Eastern')
DATE_FORMAT = '%Y-%m-%d'


def parse_date_from_video_name(p, tz=ET) -> Tuple[datetime, int]:
    channel, ymd, hms = p.split('_', 3)[:3]
    timestamp = datetime.strptime(ymd + hms, '%Y%m%d%H%M%S')
    timestamp_et = timestamp.replace(tzinfo=UTC).astimezone(tz=ET)
    assert timestamp.hour != timestamp_et.hour
    return (parse_date(timestamp_et.strftime(DATE_FORMAT)),
            timestamp_et.hour * 60 + timestamp_et.minute)


def parse_hour_set(s: str) -> Set[int]:
    result: Set[int] = set()
    for t in s.strip().split(','):
        t = t.strip()
        if t == '':
            continue
        elif '-' in t:
            t0_str, t1_str = t.split('-', 1)
            t0 = int(t0_str.strip())
            t1 = int(t1_str.strip())
            if t0 >= 0 and t0 <= 23 and t1 >= 0 and t1 <= 23:
                result.update(range(t0, t1 + 1))
            else:
                raise InvalidUsage('invalid hour range: {}'.format(t))
        else:
            t0 = int(t)
            if t0 >= 0 and t0 <= 23:
                result.add(t0)
            else:
                raise InvalidUsage('invalid hour: {}'.format(t))
    return result if result else None


DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']


def parse_day_of_week_set(s: str) -> Set[int]:
    result: Set[int] = set()
    for t in s.strip().split(','):
        t = t.strip()
        t_low = t.lower()
        try:
            if t_low == '':
                continue
            elif '-' in t:
                t0, t1 = t_low.split('-', 1)
                result.update(range(
                    DAYS_OF_WEEK.index(t0.strip()) + 1,
                    DAYS_OF_WEEK.index(t1.strip()) + 2))
            else:
                result.add(DAYS_OF_WEEK.index(t_low) + 1)
        except ValueError:
            raise InvalidUsage('invalid day of week: {}'.format(t))
    return result if result else None


class PersonTags(NamedTuple):
    tags: Set[str]
    join_op: str


def parse_tags(s: str) -> PersonTags:
    return PersonTags(tags={t.strip() for t in s.split(',')}, join_op='AND')
