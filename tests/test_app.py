"""
Test suite to ensure codepath coverage
"""

import json
import os
import pytest
import random
from urllib.parse import urlencode
from typing import Dict, List, Optional, Callable
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

ResponseFn = Callable[[Response, Dict[str, Optional[str]]], None]


def _test_get(
    client: FlaskClient, path: str, params: Dict[str, Optional[str]],
    response_fn: ResponseFn
) -> None:
    param_str = urlencode({k: v for k, v in params.items() if v is not None})
    query_str = path + '?' + param_str
    print('GET', query_str)
    response = client.get(query_str)
    response_fn(response, params)


def _combination_test_get(
    client: FlaskClient, path: str,
    param_options: Dict[str, List[Optional[str]]],
    response_fn: ResponseFn,
    n: Optional[int] = None,
) -> None:
    """Enumerate combinations of params_options"""
    num_combos = 1
    for v in param_options.values():
        num_combos *= len(v)

    if n is None:
        print('Testing {} possible combinations'.format(num_combos))
    else:
        print('Testing {} of {} possible combinations'.format(
              min(n, num_combos), num_combos))

    keys = list(sorted(param_options))
    params = {}
    for i in (
        range(num_combos) if n is None
        else random.sample(range(num_combos), min(n, num_combos))
    ):
        for k in keys:
            idx = i % len(param_options[k])
            params[k] = param_options[k][idx]
            i = int(i / len(param_options[k]))
        assert i == 0
        _test_get(client, path, params, response_fn)


TEST_DETAILED_OPTIONS = ['true', 'false']
TEST_AGGREGATE_OPTIONS = ['year', 'month', 'week', 'day']
TEST_SHOW_OPTIONS = [None, 'The Situaton Room']
TEST_CHANNEL_OPTIONS = [None, 'CNN', 'FOXNEWS', 'MSNBC']
TEST_HOUR_OPTIONS = [None, '9-5', '5', '5,6', '5-6,7']
TEST_DAYOFWEEK_OPTIONS = [None, 'mon-wed,thu,fri', 'sat', 'sat-sun', 'sat,sun']
TEST_IS_COMMERCIAL_OPTIONS = [None, 'false', 'true', 'both']
TEST_ONSCREEN_FACE_OPTIONS = [None, 'female:host', 'female', 'all']
TEST_ONSCREEN_PERSON_OPTIONS = [None, 'wolf blitzer']
TEST_TEXT_WINDOW_OPTIONS = [None, '0', '15', '120']


def _check_count_result(
    response: Response, params: Dict[str, Optional[str]]
) -> None:
    assert response.status_code == 200, 'Query failed: {}'.format(repr(params))
    assert response.is_json, str(response.data)


def test_count_mentions(client: FlaskClient) -> None:
    _combination_test_get(
        client, '/search', {
            'count': ['mentions'],
            'text': ['united states of america'],
            # General options
            'detailed': TEST_DETAILED_OPTIONS,
            'start_date': [None, '2017-01-01'],
            'end_date': [None, '2018-01-01'],
            'aggregate': TEST_AGGREGATE_OPTIONS,
            'channel': TEST_CHANNEL_OPTIONS,
            'show': TEST_SHOW_OPTIONS,
            'hour': TEST_HOUR_OPTIONS,
            'dayofweek': TEST_DAYOFWEEK_OPTIONS,
            'iscommercial': TEST_IS_COMMERCIAL_OPTIONS,
            'onscreen.face': TEST_ONSCREEN_FACE_OPTIONS,
            'onscreen.person': TEST_ONSCREEN_PERSON_OPTIONS
        }, _check_count_result, n=100)
    _combination_test_get(
        client, '/search', {
            'count': ['mentions'],
            'normalize': ['true'],
            'aggregate': TEST_AGGREGATE_OPTIONS,
        }, _check_count_result)


def test_count_face_time(client: FlaskClient) -> None:
    # Non-person facetime
    _combination_test_get(
        client, '/search', {
            'count': ['facetime'],
            'gender': [None, 'female'],
            'role': [None, 'host'],
            # General options
            'start_date': [None, '2017-01-01'],
            'end_date': [None, '2018-01-01'],
            'detailed': TEST_DETAILED_OPTIONS,
            'aggregate': TEST_AGGREGATE_OPTIONS,
            'channel': TEST_CHANNEL_OPTIONS,
            'show': TEST_SHOW_OPTIONS,
            'hour': TEST_HOUR_OPTIONS,
            'dayofweek': TEST_DAYOFWEEK_OPTIONS,
            'iscommercial': TEST_IS_COMMERCIAL_OPTIONS,
            'onscreen.face': TEST_ONSCREEN_FACE_OPTIONS,
            'onscreen.person': TEST_ONSCREEN_PERSON_OPTIONS,
            'caption.window': TEST_TEXT_WINDOW_OPTIONS,
            'caption.window': [None, 'united states of america'],
        }, _check_count_result, n=100)

    # Person facetime
    _combination_test_get(
        client, '/search', {
            'count': ['facetime'],
            'person': ['donald trump'],
            # General options
            'start_date': [None, '2017-01-01'],
            'end_date': [None, '2018-01-01'],
            'detailed': TEST_DETAILED_OPTIONS,
            'aggregate': TEST_AGGREGATE_OPTIONS,
            'channel': TEST_CHANNEL_OPTIONS,
            'show': TEST_SHOW_OPTIONS,
            'hour': TEST_HOUR_OPTIONS,
            'dayofweek': TEST_DAYOFWEEK_OPTIONS,
            'iscommercial': TEST_IS_COMMERCIAL_OPTIONS,
            'onscreen.face': TEST_ONSCREEN_FACE_OPTIONS,
            'onscreen.person': TEST_ONSCREEN_PERSON_OPTIONS,
            'caption.window': TEST_TEXT_WINDOW_OPTIONS,
            'caption.window': [None, 'united states of america'],
        }, _check_count_result, n=10)

    _combination_test_get(
        client, '/search', {
            'count': ['facetime'],
            'normalize': ['true'],
            'aggregate': TEST_AGGREGATE_OPTIONS,
        }, _check_count_result)


def test_count_video_time(client: FlaskClient) -> None:
    _combination_test_get(
        client, '/search', {
            'count': ['videotime'],
            # General options
            'start_date': [None, '2017-01-01'],
            'end_date': [None, '2018-01-01'],
            'detailed': TEST_DETAILED_OPTIONS,
            'aggregate': TEST_AGGREGATE_OPTIONS,
            'channel': TEST_CHANNEL_OPTIONS,
            'show': TEST_SHOW_OPTIONS,
            'hour': TEST_HOUR_OPTIONS,
            'dayofweek': TEST_DAYOFWEEK_OPTIONS,
            'iscommercial': TEST_IS_COMMERCIAL_OPTIONS,
            'onscreen.face': TEST_ONSCREEN_FACE_OPTIONS,
            'onscreen.person': TEST_ONSCREEN_PERSON_OPTIONS,
            'caption.window': TEST_TEXT_WINDOW_OPTIONS,
            'caption.window': [None, 'united states of america'],
        }, _check_count_result, n=100)
    _combination_test_get(
        client, '/search', {
            'count': ['videotime'],
            'detailed': ['true'],
            'aggregate': TEST_AGGREGATE_OPTIONS,
        }, _check_count_result)


# Search within a video tests


TEST_VIDEO_IDS = [json.dumps(list(range(10000, 10010)))]
TEST_COMMON_TEXT_OPTIONS = ['the']  # Use a common token


def _check_search_in_video_result(
    response: Response, params: Dict[str, Optional[str]]
) -> None:
    assert response.status_code == 200, 'Query failed: {}'.format(repr(params))
    assert response.is_json, str(response.data)
    json_body = response.get_json()
    ids_str = params['ids']
    assert ids_str is not None
    ids = json.loads(ids_str)
    for v in json_body:
        assert 'metadata' in v
        assert 'intervals' in v
        assert 'captions' in v


def test_search_mentions_in_videos(client: FlaskClient) -> None:
    _combination_test_get(
        client, '/search-videos', {
            'ids': TEST_VIDEO_IDS,
            # Count options
            'count': ['mentions'],
            # General options
            'text': TEST_COMMON_TEXT_OPTIONS,
            'iscommercial': TEST_IS_COMMERCIAL_OPTIONS,
            'onscreen.face': TEST_ONSCREEN_FACE_OPTIONS,
            'onscreen.person': TEST_ONSCREEN_PERSON_OPTIONS
        }, _check_search_in_video_result)


def test_search_face_time_in_videos(client: FlaskClient) -> None:
    # Non-person facetime
    _combination_test_get(
        client, '/search-videos', {
            'ids': TEST_VIDEO_IDS,
            # Count options
            'count': ['facetime'],
            'gender': [None, 'female'],
            'role': [None, 'host'],
            # General options
            'iscommercial': TEST_IS_COMMERCIAL_OPTIONS,
            'onscreen.face': TEST_ONSCREEN_FACE_OPTIONS,
            'onscreen.person': TEST_ONSCREEN_PERSON_OPTIONS,
            'caption.window': TEST_TEXT_WINDOW_OPTIONS,
            'caption.text': [None] + TEST_COMMON_TEXT_OPTIONS
        }, _check_search_in_video_result, n=100)

    # Person facetime
    _combination_test_get(
        client, '/search-videos', {
            'ids': TEST_VIDEO_IDS,
            # Count options
            'count': ['facetime'],
            'person': ['donald trump'],
            # General options
            'iscommercial': TEST_IS_COMMERCIAL_OPTIONS,
            'onscreen.face': TEST_ONSCREEN_FACE_OPTIONS,
            'onscreen.person': TEST_ONSCREEN_PERSON_OPTIONS,
            'caption.window': TEST_TEXT_WINDOW_OPTIONS,
            'caption.text': [None] + TEST_COMMON_TEXT_OPTIONS
        }, _check_search_in_video_result, n=10)


def test_search_time_in_videos(client: FlaskClient) -> None:
    _combination_test_get(
        client, '/search-videos', {
            'ids': TEST_VIDEO_IDS,
            # Count options
            'count': ['videotime'],
            # General options
            'iscommercial': TEST_IS_COMMERCIAL_OPTIONS,
            'onscreen.face': TEST_ONSCREEN_FACE_OPTIONS,
            'onscreen.person': TEST_ONSCREEN_PERSON_OPTIONS,
            'caption.window': TEST_TEXT_WINDOW_OPTIONS,
            'caption.text': [None] + TEST_COMMON_TEXT_OPTIONS
        }, _check_search_in_video_result)