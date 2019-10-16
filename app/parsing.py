import json
from datetime import datetime
from typing import Optional, Set, Tuple, NamedTuple, List

from .types import *
from .error import InvalidUsage


def load_json(file_path: str) -> JsonObject:
    with open(file_path, 'rb') as f:
        return json.load(f)


def parse_date(s: Optional[str]) -> Optional[datetime]:
    return datetime.strptime(s, '%Y-%m-%d') if s else None


def format_date(d: datetime) -> str:
    return d.strftime('%Y-%m-%d')


def parse_hour_set(s: Optional[str]) -> Optional[Set[int]]:
    if s is None or not s.strip():
        return None
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


def parse_day_of_week_set(s: Optional[str]) -> Optional[Set[int]]:
    if s is None or not s.strip():
        return None
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
    tags: List[str]
    join_op: str


class FaceFilter(NamedTuple):
    all: bool
    people: Optional[Set[str]] = None
    tags: Optional[Set[str]] = None
    tags_join_op: Optional[str] = None


def parse_face_filter_str(s: str) -> FaceFilter:
    if s == '':
        raise InvalidUsage('Face filter cannot be blank')
    if s.lower() != 'all':
        people = None
        tags = None
        for kv in s.split(','):
            kv = kv.strip()
            try:
                k, v = kv.split(':', 1)
                k = k.strip()
                v = v.strip()
                if k == 'person':
                    tmp = {x.strip() for x in v.split('&')}
                    if people:
                        people |= tmp
                    else:
                        people = tmp
                elif k == 'tag':
                    tmp = {x.strip() for x in v.split('&')}
                    if tags:
                        tags |= tmp
                    else:
                        tags = tmp
                else:
                    raise InvalidUsage('Invalid face filter: {}'.format(k))
            except:
                raise InvalidUsage('Failed to parse face filter: {}'.format(kv))
        return FaceFilter(False, people, tags)
    else:
        return FaceFilter(True)
