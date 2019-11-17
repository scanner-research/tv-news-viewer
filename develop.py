#!/usr/bin/env python3
"""
Run a development server
"""

import argparse
from typing import Optional
from datetime import datetime

from app.core import build_app
from app.types import Ternary


DEFAULT_VIDEO_ENDPOINT = 'https://storage.cloud.google.com/esper'
ARCHIVE_VIDEO_ENDPOINT = 'https://archive.org/download'


def get_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('-p', '--port', default=8080,
                        help='Server port. Default: 8080')
    parser.add_argument('--data', dest='data_dir', default='data',
                        help='Directory of video metadata. Default: data')
    parser.add_argument('--index', dest='index_dir', default='index',
                        help='Directory of caption index. Default: index')
    parser.add_argument('--frameserver', dest='frameserver_endpoint', type=str,
                        help='Frameserver URL and path')
    parser.add_argument('--videos', dest='video_endpoint', type=str,
                        default=DEFAULT_VIDEO_ENDPOINT,
                        help='Video server URL and path')
    return parser.parse_args()


def main(
    port: int, data_dir: str, index_dir: str, video_endpoint: str,
    frameserver_endpoint: Optional[str],
) -> None:
    """Run a debugging server"""
    app = build_app(
        data_dir, index_dir, video_endpoint, frameserver_endpoint,
        ARCHIVE_VIDEO_ENDPOINT,
        min_date=datetime(2010, 1, 1),
        max_date=datetime(2019, 7, 31),
        min_person_screen_time=600,
        default_aggregate_by='month',
        default_text_window=0,
        default_is_commercial=Ternary.false,
        data_version='dev')
    app.run(port=port, debug=True)


if __name__ == '__main__':
    main(**vars(get_args()))
