#!/usr/bin/env python3

import argparse
import base64
from datetime import datetime, timedelta
import os
from os import path
import math
import json
from collections import namedtuple
from typing import Dict, List
from flask import Flask, Response, jsonify, request, render_template, send_file
from pathlib import Path

from captions import CaptionIndex, Documents, Lexicon
from captions.util import PostingUtil
from captions.query import Query
from rs_intervalset import MmapIntervalSetMapping


MIN_DATE = datetime(2010, 1, 1)
MAX_DATE = datetime(2018, 4, 1)


def get_args():
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


def load_json(file_path: str):
    with open(file_path, 'rb') as f:
        return json.load(f)


Video = namedtuple('Video', [
    'id', 'name', 'show', 'channel', 'date', 'dayofweek', 'hour', 'num_frames',
    'fps', 'width', 'height', 'commercials'
])


Commercial = namedtuple('Commercial', ['min_frame', 'max_frame'])


FaceIntervals = namedtuple('FaceIntervals', [
    'all', 'man', 'woman', 'host', 'nonhost',
    'man_host', 'man_nonhost', 'woman_host', 'woman_nonhost',
])


class InvalidUsage(Exception):
    status_code = 400

    def __init__(self, message, status_code=None, payload=None):
        Exception.__init__(self)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.payload = payload

    def to_dict(self):
        rv = dict(self.payload or ())
        rv['message'] = self.message
        return rv


def parse_date(s: str):
    return datetime.strptime(s, '%Y-%m-%d') if s else None


def format_date(d: datetime):
    return d.strftime('%Y-%m-%d')


def parse_hour_set(s: str):
    if s is None or not s.strip():
        return None
    result = set()
    for t in s.strip().split(','):
        if t == '':
            continue
        elif '-' in t:
            t0, t1 = t.split('-', 1)
            t0 = int(t0)
            t1 = int(t1)
            if t0 >= 0 and t0 <= 23 and t1 >= 0 and t1 <= 23:
                result.update(range(t0, t1 + 1))
            else:
                raise InvalidUsage('invalid hour range: {}'.format(t))
        else:
            t0 = int(t)
            if t0 >= 0 and t0 <= 23:
                result.add(t0)
            else:
                raise InvalidUsage('invalid hour: {}'.format(t))
    return result if result else None


DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']


def parse_day_of_week_set(s: str):
    if s is None or not s.strip():
        return None
    result = set()
    for t in s.strip().split(','):
        t_low = t.lower()
        try:
            if t_low == '':
                continue
            elif '-' in t:
                t0, t1 = t_low.split('-', 1)
                result.update(range(
                    DAYS_OF_WEEK.index(t0) + 1,
                    DAYS_OF_WEEK.index(t1) + 2))
            else:
                result.add(DAYS_OF_WEEK.index(t_low) + 1)
        except ValueError:
            raise InvalidUsage('invalid day of week: {}'.format(t))
    return result if result else None


def milliseconds(s: float):
    return int(s * 1000)


def get_video_name(s: str):
    return Path(s).name.split('.')[0]


def load_video_data(data_dir: str):
    print('Loading video data: please wait...')
    videos = {}
    for v in load_json(path.join(data_dir, 'videos.json')):
        (
            id,
            name,
            show,
            channel,
            date,
            minute,
            num_frames,
            fps,
            width,
            height,
            commercials
        ) = v
        name = get_video_name(name)
        date = parse_date(date)
        dayofweek = date.isoweekday()  # Mon == 1, Sun == 7
        videos[name] = Video(
            id=id, name=name, show=show, channel=channel,
            date=date, dayofweek=dayofweek, hour=math.floor(minute / 60),
            num_frames=num_frames, fps=fps, width=width, height=height,
            commercials=[Commercial(*c) for c in sorted(commercials)])

    face_dir = path.join(data_dir, 'face')
    face_intervals = FaceIntervals(
        all=MmapIntervalSetMapping(path.join(face_dir, 'all.bin')),
        man=MmapIntervalSetMapping(path.join(face_dir, 'male.bin')),
        woman=MmapIntervalSetMapping(path.join(face_dir, 'female.bin')),
        host=MmapIntervalSetMapping(path.join(face_dir, 'host.bin')),
        nonhost=MmapIntervalSetMapping(path.join(face_dir, 'nonhost.bin')),
        man_host=MmapIntervalSetMapping(
            path.join(face_dir, 'male_host.bin')),
        woman_host=MmapIntervalSetMapping(
            path.join(face_dir, 'female_host.bin')),
        man_nonhost=MmapIntervalSetMapping(
            path.join(face_dir, 'male_nonhost.bin')),
        woman_nonhost=MmapIntervalSetMapping(
            path.join(face_dir, 'female_nonhost.bin')))

    def parse_person_name(fname):
        return fname.split('.', 1)[0]

    person_dir = path.join(data_dir, 'people')
    id_intervals = {
        parse_person_name(person_file): MmapIntervalSetMapping(
            path.join(person_dir, person_file))
        for person_file in os.listdir(person_dir)
    }
    return videos, face_intervals, id_intervals


def load_index(index_dir: str):
    print('Loading caption index: please wait...')
    documents = Documents.load(path.join(index_dir, 'docs.list'))
    lexicon = Lexicon.load(path.join(index_dir, 'words.lex'))
    index = CaptionIndex(path.join(index_dir, 'index.bin'),
                         lexicon, documents)
    return index, documents, lexicon


def get_video_filter():
    start_date = parse_date(request.args.get('start_date', None))
    end_date = parse_date(request.args.get('end_date', None))
    channel = request.args.get('channel', None)
    show = request.args.get('show', None)
    hours = parse_hour_set(request.args.get('hour', None))
    daysofweek = parse_day_of_week_set(request.args.get('dayofweek', None))

    if start_date or end_date or channel or show or hours or daysofweek:
        def video_filter(video):
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
                video_end = video.hour + round(video.num_frames / video.fps / 3600)
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


def get_aggregate_fn(agg: str):
    if agg is None or agg == 'day':
        return lambda d: d
    elif agg == 'month':
        return lambda d: datetime(d.year, d.month, 1)
    elif agg == 'week':
        return lambda d: d - timedelta(days=d.isoweekday() - 1)
    elif agg == 'year':
        return lambda d: datetime(d.year, 1, 1)
    raise InvalidUsage('invalid aggregation parameter: {}'.format(agg))


def get_onscreen_face_isetmap(face_intervals: FaceIntervals):
    filter_str = request.args.get('onscreen.face', '', type=str).strip().lower()
    if not filter_str:
        return None
    if filter_str == 'any':
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


def get_onscreen_face_filter(face_intervals: FaceIntervals):
    isetmap = get_onscreen_face_isetmap(face_intervals)
    if isetmap is None:
        return None
    return lambda v, t: isetmap.is_contained(v, t, True)


def get_onscreen_id_isetmap(id_intervals: Dict[str, MmapIntervalSetMapping]):
    filter_str = request.args.get('onscreen.id', '', type=str).strip().lower()
    if not filter_str:
        return None
    intervals = id_intervals.get(filter_str, None)
    if intervals is None:
        raise InvalidUsage('{} is not a valid person'.format(filter_str))
    return intervals


def get_onscreen_id_filter(id_intervals: Dict[str, MmapIntervalSetMapping]):
    intervals = get_onscreen_id_isetmap(id_intervals)
    if intervals is None:
        return None
    return lambda v, t: intervals.is_contained(v, t, True)


def get_commercial_overlap(video: Video, intervals: List):
    overlap = 0
    i = 0
    for c in video.commercials:
        c_start = c.min_frame / video.fps * 1000
        c_end = c.max_frame / video.fps * 1000
        while i < len(intervals):
            a, b = intervals[i]
            if b <= c_start:
                i += 1
                continue
            if a > c_end:
                break
            else:
                overlap += max(0, min(b, c_end) - max(a, c_start))
                if c_end < b:
                    break
                else:
                    i += 1
                    continue
    return overlap / 1000


class DateAccumulator(object):

    def __init__(self, aggregate_fn):
        self._totals = {}
        self._aggregate_fn = aggregate_fn

    def add(self, date, video_id, value):
        if value > 0:
            key = format_date(self._aggregate_fn(date))
            if key not in self._totals:
                self._totals[key] = []
            self._totals[key].append((video_id, value))

    def get(self):
        return self._totals


def build_app(video_dict: Dict[str, Video], index: CaptionIndex,
              documents: Documents, lexicon: Lexicon,
              face_intervals: FaceIntervals,
              id_intervals: Dict[int, MmapIntervalSetMapping],
              frameserver_endpoint: str,
              cache_seconds: int):
    app = Flask(__name__)

    # Make sure document name equals video name
    documents = Documents([
        d._replace(name=get_video_name(d.name))
        for d in documents])

    video_by_id = {v.id: v for v in video_dict.values()}
    document_by_name = {d.name: d for d in documents}

    shows_by_channel = {}
    all_shows = set()
    for v in video_dict.values():
        if v.channel not in shows_by_channel:
            shows_by_channel[v.channel] = set()
        shows_by_channel[v.channel].add(v.show)
        all_shows.add(v.show)
    shows_by_channel = {k: list(sorted(v))
                        for k, v in shows_by_channel.items()}

    @app.errorhandler(InvalidUsage)
    def _handle_invalid_usage(error):
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

    def _search_text(accumulator: DateAccumulator,
                     text_query_str: str, window: int,
                     exclude_commercials: bool,
                     video_filter, face_filter, id_filter):
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
                            for c in video.commercials:
                                if 0 <= (
                                    min(p.end, c.max_frame / video.fps) -
                                    max(p.start, c.min_frame / video.fps)
                                ):
                                    return 1
                            return 0
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
                        total = max(
                            0,
                            total - sum((c.max_frame - c.min_frame) / video.fps
                                        for c in video.commercials))
                else:
                    total = index.document_length(document)
                    if exclude_commercials:
                        for c in video.commercials:
                            assert c.max_frame >= c.min_frame
                            min_idx = index.position(
                                document.id, c.min_frame / video.fps)
                            max_idx = index.position(
                                document.id, c.max_frame / video.fps)
                            if max_idx > min_idx:
                                total -= max(0, max_idx - min_idx)
                accumulator.add(video.date, video.id, total)

        print('Matched {} videos, {} filtered, {} missing'.format(
              matched_videos, filtered_videos, missing_videos))

    def _search_video(accumulator: DateAccumulator,
                      text_query_str: str,
                      window: int, exclude_commercials: bool,
                      face_isetmap: MmapIntervalSetMapping,
                      id_isetmap: MmapIntervalSetMapping,
                      video_filter):
        missing_videos = 0
        matched_videos = 0
        filtered_videos = 0

        def helper(video, intervals=None):
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
                    intervals = face_isetmap.intersect(video.id, intervals, True)
                if len(intervals) == 0:
                    return

            if intervals is not None:
                total_seconds = sum(i[1] - i[0] for i in intervals) / 1000
                if exclude_commercials:
                    total_seconds -= get_commercial_overlap(video, intervals)
                accumulator.add(video.date, video.id, total_seconds)
            else:
                total_frames = video.num_frames
                if exclude_commercials:
                    total_frames -= sum(
                        c.max_frame - c.min_frame for c in video.commercials)
                accumulator.add(video.date, video.id, total_frames / video.fps)

        if text_query_str:
            # TODO: make thi configurable
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
        exclude_commercials = request.args.get('nocomms', 'true', type=str) == 'true'
        text_query = request.args.get('text', '').strip()

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

    def _video_name_or_id(v):
        try:
            v_id = int(v)
            return video_by_id[v_id].name
        except ValueError:
            return v

    def _video_to_dict(video: Video):
        return {
            'id': video.id,
            'name': video.name,
            'width': video.width,
            'height': video.height,
            'fps': video.fps,
            'num_frames': video.num_frames
        }

    def _get_captions(document: Documents.Document):
        lines = []
        for p in index.intervals(document):
            if p.len > 0:
                tokens = [lexicon.decode(t)
                          for t in index.tokens(document, p.idx, p.len)]
                lines.append((round(p.start, 1), round(p.end, 1),
                              ' '.join(tokens)))
        return lines

    def _get_entire_video(video: Video):
        document = document_by_name.get(video.name)
        return {
            'metadata': _video_to_dict(video),
            'intervals': [(0, video.num_frames)],
            'captions': _get_captions(document) if document else []
        }

    def _search_text_videos(videos: List[Video], text_query_str: str,
                            window: int, exclude_commercials: bool,
                            face_filter, id_filter):
        results = []
        text_query_str = request.args.get('text', '')
        if text_query_str:
            # Run the query on the selected videos
            text_query = Query(text_query_str.upper())

            missing_videos = 0
            matched_videos = 0
            filtered_videos = 0
            for result in text_query.execute(lexicon, index, [
                documents[v.name] for v in videos if v.name in documents
            ]):
                document = documents[result.id]
                video = video_dict.get(document.name)
                if video is None:
                    missing_videos += 1
                    continue
                else:
                    matched_videos += 1

                postings = result.postings
                if window > 0:
                    if face_filter:
                        raise InvalidUsage('not implemented: window and face filter')
                    if id_filter:
                        raise InvalidUsage('not implemented: window and id filter')
                    if exclude_commercials:
                        raise InvalidUsage('not implemented: window and exclude_commercials')
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
                        for c in video.commercials:
                            if 0 <= (
                                min(p.end, c.max_frame / video.fps) -
                                max(p.start, c.min_frame / video.fps)
                            ):
                                return True
                        return False
                    postings = [p for p in postings if not in_commercial(p)]

                if len(postings) == 0:
                    print('Warning: no intervals found video_id={}'.format(video.id))
                else:
                    results.append({
                        'metadata': _video_to_dict(video),
                        'intervals': [
                            (p.start, p.end) for p in postings
                        ],
                        'captions': _get_captions(document)
                    })
            print('  matched {} videos, {} missing'.format(
                  matched_videos, missing_videos))
        else:
            if face_filter:
                raise InvalidUsage('not implemented: empty text and face filter')
            if id_filter:
                raise InvalidUsage('not implemented: empty text and id filter')
            if window > 0:
                raise InvalidUsage('not implemented: empty text and window != 0')

            # Return the entire video
            for v in videos:
                result.append(_get_entire_video(v))
        return results

    def _search_video_videos(videos: List[Video], text_query_str: str,
                             window: int, exclude_commercials: bool,
                             face_isetmap, id_isetmap):
        results = []

        def helper(video, intervals=None):
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
                    intervals = face_isetmap.intersect(video.id, intervals, True)
                if len(intervals) == 0:
                    return
            if exclude_commercials:
                pass
                # TODO: interval subtract

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
                result.append(_get_entire_video(video))

        if text_query_str:
            raise NotImplementedError()
        else:
            for v in videos:
                helper(v)
        return results

    @app.route('/search/videos')
    def search_videos():
        ids = request.args.get('ids', None)
        if not ids:
            raise InvalidUsage('must specify video ids')
        videos = [video_by_id[i] for i in json.loads(ids)]
        count_var = request.args.get('count', None, type=str)
        window = request.args.get('window', 0, type=int)
        exclude_commercials = request.args.get('nocomms', 'true', type=str) == 'true'
        text_query = request.args.get('text', '').strip()

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
        return send_file('vgrid-widget/dist/bundle.js', mimetype='text/javascript')

    @app.route('/vgrid/index.css')
    def get_vgrid_css():
        return send_file('vgrid-widget/dist/index.css', mimetype='text/css')

    return app


def main(host, port, data_dir, index_dir, frameserver_endpoint, debug):
    video_dict, face_intervals, id_intervals = load_video_data(data_dir)
    index, documents, lexicon = load_index(index_dir)
    app = build_app(video_dict, index, documents, lexicon, face_intervals,
                    id_intervals, frameserver_endpoint,  0 if debug else 3600)
    kwargs = {
        'host': host, 'port': port, 'debug': debug
    }
    if not debug:
        kwargs['threaded'] = False
        kwargs['processes'] = os.cpu_count()
    app.run(**kwargs)


if __name__ == '__main__':
    main(**vars(get_args()))
