"""
Test suite to ensure codepath coverage
"""

import json
import os
import random
from datetime import datetime
from urllib.parse import urlencode
from typing import Dict, List, Optional, Callable
import pytest
from pytz import timezone
from flask import Response
from flask.testing import FlaskClient

from app.core import build_app
from app.types_frontend import Ternary


CONFIG_FILE = os.path.join(os.path.dirname(os.path.realpath(__file__)),
                           '..', 'config.json')


@pytest.fixture(scope='module')
def client():
    """Dummy up a client with the default config"""
    with open(CONFIG_FILE) as f:
        config = json.load(f)

    flask_app = build_app(
        data_dir=config['data_dir'],
        index_dir=config['index_dir'],
        video_endpoint=config.get('video_endpoint'),
        video_auth_endpoint=config.get('archive_video_endpoint'),
        static_bbox_endpoint=None,
        static_caption_endpoint=None,
        host=config.get('host'),
        min_date=datetime(2010, 1, 1),
        max_date=datetime(2018, 4, 1),
        tz=timezone('US/Eastern'),
        min_person_screen_time=600,
        min_person_autocomplete_screen_time=600,
        hide_person_tags=False,
        default_aggregate_by='month',
        default_text_window=0,
        default_is_commercial=Ternary.false,
        default_serve_from_archive=True,
        default_color_gender_bboxes=True,
        allow_sharing=True,
        data_version='test',
        show_uptime=True)

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
    _is_ok(client.get('/video-embed'))
    _is_ok(client.get('/getting-started'))
    _is_ok(client.get('/docs'))
    _is_ok(client.get('/methodology'))
    _is_ok(client.get('/about'))

    _is_ok(client.get('/data'))
    _is_ok(client.get('/data/shows'))
    _is_ok(client.get('/data/people'))
    _is_ok(client.get('/data/videos'))
    _is_ok(client.get('/data/tags'))

    # test non-existent path
    _is_bad(client.get('/badpage'))


def test_get_generated_js(client: FlaskClient) -> None:
    """Make sure the we can retreive values.js"""
    _is_ok(client.get('/generated/js/values.js'))


def test_get_data(client: FlaskClient) -> None:
    """Make sure the we can retreive basic data"""
    _is_ok(client.get('/data/shows.json'))
    _is_ok(client.get('/data/people.json'))
    _is_ok(client.get('/data/videos.json'))
    _is_ok(client.get('/data/tags.json'))


def test_get_captions(client: FlaskClient) -> None:
    """Make sure that captions can be fetched"""
    base_id = 10000
    for i in range(100):
        _is_ok(client.get('/captions/{}'.format(base_id)))


# Search tests

ResponseFn = Callable[[Response, Dict[str, Optional[str]]], None]


def _test_get(
        client: FlaskClient,
        path: str,
        params: Dict[str, Optional[str]],
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
        key_options: Dict[str, List[Optional[str]]],
        response_fn: ResponseFn,
        n: Optional[int] = None,
        join_ops: List[str] = ['and', 'or']
) -> None:
    """Enumerate combinations of params_options"""
    num_combos = 1
    for v in param_options.values():
        num_combos *= len(v)
    for v in key_options.values():
        num_combos *= len(v)
    num_combos *= len(join_ops)

    if n is None:
        print('Testing {} possible combinations'.format(num_combos))
    else:
        print('Testing {} of {} possible combinations'.format(
            min(n, num_combos), num_combos))

    param_names = list(sorted(param_options))
    key_names = list(sorted(key_options))
    for i in (
            range(num_combos) if n is None
            else random.sample(range(num_combos), min(n, num_combos))
    ):
        get_params = {}
        for k in param_names:
            idx = i % len(param_options[k])
            get_params[k] = param_options[k][idx]
            i = int(i / len(param_options[k]))

        query_params = []
        for k in key_names:
            idx = i % len(key_options[k])
            value = key_options[k][idx]
            if value is not None:
                query_params.append([k, value])
            i = int(i / len(key_options[k]))

        join_op = join_ops[i % len(join_ops)]
        i = int(i / len(join_ops))

        if len(query_params) > 0:
            get_params['query'] = json.dumps([join_op, query_params])
        assert i == 0
        _test_get(client, path, get_params, response_fn)


TEST_DETAILED_OPTIONS = ['true', 'false']
TEST_AGGREGATE_OPTIONS = ['year', 'month', 'week', 'day']
TEST_SHOW_OPTIONS = [None, 'The Situaton Room']
TEST_CHANNEL_OPTIONS = [None, 'CNN', 'FOXNEWS', 'MSNBC']
TEST_HOUR_OPTIONS = [None, '9-17', '5']
TEST_DAYOFWEEK_OPTIONS = [None, 'mon-wed', 'sat']
TEST_IS_COMMERCIAL_OPTIONS = [None, 'false', 'true', 'both']
TEST_FACE_NAME_OPTIONS = [None, 'wolf blitzer', 'rachel maddow', 'tom hanks']
TEST_FACE_TAG_OPTIONS = [
    None, 'all', 'journalist', 'female', 'male,presenter',
    'female,journalist'
]
TEST_TEXT_OPTIONS = [
    None, 'united states of america', 'health care', 'united & airlines'
]
TEST_TEXT_WINDOW_OPTIONS = [None, '0', '15', '120']


def _check_count_result(
        response: Response,
        params: Dict[str, Optional[str]]
) -> None:
    assert response.status_code == 200, 'Query failed: {}, {}'.format(
        repr(params), str(response.data))
    assert response.is_json, str(response.data)


def test_count_video_time(client: FlaskClient) -> None:
    _combination_test_get(
        client, '/search', {
            'start_date': [None, '2017-01-01'],
            'end_date': [None, '2018-01-01'],
            'detailed': TEST_DETAILED_OPTIONS,
            'aggregate': TEST_AGGREGATE_OPTIONS,
            'is_commercial': TEST_IS_COMMERCIAL_OPTIONS
        }, {
            'channel': TEST_CHANNEL_OPTIONS,
            'show': TEST_SHOW_OPTIONS,
            'hour': TEST_HOUR_OPTIONS,
            'dayofweek': TEST_DAYOFWEEK_OPTIONS,
            'name': TEST_FACE_NAME_OPTIONS,
            'tag': TEST_FACE_TAG_OPTIONS,
            'text': [None, 'united states of america'],
            'textwindow': TEST_TEXT_WINDOW_OPTIONS,
        }, _check_count_result, n=100)
    _combination_test_get(
        client, '/search', {
            'detailed': ['true'],
            'aggregate': TEST_AGGREGATE_OPTIONS,
        }, {}, _check_count_result)


# Search within a video tests


TEST_VIDEO_IDS = [json.dumps(list(range(10000, 10010)))]
TEST_COMMON_TEXT_OPTIONS = ['the', 'united states']  # Use a common token


def _check_search_in_video_result(
        response: Response,
        params: Dict[str, Optional[str]]
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


def test_search_time_in_videos(client: FlaskClient) -> None:
    _combination_test_get(
        client, '/search-videos', {
            'ids': TEST_VIDEO_IDS,
            'is_commercial': TEST_IS_COMMERCIAL_OPTIONS
        }, {
            'name': TEST_FACE_NAME_OPTIONS,
            'tag': TEST_FACE_TAG_OPTIONS,
            'text': [None] + TEST_COMMON_TEXT_OPTIONS,
            'textwindow': TEST_TEXT_WINDOW_OPTIONS,
        }, _check_search_in_video_result)
