#!/usr/bin/env python3

import argparse
from datetime import datetime, timedelta
import os
import json
from flask import Flask, Response, jsonify, request, render_template, send_file
from typing import Dict, List, Set, Tuple, Optional

from captions import CaptionIndex, Documents, Lexicon   # type: ignore
from captions.util import PostingUtil                   # type: ignore
from captions.query import Query                        # type: ignore
from rs_intervalset import (                            # type: ignore
    MmapIntervalSetMapping, MmapIntervalListMapping)

from app.types import *
from app.error import InvalidUsage
from app.parsing import *
from app.load import get_video_name, load_video_data, load_index

MIN_DATE = datetime(2010, 1, 1)
MAX_DATE = datetime(2018, 4, 1)
DEFAULT_TEXT_WINDOW = 30
DEFAULT_EXCLUDE_COMMERCIALS = str(True).lower()


def get_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='localhost',
                        help='Host interface. Default: localhost')
    parser.add_argument('-p', '--port', default=8080,
                        help='Server port. Default: 8080')
    parser.add_argument('--data', dest='data_dir', default='data',
                        help='Directory of video metadata. Default: data')
    parser.add_argument('--index', dest='index_dir', default='index',
                        help='Directory of caption index. Default: index')
    parser.add_argument('--frameserver', dest='frameserver_endpoint', type=str,
                        help='Frameserver URL and path')
    parser.add_argument('-d', '--debug', action='store_true',
                        help='Run in debug mode with server auto-reload')
    return parser.parse_args()


def milliseconds(s: float) -> int:
    return int(s * 1000)


def assert_option_not_set(
    option: str, count_var: str, suggested_var: str
) -> None:
    if option in request.args:
        raise InvalidUsage(
            '"{}" cannot be used when counting "{}". Try counting "{}" instead.'.format(
                option, count_var, suggested_var))


def get_video_filter() -> Optional[VideoFilterFn]:
    start_date = parse_date(request.args.get('start_date', None, type=str))
    end_date = parse_date(request.args.get('end_date', None, type=str))
    channel = request.args.get('channel', None, type=str)
    show = request.args.get('show', None, type=str)
    hours = parse_hour_set(request.args.get('hour', None, type=str))
    daysofweek = parse_day_of_week_set(
        request.args.get('dayofweek', None, type=str))

    if start_date or end_date or channel or show or hours or daysofweek:
        def video_filter(video: Video) -> bool:
            if start_date and video.date < start_date:
                return False
            if end_date and video.date > end_date:
                return False
            if channel and video.channel != channel:
                return False
            if show and video.show != show:
                return False
            if hours:
                video_start = video.hour
                video_end = video.hour + round(video.num_frames / video.fps
                                               / 3600)
                for h in range(video_start, video_end + 1):
                    if h in hours:
                        break
                else:
                    return False
            if daysofweek and video.dayofweek not in daysofweek:
                return False
            return True
        return video_filter
    else:
        return None


def get_aggregate_fn(agg: Optional[str]) -> AggregateFn:
    if agg is None or agg == 'day':
        return lambda d: d
    elif agg == 'month':
        return lambda d: datetime(d.year, d.month, 1)
    elif agg == 'week':
        return lambda d: d - timedelta(days=d.isoweekday() - 1)
    elif agg == 'year':
        return lambda d: datetime(d.year, 1, 1)
    raise InvalidUsage('invalid aggregation parameter: {}'.format(agg))


def get_onscreen_face_isetmap(
    face_intervals: FaceIntervals
) -> MmapIntervalSetMapping:
    filter_str = request.args.get(
        'onscreen.face', '', type=str
    ).strip().lower()
    if not filter_str:
        return None
    if filter_str == 'all':
        isetmap = face_intervals.all
    elif filter_str == 'male':
        isetmap = face_intervals.male
    elif filter_str == 'female':
        isetmap = face_intervals.female
    elif filter_str == 'host':
        isetmap = face_intervals.host
    elif filter_str == 'nonhost':
        isetmap = face_intervals.nonhost
    elif filter_str == 'male+host':
        isetmap = face_intervals.male_host
    elif filter_str == 'female+host':
        isetmap = face_intervals.female_host
    elif filter_str == 'male+nonhost':
        isetmap = face_intervals.male_nonhost
    elif filter_str == 'female+nonhost':
        isetmap = face_intervals.female_nonhost
    else:
        raise InvalidUsage('{} is not a valid face filter'.format(filter_str))
    return isetmap


def get_onscreen_face_filter(
    face_intervals: FaceIntervals
) -> Optional[OnScreenFilterFn]:
    isetmap = get_onscreen_face_isetmap(face_intervals)
    if isetmap is None:
        return None
    return lambda v, t: isetmap.is_contained(v, t, True)


def get_onscreen_person_isetmap(
    person_intervals: PersonIntervals
) -> MmapIntervalSetMapping:
    filter_str = request.args.get('onscreen.id', '', type=str).strip().lower()
    if not filter_str:
        return None
    isetmap = person_intervals.get(filter_str, None)
    if isetmap is None:
        raise InvalidUsage('{} is not a valid person'.format(filter_str))
    return isetmap


def get_onscreen_person_filter(
    person_intervals: PersonIntervals
) -> Optional[OnScreenFilterFn]:
    isetmap = get_onscreen_person_isetmap(person_intervals)
    if isetmap is None:
        return None
    return lambda v, t: isetmap.is_contained(v, t, True)


def get_face_time_filter() -> Tuple[int, int]:
    gender = request.args.get('gender', '', type=str).strip().lower()
    role = request.args.get('role', '', type=str).strip().lower()

    payload_value = 0
    payload_mask = 0
    if gender and gender != 'all':
        payload_mask |= 0b1
        if gender == 'male':
            payload_value |= 0b1
        elif gender == 'female':
            pass
        else:
            raise InvalidUsage('{} is not a valid gender'.format(gender))
    if role and role != 'all':
        payload_mask |= 0b10
        if role == 'host':
            payload_value |= 0b10
        elif role == 'nonhost':
            pass
        else:
            raise InvalidUsage('{} is not a valid role'.format(role))
    return payload_mask, payload_value


class DateAccumulator(object):
    Value = Tuple[int, Number]

    def __init__(self, aggregate_fn: AggregateFn):
        self._totals: Dict[str, List['DateAccumulator.Value']] = {}
        self._aggregate_fn = aggregate_fn

    def add(self, date: datetime, video_id: int,
            value: Number) -> None:
        if value > 0:
            key = format_date(self._aggregate_fn(date))
            if key not in self._totals:
                self._totals[key] = []
            self._totals[key].append((video_id, value))

    def get(self) -> Dict[str, List['DateAccumulator.Value']]:
        return self._totals


def get_shows_by_channel(video_dict: Dict[str, Video]) -> Dict[str, List[str]]:
    tmp_shows_by_channel: Dict[str, Set[str]] = {}
    for v in video_dict.values():
        if v.channel not in tmp_shows_by_channel:
            tmp_shows_by_channel[v.channel] = set()
        tmp_shows_by_channel[v.channel].add(v.show)
    return {k: list(sorted(v)) for k, v in tmp_shows_by_channel.items()}


def get_entire_video_ms_interval(video: Video) -> List[Interval]:
    return [(0, int(video.num_frames / video.fps * 1000))]


def build_app(
    data_dir: str, index_dir: str, frameserver_endpoint: Optional[str],
    cache_seconds: int
) -> Flask:
    (
        video_dict, commercial_isetmap, all_faces_ilistmap,
        face_intervals, person_intervals
    ) = load_video_data(data_dir)
    index, documents, lexicon = load_index(index_dir)

    app = Flask(__name__)

    # Make sure document name equals video name
    documents = Documents([
        d._replace(name=get_video_name(d.name))
        for d in documents])

    video_by_id: Dict[int, Video] = {
        v.id: v for v in video_dict.values()
    }
    document_by_name: Dict[str, Documents.Document] = {
        d.name: d for d in documents
    }

    shows_by_channel = get_shows_by_channel(video_dict)
    all_shows: Set[str] = set()
    for shows in shows_by_channel.values():
        all_shows.update(shows)

    @app.errorhandler(InvalidUsage)
    def _handle_invalid_usage(error: InvalidUsage):
        response = jsonify(error.to_dict())
        response.status_code = error.status_code
        return response

    @app.route('/')
    def root() -> Response:
        start_date = max(min(v.date for v in video_dict.values()), MIN_DATE)
        end_date = min(max(v.date for v in video_dict.values()), MAX_DATE)
        return render_template(
            'home.html', host=request.host, aggregate='month',
            start_date=format_date(start_date),
            end_date=format_date(end_date), shows=all_shows,
            default_text_window=DEFAULT_TEXT_WINDOW,
            default_exclude_commercials=DEFAULT_EXCLUDE_COMMERCIALS)

    @app.route('/embed')
    def embed() -> Response:
        return render_template('embed.html', shows=all_shows)

    @app.route('/videos')
    def show_videos() -> Response:
        return render_template('videos.html',
                               frameserver_endpoint=frameserver_endpoint)

    def _count_mentions(
        accumulator: DateAccumulator,
        text_query_str: str, exclude_commercials: bool,
        video_filter: Optional[VideoFilterFn],
        onscreen_face_filter: Optional[OnScreenFilterFn],
        onscreen_person_filter: Optional[OnScreenFilterFn]
    ) -> None:
        missing_videos = 0
        matched_videos = 0
        filtered_videos = 0

        if text_query_str:
            text_query = Query(text_query_str.upper())
            for result in text_query.execute(lexicon, index):
                document = documents[result.id]
                video = video_dict.get(document.name)
                if video is None:
                    missing_videos += 1
                    continue
                else:
                    matched_videos += 1
                if video_filter is not None and not video_filter(video):
                    filtered_videos += 1
                    continue

                postings = result.postings
                if onscreen_person_filter:
                    postings = [
                        p for p in postings
                        if onscreen_person_filter(
                            video.id, milliseconds((p.start + p.end) / 2))]
                if onscreen_face_filter:
                    postings = [
                        p for p in postings
                        if onscreen_face_filter(
                            video.id, milliseconds((p.start + p.end) / 2))]

                if exclude_commercials:
                    def in_commercial(p: CaptionIndex.Posting) -> int:
                        return 1 if commercial_isetmap.is_contained(
                            video.id, int((p.start + p.end) / 2 * 1000), True
                        ) else 0
                    total = sum(1 - in_commercial(p) for p in postings)
                else:
                    total = len(postings)
                accumulator.add(video.date, video.id, total)
        else:
            for document in documents:
                video = video_dict.get(document.name)
                if video is None:
                    missing_videos += 1
                    continue
                else:
                    matched_videos += 1
                if video_filter is not None and not video_filter(video):
                    filtered_videos += 1
                    continue

                if onscreen_person_filter:
                    raise InvalidUsage(
                        'Not implemented: empty text and id filter')
                if onscreen_face_filter:
                    raise InvalidUsage(
                        'Not implemented: empty text and face filter')

                total = index.document_length(document)
                if exclude_commercials:
                    for a, b in commercial_isetmap.get_intervals(
                        video.id, True
                    ):
                        min_idx = index.position(document.id, a)
                        max_idx = index.position(document.id, b)
                        if max_idx > min_idx:
                            total -= max(0, max_idx - min_idx)
                accumulator.add(video.date, video.id, total)

        print('Matched {} videos, {} filtered, {} missing'.format(
              matched_videos, filtered_videos, missing_videos))

    def _count_time(
        accumulator: DateAccumulator,
        text_query_str: str, text_window: int,
        exclude_commercials: bool,
        video_filter: Optional[VideoFilterFn],
        face_time_filter: Optional[FaceTimeFilter],
        onscreen_face_isetmap: Optional[MmapIntervalSetMapping],
        onscreen_person_isetmap: Optional[MmapIntervalSetMapping]
    ) -> None:
        missing_videos = 0
        matched_videos = 0
        filtered_videos = 0

        def helper(
            video: Video, intervals: Optional[List[Interval]] = None
        ) -> None:
            if exclude_commercials:
                if intervals is None:
                    intervals = get_entire_video_ms_interval(video)
                intervals = commercial_isetmap.minus(video.id, intervals, True)
                if not intervals:
                    return
            if onscreen_person_isetmap:
                if intervals is None:
                    intervals = onscreen_person_isetmap.get_intervals(
                        video.id, True)
                else:
                    intervals = onscreen_person_isetmap.intersect(
                        video.id, intervals, True)
                if not intervals:
                    return
            if onscreen_face_isetmap:
                if intervals is None:
                    intervals = onscreen_face_isetmap.get_intervals(
                        video.id, True)
                else:
                    intervals = onscreen_face_isetmap.intersect(
                        video.id, intervals, True)
                if not intervals:
                    return

            if face_time_filter:
                payload_mask, payload_value = face_time_filter
                accumulator.add(
                    video.date, video.id,
                    all_faces_ilistmap.intersect_sum(
                        video.id,
                        intervals if intervals is not None else
                        get_entire_video_ms_interval(video),
                        payload_mask, payload_value, True
                    ) / 1000)
            else:
                if intervals is not None:
                    accumulator.add(
                        video.date, video.id,
                        sum(i[1] - i[0] for i in intervals) / 1000)
                else:
                    accumulator.add(video.date, video.id,
                                    video.num_frames / video.fps)

        if text_query_str:
            text_query = Query(text_query_str.upper())
            for result in text_query.execute(lexicon, index):
                document = documents[result.id]
                video = video_dict.get(document.name)
                if video is None:
                    missing_videos += 1
                    continue
                else:
                    matched_videos += 1
                if video_filter is not None and not video_filter(video):
                    filtered_videos += 1
                    continue

                postings = result.postings
                if text_window > 0:
                    postings = PostingUtil.deoverlap(PostingUtil.dilate(
                        postings, text_window, video.num_frames / video.fps))
                helper(video, [(int(p.start * 1000), int(p.end * 1000))
                               for p in postings])
        else:
            for video in video_dict.values():
                if video_filter is not None and not video_filter(video):
                    filtered_videos += 1
                    continue
                matched_videos += 1
                helper(video)

        print('Matched {} videos, filtered {}, missing {}'.format(
              matched_videos, filtered_videos, missing_videos))

    @app.route('/search')
    def search() -> Response:
        video_filter = get_video_filter()
        count_var = request.args.get('count', None, type=str)
        aggregate_fn = get_aggregate_fn(request.args.get(
            'aggregate', None, type=str))
        exclude_commercials = (
            request.args.get('commercial.none', 'true', type=str) == 'true')
        text_query = request.args.get('text', '', type=str).strip()

        accumulator = DateAccumulator(aggregate_fn)
        if count_var == Countable.MENTIONS.value:
            assert_option_not_set(
                'text.window', count_var, Countable.FACE_TIME.value + ' or '
                + Countable.VIDEO_TIME.value)
            assert_option_not_set(
                'gender', count_var, Countable.FACE_TIME.value)
            assert_option_not_set(
                'role', count_var, Countable.FACE_TIME.value)

            _count_mentions(
                accumulator,
                text_query, exclude_commercials, video_filter,
                get_onscreen_face_filter(face_intervals),
                get_onscreen_person_filter(person_intervals))
        elif (count_var == Countable.VIDEO_TIME.value
              or count_var == Countable.FACE_TIME.value):

            if count_var == Countable.VIDEO_TIME.value:
                assert_option_not_set(
                    'gender', count_var, Countable.FACE_TIME.value)
                assert_option_not_set(
                    'role', count_var, Countable.FACE_TIME.value)

            text_window = request.args.get(
                'text.window', DEFAULT_TEXT_WINDOW, type=int)
            _count_time(
                accumulator,
                text_query, text_window, exclude_commercials, video_filter,
                None if count_var == Countable.VIDEO_TIME.value
                else get_face_time_filter(),
                get_onscreen_face_isetmap(face_intervals),
                get_onscreen_person_isetmap(person_intervals))
        else:
            raise InvalidUsage('{} is not countable'.format(count_var))

        resp = jsonify(accumulator.get())
        resp.cache_control.max_age = cache_seconds
        return resp

    def _video_name_or_id(v: str) -> str:
        try:
            v_id = int(v)
            return video_by_id[v_id].name
        except ValueError:
            return v

    def _video_to_dict(video: Video) -> JsonObject:
        return {
            'id': video.id,
            'name': video.name,
            'width': video.width,
            'height': video.height,
            'fps': video.fps,
            'num_frames': video.num_frames
        }

    def _get_captions(document: Documents.Document) -> List[Caption]:
        lines = []
        for p in index.intervals(document):
            if p.len > 0:
                tokens: List[str] = [
                    lexicon.decode(t)
                    for t in index.tokens(document, p.idx, p.len)]
                start: float = round(p.start, 1)
                end: float = round(p.end, 1)
                lines.append((start, end, ' '.join(tokens)))
        return lines

    def _get_entire_video(video: Video) -> JsonObject:
        document = document_by_name.get(video.name)
        return {
            'metadata': _video_to_dict(video),
            'intervals': [(0, video.num_frames)],
            'captions': _get_captions(document) if document else []
        }

    def _count_mentions_in_videos(
        videos: List[Video],
        text_query_str: str,
        exclude_commercials: bool,
        onscreen_face_filter: Optional[OnScreenFilterFn],
        onscreen_person_filter: Optional[OnScreenFilterFn]
    ) -> List[JsonObject]:
        results = []
        if text_query_str:
            # Run the query on the selected videos
            text_query = Query(text_query_str.upper())
            for result in text_query.execute(lexicon, index, [
                documents[v.name] for v in videos if v.name in documents
            ]):
                document = documents[result.id]
                video = video_dict[document.name]

                postings = result.postings
                if onscreen_person_filter:
                    postings = [
                        p for p in postings
                        if onscreen_person_filter(
                            video.id, milliseconds((p.start + p.end) / 2))]
                if onscreen_face_filter:
                    postings = [
                        p for p in postings
                        if onscreen_face_filter(
                            video.id, milliseconds((p.start + p.end) / 2))]
                if exclude_commercials:
                    def in_commercial(p: CaptionIndex.Posting) -> bool:
                        return commercial_isetmap.is_contained(
                            video.id, int((p.start + p.end) / 2 * 1000), True)
                    postings = [p for p in postings if not in_commercial(p)]

                if len(postings) == 0:
                    print('Warning: no intervals found video_id={}'.format(
                          video.id))
                else:
                    results.append({
                        'metadata': _video_to_dict(video),
                        'intervals': [
                            (p.start, p.end) for p in postings
                        ],
                        'captions': _get_captions(document)
                    })
        else:
            if onscreen_face_filter:
                raise InvalidUsage(
                    'not implemented: empty text and face filter')
            if onscreen_person_filter:
                raise InvalidUsage(
                    'not implemented: empty text and id filter')
            if exclude_commercials:
                raise InvalidUsage(
                    'not implemented: empty text and commercial filter')

            # Return the entire video
            for v in videos:
                results.append(_get_entire_video(v))
        return results

    def _count_time_in_videos(
        videos: List[Video],
        text_query_str: str, text_window: int,
        exclude_commercials: bool,
        face_time_filter: Optional[FaceTimeFilter],
        onscreen_face_isetmap: Optional[MmapIntervalSetMapping],
        onscreen_person_isetmap: Optional[MmapIntervalSetMapping]
    ) -> List[JsonObject]:
        results = []

        def helper(
            video: Video,
            intervals: Optional[List[Interval]] = None
        ) -> None:
            if exclude_commercials:
                if intervals is None:
                    intervals = get_entire_video_ms_interval(video)
                intervals = commercial_isetmap.minus(video.id, intervals, True)
            if onscreen_person_isetmap:
                if intervals is None:
                    intervals = onscreen_person_isetmap.get_intervals(
                        video.id, True)
                else:
                    intervals = onscreen_person_isetmap.intersect(
                        video.id, intervals, True)
                if not intervals:
                    return
            if onscreen_face_isetmap:
                if intervals is None:
                    intervals = onscreen_face_isetmap.get_intervals(
                        video.id, True)
                else:
                    intervals = onscreen_face_isetmap.intersect(
                        video.id, intervals, True)
                if not intervals:
                    return

            if face_time_filter:
                payload_mask, payload_value = face_time_filter
                intervals = all_faces_ilistmap.intersect(
                    video.id,
                    intervals if intervals is not None else
                    get_entire_video_ms_interval(video),
                    payload_mask, payload_value, True)
                if not intervals:
                    return

            if intervals is not None:
                assert len(intervals) > 0
                document = document_by_name.get(v.name)
                results.append({
                    'metadata': _video_to_dict(video),
                    'intervals': [
                        (i[0] / 1000, i[1] / 1000) for i in intervals
                    ],
                    'captions': _get_captions(document) if document else []
                })
            else:
                results.append(_get_entire_video(video))

        if text_query_str:
            # Run the query on the selected videos
            text_query = Query(text_query_str.upper())
            for result in text_query.execute(lexicon, index, [
                documents[v.name] for v in videos if v.name in documents
            ]):
                document = documents[result.id]
                video = video_dict[document.name]
                postings = result.postings
                if text_window > 0:
                    postings = PostingUtil.deoverlap(PostingUtil.dilate(
                        postings, text_window, video.num_frames / video.fps))
                helper(video, [(int(p.start * 1000), int(p.end * 1000))
                               for p in postings])
        else:
            for v in videos:
                helper(v)
        return results

    @app.route('/search/videos')
    def search_videos() -> Response:
        ids = request.args.get('ids', None, type=str)
        if not ids:
            raise InvalidUsage('must specify video ids')
        videos = [video_by_id[i] for i in json.loads(ids)]
        count_var = request.args.get('count', None, type=str)
        window = request.args.get('window', 0, type=int)
        exclude_commercials = (
            request.args.get('commercial.none', 'true', type=str) == 'true')
        text_query = request.args.get('text', '', type=str).strip()

        if count_var == Countable.MENTIONS.value:
            assert_option_not_set(
                'text.window', count_var, Countable.FACE_TIME.value + ' or '
                + Countable.VIDEO_TIME.value)
            assert_option_not_set(
                'gender', count_var, Countable.FACE_TIME.value)
            assert_option_not_set(
                'role', count_var, Countable.FACE_TIME.value)

            results = _count_mentions_in_videos(
                videos, text_query, exclude_commercials,
                get_onscreen_face_filter(face_intervals),
                get_onscreen_person_filter(person_intervals))
        elif (count_var == Countable.VIDEO_TIME.value
              or count_var == Countable.FACE_TIME.value):
            if count_var == Countable.VIDEO_TIME.value:
                assert_option_not_set(
                    'gender', count_var, Countable.FACE_TIME.value)
                assert_option_not_set(
                    'role', count_var, Countable.FACE_TIME.value)

            text_window = request.args.get(
                'text.window', DEFAULT_TEXT_WINDOW, type=int)
            results = _count_time_in_videos(
                videos, text_query, text_window, exclude_commercials,
                None if count_var == Countable.VIDEO_TIME.value
                else get_face_time_filter(),
                get_onscreen_face_isetmap(face_intervals),
                get_onscreen_person_isetmap(person_intervals))
        else:
            raise InvalidUsage('{} is not countable'.format(count_var))

        resp = jsonify(results)
        resp.cache_control.max_age = cache_seconds
        return resp

    @app.route('/video-names')
    def get_video_names() -> Response:
        return jsonify(list(video_dict.keys()))

    @app.route('/video-info/<video>')
    def get_video_info(video: str) -> Response:
        video = _video_name_or_id(video)
        return jsonify(video_dict[video])

    @app.route('/shows')
    def get_shows() -> Response:
        return jsonify(shows_by_channel)

    @app.route('/people')
    def get_people() -> Response:
        return jsonify(sorted(person_intervals.keys()))

    @app.route('/vgrid/bundle.js')
    def get_vgrid_bundle() -> Response:
        return send_file('vgrid-widget/dist/bundle.js',
                         mimetype='text/javascript')

    @app.route('/vgrid/index.css')
    def get_vgrid_css() -> Response:
        return send_file('vgrid-widget/dist/index.css', mimetype='text/css')

    return app


def main(
    host: str, port: int, data_dir: str, index_dir: str,
    frameserver_endpoint: Optional[str], debug: bool
) -> None:
    app = build_app(data_dir, index_dir, frameserver_endpoint,
                    0 if debug else 24 * 3600)
    kwargs = {
        'host': host, 'port': port, 'debug': debug
    }
    app.run(**kwargs)


if __name__ == '__main__':
    main(**vars(get_args()))
