"""
WSGI entry point

Example use:
    pip3 install uwsgi
    uwsgi --socket 0.0.0.0:80 --protocol=http -w wsgi:app -p 8
"""

import json
from server import build_app

CONFIG_FILE = 'config.json'

with open(CONFIG_FILE) as f:
    config = json.load(f)

app = build_app(
    config['data_dir'], config['index_dir'],
    config.get('frameserver_endpoint'),
    config.get('cache_seconds', 30 * 24 * 3600))
