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
from rs_intervalset import MmapIntervalSetMapping       # type: ignore

from app.types import *
from app.error import InvalidUsage
from app.parsing import *
from app.load import get_video_name, load_video_data, load_index

MIN_DATE = datetime(2010, 1, 1)
MAX_DATE = datetime(2018, 4, 1)


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
    filter_str = request.args.get('onscreen.face', '', type=str).strip().lower()
    if not filter_str:
        return None
    if filter_str == 'all':
        isetmap = face_intervals.all
    elif filter_str == 'man':
        isetmap = face_intervals.man
    elif filter_str == 'woman':
        isetmap = face_intervals.woman
    elif filter_str == 'host':
        isetmap = face_intervals.host
    elif filter_str == 'nonhost':
        isetmap = face_intervals.nonhost
    elif filter_str == 'man+host':
        isetmap = face_intervals.man_host
    elif filter_str == 'woman+host':
        isetmap = face_intervals.woman_host
    elif filter_str == 'man+nonhost':
        isetmap = face_intervals.man_nonhost
    elif filter_str == 'woman+nonhost':
        isetmap = face_intervals.woman_nonhost
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


def get_onscreen_id_isetmap(
    id_intervals: IdIntervals
) -> MmapIntervalSetMapping:
    filter_str = request.args.get('onscreen.id', '', type=str).strip().lower()
    if not filter_str:
        return None
    intervals = id_intervals.get(filter_str, None)
    if intervals is None:
        raise InvalidUsage('{} is not a valid person'.format(filter_str))
    return intervals


def get_onscreen_id_filter(
    id_intervals: IdIntervals
) -> Optional[OnScreenFilterFn]:
    intervals = get_onscreen_id_isetmap(id_intervals)
    if intervals is None:
        return None
    return lambda v, t: intervals.is_contained(v, t, True)


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


def build_app(
    video_dict: Dict[str, Video], index: CaptionIndex,
    documents: Documents, lexicon: Lexicon,
    commercial_isetmap: MmapIntervalSetMapping,
    face_intervals: FaceIntervals, id_intervals: IdIntervals,
    frameserver_endpoint: str, cache_seconds: int
) -> Flask:
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
    def root():
        start_date = max(min(v.date for v in video_dict.values()), MIN_DATE)
        end_date = min(max(v.date for v in video_dict.values()), MAX_DATE)
        return render_template(
            'home.html', host=request.host, aggregate='month',
            start_date=format_date(start_date),
            end_date=format_date(end_date), shows=all_shows)

    @app.route('/embed')
    def embed():
        return render_template('embed.html', shows=all_shows)

    @app.route('/videos')
    def show_videos():
        return render_template('videos.html',
                               frameserver_endpoint=frameserver_endpoint)

    def _search_text(
        accumulator: DateAccumulator,
        text_query_str: str, window: int,
        exclude_commercials: bool,
        video_filter: Optional[VideoFilterFn],
        face_filter: Optional[OnScreenFilterFn],
        id_filter: Optional[OnScreenFilterFn]
    ) -> None:
        print('Counting mentions:', text_query_str)
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

                if window:
                    if id_filter:
                        raise InvalidUsage(
                            'Not implemented: window and id filter')
                    if face_filter:
                        raise InvalidUsage(
                            'Not implemented: window and face filter')
                    if exclude_commercials:
                        raise InvalidUsage(
                            'Not implemented: window and exclude_commercials')
                    postings = PostingUtil.deoverlap(PostingUtil.dilate(
                        result.postings, window,
                        video.num_frames / video.fps))
                    total = sum(max(p.end - p.start, 0) for p in postings)
                else:
                    postings = result.postings
                    if id_filter:
                        postings = [
                            p for p in postings
                            if id_filter(
                                video.id, milliseconds((p.start + p.end) / 2))]
                    if face_filter:
                        postings = [
                            p for p in postings
                            if face_filter(
                                video.id, milliseconds((p.start + p.end) / 2))]

                    if exclude_commercials:
                        def in_commercial(p):
                            return 1 if commercial_isetmap.is_contained(
                                video.id, int((p.start + p.end) / 2 * 1000),
                                True
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

                if id_filter:
                    raise InvalidUsage(
                        'Not implemented: empty text and id filter')
                if face_filter:
                    raise InvalidUsage(
                        'Not implemented: empty text and face filter')

                if window:
                    total = video.num_frames / video.fps
                    if exclude_commercials:
                        commercial_time = sum(
                            (b - a) / 1000 for a, b in
                            commercial_isetmap.get_intervals(video.id, True))
                        total -= commercial_time
                else:
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

    def _search_video(
        accumulator: DateAccumulator,
        text_query_str: str,
        window: int, exclude_commercials: bool,
        face_isetmap: MmapIntervalSetMapping,
        id_isetmap: MmapIntervalSetMapping,
        video_filter: Optional[VideoFilterFn]
    ) -> None:
        missing_videos = 0
        matched_videos = 0
        filtered_videos = 0

        def helper(
            video: Video, intervals: Optional[List[Interval]] = None
        ) -> None:
            if id_isetmap:
                if intervals is None:
                    intervals = id_isetmap.get_intervals(video.id, True)
                else:
                    intervals = id_isetmap.intersect(video.id, intervals, True)
                if len(intervals) == 0:
                    return
            if face_isetmap:
                if intervals is None:
                    intervals = face_isetmap.get_intervals(video.id, True)
                else:
                    intervals = face_isetmap.intersect(video.id, intervals,
                                                       True)
                if len(intervals) == 0:
                    return
            if exclude_commercials:
                if intervals is None:
                    intervals = [(0, int(video.num_frames / video.fps * 1000))]
                intervals = commercial_isetmap.minus(video.id, intervals, True)
                if len(intervals) == 0:
                    return

            if intervals is not None:
                accumulator.add(
                    video.date, video.id,
                    sum(i[1] - i[0] for i in intervals) / 1000)
            else:
                accumulator.add(video.date, video.id,
                                video.num_frames / video.fps)

        if text_query_str:
            # TODO: make this configurable
            window = max(window, 30)
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
                if window > 0:
                    postings = PostingUtil.deoverlap(PostingUtil.dilate(
                        postings, window, video.num_frames / video.fps))
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
    def search():
        video_filter = get_video_filter()
        count_var = request.args.get('count', None, type=str)
        window = request.args.get('window', 0, type=int)
        aggregate_fn = get_aggregate_fn(request.args.get(
            'aggregate', None, type=str))
        exclude_commercials = (
            request.args.get('nocomms', 'true', type=str) == 'true')
        text_query = request.args.get('text', '', type=str).strip()

        accumulator = DateAccumulator(aggregate_fn)
        if count_var == 'mentions':
            _search_text(
                accumulator,
                text_query, window, exclude_commercials,
                video_filter,
                get_onscreen_face_filter(face_intervals),
                get_onscreen_id_filter(id_intervals))
        elif count_var == 'videotime':
            _search_video(
                accumulator,
                text_query, window, exclude_commercials,
                get_onscreen_face_isetmap(face_intervals),
                get_onscreen_id_isetmap(id_intervals),
                video_filter)
        else:
            raise NotImplementedError(count_var)

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

    def _search_text_videos(
        videos: List[Video], text_query_str: str,
        window: int, exclude_commercials: bool,
        face_filter: Optional[OnScreenFilterFn],
        id_filter: Optional[OnScreenFilterFn]
    ) -> List[JsonObject]:
        results = []
        text_query_str = request.args.get('text', '', type=str)
        if text_query_str:
            # Run the query on the selected videos
            text_query = Query(text_query_str.upper())
            for result in text_query.execute(lexicon, index, [
                documents[v.name] for v in videos if v.name in documents
            ]):
                document = documents[result.id]
                video = video_dict[document.name]

                postings = result.postings
                if window > 0:
                    if face_filter:
                        raise InvalidUsage(
                            'not implemented: window and face filter')
                    if id_filter:
                        raise InvalidUsage(
                            'not implemented: window and id filter')
                    if exclude_commercials:
                        raise InvalidUsage(
                            'not implemented: window and exclude_commercials')
                    postings = PostingUtil.deoverlap(PostingUtil.dilate(
                        postings, window, video.num_frames / video.fps))

                if id_filter:
                    postings = [
                        p for p in postings
                        if id_filter(
                            video.id, milliseconds((p.start + p.end) / 2))]
                if face_filter:
                    postings = [
                        p for p in postings
                        if face_filter(
                            video.id, milliseconds((p.start + p.end) / 2))]
                if exclude_commercials:
                    def in_commercial(p):
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
            if face_filter:
                raise InvalidUsage(
                    'not implemented: empty text and face filter')
            if id_filter:
                raise InvalidUsage(
                    'not implemented: empty text and id filter')
            if window > 0:
                raise InvalidUsage(
                    'not implemented: empty text and window != 0')

            # Return the entire video
            for v in videos:
                results.append(_get_entire_video(v))
        return results

    def _search_video_videos(
        videos: List[Video], text_query_str: str,
        window: int, exclude_commercials: bool,
        face_isetmap: MmapIntervalSetMapping,
        id_isetmap: MmapIntervalSetMapping
    ) -> List[JsonObject]:
        results = []

        def helper(
            video: Video,
            intervals: Optional[List[Interval]] = None
        ) -> None:
            if id_isetmap:
                if intervals is None:
                    intervals = id_isetmap.get_intervals(video.id, True)
                else:
                    intervals = id_isetmap.intersect(video.id, intervals, True)
                if len(intervals) == 0:
                    return
            if face_isetmap:
                if intervals is None:
                    intervals = face_isetmap.get_intervals(video.id, True)
                else:
                    intervals = face_isetmap.intersect(video.id, intervals,
                                                       True)
                if len(intervals) == 0:
                    return
            if exclude_commercials:
                if intervals is None:
                    intervals = [(0, int(video.num_frames / video.fps * 1000))]
                intervals = commercial_isetmap.minus(video.id, intervals, True)

            if intervals is not None:
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
                if window > 0:
                    postings = PostingUtil.deoverlap(PostingUtil.dilate(
                        postings, window, video.num_frames / video.fps))
                helper(video, [(int(p.start * 1000), int(p.end * 1000))
                               for p in postings])
        else:
            for v in videos:
                helper(v)
        return results

    @app.route('/search/videos')
    def search_videos():
        ids = request.args.get('ids', None, type=str)
        if not ids:
            raise InvalidUsage('must specify video ids')
        videos = [video_by_id[i] for i in json.loads(ids)]
        count_var = request.args.get('count', None, type=str)
        window = request.args.get('window', 0, type=int)
        exclude_commercials = (
            request.args.get('nocomms', 'true', type=str) == 'true')
        text_query = request.args.get('text', '', type=str).strip()

        if count_var == 'mentions':
            results = _search_text_videos(
                videos, text_query,
                window, exclude_commercials,
                get_onscreen_face_filter(face_intervals),
                get_onscreen_id_filter(id_intervals))
        elif count_var == 'videotime':
            results = _search_video_videos(
                videos, text_query,
                window, exclude_commercials,
                get_onscreen_face_isetmap(face_intervals),
                get_onscreen_id_isetmap(id_intervals))
        else:
            raise NotImplementedError(count_var)

        resp = jsonify(results)
        resp.cache_control.max_age = cache_seconds
        return resp

    @app.route('/video-names')
    def get_video_names():
        return jsonify(list(video_dict.keys()))

    @app.route('/video-info/<video>')
    def get_video_info(video):
        video = _video_name_or_id(video)
        return jsonify(video_dict[video])

    @app.route('/shows')
    def get_shows():
        return jsonify(shows_by_channel)

    @app.route('/people')
    def get_people():
        return jsonify(sorted(id_intervals.keys()))

    @app.route('/vgrid/bundle.js')
    def get_vgrid_bundle():
        return send_file('vgrid-widget/dist/bundle.js',
                         mimetype='text/javascript')

    @app.route('/vgrid/index.css')
    def get_vgrid_css():
        return send_file('vgrid-widget/dist/index.css', mimetype='text/css')

    return app


def main(
    host: str, port: int, data_dir: str, index_dir: str,
    frameserver_endpoint: Optional[str], debug: bool
) -> None:
    video_dict, commercial_isetmap, face_intervals, id_intervals = \
        load_video_data(data_dir)
    index, documents, lexicon = load_index(index_dir)
    app = build_app(
        video_dict, index, documents, lexicon,
        commercial_isetmap, face_intervals,
        id_intervals, frameserver_endpoint,
        0 if debug else 3600)
    kwargs = {
        'host': host, 'port': port, 'debug': debug
    }
    if not debug:
        kwargs['threaded'] = False
        kwargs['processes'] = os.cpu_count()
    app.run(**kwargs)


if __name__ == '__main__':
    main(**vars(get_args()))
