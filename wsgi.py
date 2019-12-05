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

with open(CONFIG_FILE) as f:
    config = json.load(f)

options = config.get('options', {})

app = build_app(
    config['data_dir'], config['index_dir'],
    config.get('video_endpoint'), config.get('frameserver_endpoint'),
    min_date=datetime(*options.get('min_date', [2010, 1, 1])),
    max_date=datetime(*options.get('max_date', [2019, 7, 31])),
    tz=timezone(options.get('timezone', 'US/Eastern')),
    min_person_screen_time=options.get('min_person_screen_time', 600),
    default_aggregate_by=options.get('default_aggregate_by', 'month'),
    default_text_window=options.get('default_text_window', 0),
    default_is_commercial=options.get('default_is_commercial', Ternary.false),
    default_serve_from_archive=True,
    data_version=config.get('data_version'))
del config
del options
