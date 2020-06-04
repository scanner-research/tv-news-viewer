"""
Data types shared by the frontend and backend.
"""

from enum import Enum


class Aggregate(Enum):
    day = 'day'
    week = 'week'
    month = 'month'
    year = 'year'


class Ternary(Enum):
    true = 'true'
    false = 'false'
    both = 'both'


class SearchKey:
    video = 'video'
    channel = 'channel'
    show = 'show'
    hour = 'hour'
    day_of_week = 'dayofweek'

    face_name = 'name'
    face_tag = 'tag'
    face_count = 'facecount'

    text = 'text'
    text_window = 'textwindow'


class SearchParam:
    aggregate = 'aggregate'
    start_date = 'start_date'
    end_date = 'end_date'
    detailed = 'detailed'

    is_commercial = 'is_commercial'

    query = 'query'
    video_ids = 'ids'


class GlobalTags:
    all = 'all'
    male = 'male'
    female = 'female'
    host = 'presenter'
    non_host = 'non_presenter'

GLOBAL_TAGS = {GlobalTags.all, GlobalTags.male, GlobalTags.female,
               GlobalTags.host, GlobalTags.non_host}
