#!/usr/bin/env python3
"""
Run a development server
"""

import argparse
from pytz import timezone
from typing import Optional

DEFAULT_VIDEO_AUTH_ENDPOINT = 'https://storage.cloud.google.com/esper/do_not_delete.jpg'
DEFAULT_VIDEO_ENDPOINT = 'https://storage.cloud.google.com/esper/tvnews/videos'
DEFAULT_INDEX_PATH = 'data/index'
DEFAULT_PORT = 8080


def get_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('-p', '--port', default=DEFAULT_PORT,
                        help='Server port. Default: {}'.format(DEFAULT_PORT))
    parser.add_argument('--data', dest='data_dir', default='data',
                        help='Directory of video metadata. Default: data')
    parser.add_argument('--index', dest='index_dir',
                        default=DEFAULT_INDEX_PATH,
                        help='Directory of caption index. Default: {}'.format(
                              DEFAULT_INDEX_PATH))
    parser.add_argument('--videos', dest='video_endpoint', type=str,
                        default=DEFAULT_VIDEO_ENDPOINT,
                        help='Video server URL and path')
    parser.add_argument('--vidauth', dest='video_auth_endpoint', type=str,
                        default=DEFAULT_VIDEO_AUTH_ENDPOINT,
                        help='URL to test to determine whether to serve full '
                             'videos or from the Internet Archive')
    parser.add_argument('--html-only', dest='html_only', action='store_true',
                        help='Run the server with only html template pages')
    parser.add_argument('--bind-all', action='store_true',
                        help='Serve on all network interfaces.')
    parser.add_argument('--autoreload', action='store_true',
                        help='Reload on code changes.')
    return parser.parse_args()


def main(
    port: int, data_dir: str, index_dir: str, video_endpoint: str,
    video_auth_endpoint: str, html_only: bool, bind_all: bool,
    autoreload: bool
) -> None:
    """Run a debugging server"""
    if not html_only:
        from datetime import datetime
        from app.core import build_app
        from app.types_frontend import Ternary

        app = build_app(
            data_dir, index_dir, video_endpoint, video_auth_endpoint,
            static_bbox_endpoint=None,
            static_caption_endpoint=None,
            host=None,
            min_date=datetime(2010, 1, 1),
            max_date=datetime(2029, 12, 31),
            tz=timezone('US/Eastern'),
            min_person_screen_time=0,
            min_person_autocomplete_screen_time=10 * 60 * 60,   # 10 hrs
            hide_person_tags=False,
            default_aggregate_by='month',
            default_text_window=0,                  # amount to dialate text intervals
            default_is_commercial=Ternary.false,    # exclude comercials
            default_serve_from_archive=True,        # link videos directly
            default_color_gender_bboxes=True,     # color code gender bboxes
            data_version='dev',
            show_uptime=True)
    else:
        from flask import Flask
        from app.route_html import add_html_routes

        app = Flask(__name__, template_folder='templates',
                    static_folder='static')
        add_html_routes(app, 0, 0, 0)

    kwargs = {'port': port, 'debug': autoreload}
    if bind_all:
        kwargs['host'] = '0.0.0.0'
    app.run(**kwargs)


if __name__ == '__main__':
    main(**vars(get_args()))
