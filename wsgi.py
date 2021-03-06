"""
WSGI entry point

Example use:
    pip3 install uwsgi
    uwsgi --socket 0.0.0.0:80 --protocol=http -w wsgi:app -p 8
"""

import json
from datetime import datetime
from pytz import timezone
from app.core import build_app
from app.types_frontend import Ternary

CONFIG_FILE = 'config.json'

DEFAULT_MIN_DATE = [2010, 1, 1]
DEFAULT_MAX_DATE = [2030, 1, 1]

DEFAULT_TIME_ZONE = 'US/Eastern'

DEFAULT_MIN_PERSON_SCREEN_TIME = 10 * 60
DEFAULT_MIN_PERSON_AUTOCOMPETE_SCREEN_TIME = 10 * 60 * 60

DEFAULT_HIDE_GENDER = True
DEFAULT_HIDE_PERSON_TAGS = False

DEFAULT_IS_COMMERCIAL = Ternary.false

DEFAULT_AGGREGATE_BY = 'month'
DEFAULT_TEXT_WINDOW = 0

DEFAULT_ALLOW_SHARING = True

with open(CONFIG_FILE) as f:
    config = json.load(f)

options = config.get('options', {})

app = build_app(
    config['data_dir'], config['index_dir'],
    config.get('video_endpoint'),
    config.get('video_auth_endpoint'),
    fallback_to_archive=True,
    static_bbox_endpoint=config.get('static_bbox_endpoint'),
    static_caption_endpoint=config.get('static_caption_endpoint'),
    host=config.get('host'),
    min_date=datetime(*options.get('min_date', DEFAULT_MIN_DATE)),
    max_date=datetime(*options.get('max_date', DEFAULT_MAX_DATE)),
    tz=timezone(options.get('timezone', DEFAULT_TIME_ZONE)),
    person_whitelist_file=options.get('person_whitelist_file'),
    min_person_screen_time=options.get(
        'min_person_screen_time',
        DEFAULT_MIN_PERSON_SCREEN_TIME),
    min_person_autocomplete_screen_time=options.get(
        'min_person_autocomplete_screen_time',
        DEFAULT_MIN_PERSON_AUTOCOMPETE_SCREEN_TIME),
    hide_gender=options.get('hide_gender', DEFAULT_HIDE_GENDER),
    hide_person_tags=options.get(
        'hide_person_tags', DEFAULT_HIDE_PERSON_TAGS),
    default_aggregate_by=options.get(
        'default_aggregate_by', DEFAULT_AGGREGATE_BY),
    default_text_window=options.get(
        'default_text_window', DEFAULT_TEXT_WINDOW),
    default_is_commercial=options.get(
        'default_is_commercial', DEFAULT_IS_COMMERCIAL),
    allow_sharing=options.get('allow_sharing', DEFAULT_ALLOW_SHARING),
    data_version=config.get('data_version'),
    show_uptime=config.get('show_uptime', False))
del config
del options
