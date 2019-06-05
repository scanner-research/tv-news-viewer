#!/usr/bin/env python3
"""
Run a development server
"""

import argparse
from typing import Optional

from app.core import build_app
from app.types import LoginCredentials


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
    return parser.parse_args()


def main(
    port: int, data_dir: str, index_dir: str,
    frameserver_endpoint: Optional[str]
) -> None:
    """Run a debugging server"""
    app = build_app(
        data_dir, index_dir, frameserver_endpoint, 0,
        LoginCredentials('admin', 'password'))
    app.run(port=port, debug=True)


if __name__ == '__main__':
    main(**vars(get_args()))
