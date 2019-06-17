"""
WSGI entry point

Example use:
    pip3 install uwsgi
    uwsgi --socket 0.0.0.0:80 --protocol=http -w wsgi:app -p 8
"""

import json
from app.core import build_app
from app.types import LoginCredentials
from app.hash import sha256

CONFIG_FILE = 'config.json'

with open(CONFIG_FILE) as f:
    config = json.load(f)

if 'username' in config:
    credentials = LoginCredentials(
        config.get('username'), sha256(config.get('password')))
else:
    credentials = None

app = build_app(
    config['data_dir'], config['index_dir'],
    config.get('video_endpoint'), config.get('frameserver_endpoint'),
    config.get('cache_seconds', 30 * 24 * 3600),
    credentials)
del config
