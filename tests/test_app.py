"""
Test suite to ensure codepath coverage
"""

import json
import os
import pytest
import random
from urllib.parse import urlencode
from typing import Dict, List, Optional
from flask import Response
from flask.testing import FlaskClient

from app.core import build_app


CONFIG_FILE = os.path.join(os.path.dirname(os.path.realpath(__file__)),
                           '..', 'config.json')


@pytest.fixture(scope='module')
def client():
    """Dummy up a client with the default config"""
    with open(CONFIG_FILE) as f:
        config = json.load(f)

    flask_app = build_app(
        config['data_dir'], config['index_dir'],
        config.get('frameserver_endpoint'),
        config.get('cache_seconds', 30 * 24 * 3600))

    with flask_app.test_client() as test_client:
        yield test_client


def _is_ok(response: Response) -> None:
    assert response.status_code == 200


def _is_bad(response: Response) -> None:
    assert response.status_code >= 400 and response.status_code < 500


# Basic tests


def test_get_pages(client: FlaskClient) -> None:
    """Make sure the page templates can be rendered"""
    _is_ok(client.get('/'))
    _is_ok(client.get('/embed'))
    _is_ok(client.get('/videos'))

    # test non-existent path
    _is_bad(client.get('/badpage'))


def test_get_data(client: FlaskClient) -> None:
    """Make sure the we can retreive basic data"""
    _is_ok(client.get('/shows'))
    _is_ok(client.get('/people'))


# Search tests


def _search(client: FlaskClient, params: Dict[str, Optional[str]]) -> None:
    param_str = urlencode({k: v for k, v in params.items() if v is not None})
    query_str = '/search?' + param_str
    print('GET', query_str)
    assert client.get(query_str).status_code == 200, \
        'Failed: {}'.format(repr(params))


def _comibination_search(
    client: FlaskClient, n: int,
    param_options: Dict[str, List[Optional[str]]],
) -> None:
    """Enumerate combinations of params_options"""
    num_combos = 1
    for v in param_options.values():
        num_combos *= len(v)

    print('Testing {} of {} possible combinations'.format(n, num_combos))
    keys = list(sorted(param_options))
    params = {}
    for i in random.sample(range(num_combos), min(n, num_combos)):
        for k in keys:
            idx = i % len(param_options[k])
            params[k] = param_options[k][idx]
            i = int(i / len(param_options[k]))
        assert i == 0
        _search(client, params)


def test_count_mentions(client: FlaskClient) -> None:
    _comibination_search(client, 100, {
        'count': ['mentions'],
        # General options
        'start_date': [None, '2017-01-01'],
        'end_date': [None, '2018-01-01'],
        'normalize': ['true', 'false'],
        'aggregate': ['year', 'month', 'week', 'day'],
        'text': ['united states of america'],
        'channel': [None, 'CNN', 'FOXNEWS', 'MSNBC'],
        'show': [None, 'The Situaton Room'],
        'hour': [None, '9-5', '5', '5,6', '5-6,7-8'],
        'dayofweek': [None, 'mon-wed', 'sat', 'sat-sun', 'sat,sun'],
        'commercial.none': [None, 'false', 'true'],
        'onscreen.face': [None, 'female+host', 'female', 'all'],
        'onscreen.person': [None, 'wolf blitzer']
    })


def test_count_face_time(client: FlaskClient) -> None:
    _comibination_search(client, 100, {
        'count': ['facetime'],
        'gender': [None, 'female'],
        'role': [None, 'host'],
        # General options
        'start_date': [None, '2017-01-01'],
        'end_date': [None, '2018-01-01'],
        'normalize': ['true', 'false'],
        'aggregate': ['year', 'month', 'week', 'day'],
        'text': [None, 'united states of america'],
        'channel': [None, 'CNN', 'FOXNEWS', 'MSNBC'],
        'show': [None, 'The Situaton Room'],
        'hour': [None, '9-5', '5', '5,6', '5-6,7-8'],
        'dayofweek': [None, 'mon-wed', 'sat', 'sat-sun', 'sat,sun'],
        'commercial.none': [None, 'false', 'true'],
        'onscreen.face': [None, 'female+host', 'female', 'all'],
        'onscreen.person': [None, 'wolf blitzer'],
        'text.window': [None, '0', '15']
    })


def test_count_video_time(client: FlaskClient) -> None:
    _comibination_search(client, 100, {
        'count': ['videotime'],
        # General options
        'start_date': [None, '2017-01-01'],
        'end_date': [None, '2018-01-01'],
        'normalize': ['true', 'false'],
        'aggregate': ['year', 'month', 'week', 'day'],
        'text': [None, 'united states of america'],
        'channel': [None, 'CNN', 'FOXNEWS', 'MSNBC'],
        'show': [None, 'The Situaton Room'],
        'hour': [None, '9-5', '5', '5,6', '5-6,7-8'],
        'dayofweek': [None, 'mon-wed', 'sat', 'sat-sun', 'sat,sun'],
        'commercial.none': [None, 'false', 'true'],
        'onscreen.face': [None, 'female+host', 'female', 'all'],
        'onscreen.person': [None, 'wolf blitzer'],
        'text.window': [None, '0', '15']
    })


# Search within a video tests


def test_search_video_mentions(client: FlaskClient) -> None:
    raise NotImplementedError()


def test_search_video_face_time(client: FlaskClient) -> None:
    raise NotImplementedError()


def test_search_video_video_time(client: FlaskClient) -> None:
    raise NotImplementedError()
