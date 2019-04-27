#!/usr/bin/env python3

import argparse
import base64
from datetime import datetime, timedelta
import os
import math
import json
from collections import namedtuple
from typing import Dict
from flask import Flask, Response, jsonify, request, render_template, send_file
from pathlib import Path

from captions import CaptionIndex, Documents, Lexicon
from captions.util import PostingUtil
from captions.query import Query
from captions.vtt import get_vtt
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
    'man_host', 'man_nonhost', 'woman_host', 'woman_nonhost'
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


def milliseconds(s):
    return int(s * 1000)


def get_video_name(s: str):
    return Path(s).name.split('.')[0]


def load_video_data(data_dir: str):
    print('Loading video data: please wait...')
    videos = {}
    for v in load_json(os.path.join(data_dir, 'videos.json')):
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
            commercials=[Commercial(*c) for c in commercials])
    face_intervals = FaceIntervals(
        man_host=MmapIntervalSetMapping(
            os.path.join(data_dir, 'male_host.bin')),
        woman_host=MmapIntervalSetMapping(
            os.path.join(data_dir, 'female_host.bin')),
        man_nonhost=MmapIntervalSetMapping(
            os.path.join(data_dir, 'male_nonhost.bin')),
        woman_nonhost=MmapIntervalSetMapping(
            os.path.join(data_dir, 'female_nonhost.bin')))

    def parse_person_name(fname):
        return fname.split('.', 1)[0]

    person_dir = os.path.join(data_dir, 'people')
    id_intervals = {
        parse_person_name(person_file): MmapIntervalSetMapping(
            os.path.join(person_dir, person_file))
        for person_file in os.listdir(person_dir)
    }
    return videos, face_intervals, id_intervals


def load_index(index_dir: str):
    print('Loading caption index: please wait...')
    documents = Documents.load(os.path.join(index_dir, 'docs.list'))
    lexicon = Lexicon.load(os.path.join(index_dir, 'words.lex'))
    index = CaptionIndex(os.path.join(index_dir, 'index.bin'),
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


def build_app(video_dict: Dict[str, Video], index: CaptionIndex,
              documents: Documents, lexicon: Lexicon,
              face_intervals: FaceIntervals,
              id_intervals: Dict[int, MmapIntervalSetMapping],
              cache_seconds: int):
    app = Flask(__name__)

    # Make sure document name equals video name
    documents = Documents([
        d._replace(name=get_video_name(d.name))
        for d in documents])

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
    def handle_invalid_usage(error):
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
        return render_template('videos.html')

    def get_face_filter():
        filter_str = request.args.get('onscreen.face', '', type=str).strip().lower()
        if not filter_str:
            f = None
        elif filter_str == 'any':
            def f(v, t):
                return (
                    face_intervals.man_host.is_contained(v, t, True) or
                    face_intervals.man_nonhost.is_contained(v, t, True) or
                    face_intervals.woman_host.is_contained(v, t, True) or
                    face_intervals.woman_nonhost.is_contained(v, t, True))
        elif filter_str == 'man':
            def f(v, t):
                return (
                    face_intervals.man_host.is_contained(v, t, True) or
                    face_intervals.man_nonhost.is_contained(v, t, True))
        elif filter_str == 'woman':
            def f(v, t):
                return (
                    face_intervals.woman_host.is_contained(v, t, True) or
                    face_intervals.woman_nonhost.is_contained(v, t, True))
        elif filter_str == 'host':
            def f(v, t):
                return (
                    face_intervals.man_host.is_contained(v, t, True) or
                    face_intervals.woman_host.is_contained(v, t, True))
        elif filter_str == 'guest':
            def f(v, t):
                return (
                    face_intervals.man_nonhost.is_contained(v, t, True) or
                    face_intervals.woman_nonhost.is_contained(v, t, True))
        elif filter_str == 'man_host':
            def f(v, t):
                return face_intervals.man_host.is_contained(v, t, True)
        elif filter_str == 'woman_host':
            def f(v, t):
                return face_intervals.woman_host.is_contained(v, t, True)
        elif filter_str == 'man_guest':
            def f(v, t):
                return face_intervals.man_nonhost.is_contained(v, t, True)
        elif filter_str == 'woman_guest':
            def f(v, t):
                return face_intervals.woman_nonhost.is_contained(v, t, True)
        else:
            f = None
        return f

    def get_id_filter():
        filter_str = request.args.get('onscreen.id', '', type=str).strip().lower()
        if not filter_str:
            return None
        intervals = id_intervals.get(filter_str, None)
        if intervals is None:
            raise InvalidUsage('{} is not a valid person'.format(filter_str))
        return lambda v, t: intervals.is_contained(v, t, True)

    @app.route('/text-search')
    def text_search():
        # Parse video filters
        video_filter = get_video_filter()
        face_filter = get_face_filter()
        id_filter = get_id_filter()
        window = request.args.get('window', None, type=int)
        aggregate_fn = get_aggregate_fn(request.args.get(
            'aggregate', None, type=str))
        excl_comms = request.args.get('nocomms', 'true', type=str) == 'true'

        # Parse the query
        text_query_str = request.args.get('text', '').strip()
        print('Searching:', text_query_str)

        totals_by_day = {}
        missing_videos = 0
        matched_videos = 0
        filtered_videos = 0

        def accumulate(date, video_id, value):
            nonlocal totals_by_day
            date_key = format_date(aggregate_fn(date))
            if date_key not in totals_by_day:
                totals_by_day[date_key] = []
            totals_by_day[date_key].append((video_id, value))

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
                    postings = PostingUtil.deoverlap(PostingUtil.dilate(
                        result.postings, window,
                        video.num_frames / video.fps))
                    if id_filter:
                        raise InvalidUsage(
                            'Not implemented: window and person filter')
                    if face_filter:
                        raise InvalidUsage(
                            'Not implemented: window and face filter')
                    if excl_comms:
                        raise InvalidUsage(
                            'Not implemented: window and exclude_commercials')
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
                    if excl_comms:
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
                accumulate(video.date, video.id, total)
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
                        'Not implemented: blank query and person filter')
                if face_filter:
                    raise InvalidUsage(
                        'Not implemented: blank query and face filter')

                if window:
                    total = video.num_frames / video.fps
                    if excl_comms:
                        total = max(
                            0,
                            total - sum((c.max_frame - c.min_frame) / video.fps
                                        for c in video.commercials))
                else:
                    total = index.document_length(document)
                    if excl_comms:
                        for c in video.commercials:
                            assert c.max_frame >= c.min_frame
                            min_idx = index.position(
                                document.id, c.min_frame / video.fps)
                            max_idx = index.position(
                                document.id, c.max_frame / video.fps)
                            if max_idx > min_idx:
                                total -= max(0, max_idx - min_idx)
                accumulate(video.date, video.id, total)

        print('  matched {} videos, {} filtered, {} missing'.format(
              matched_videos, filtered_videos, missing_videos))
        resp = jsonify(totals_by_day)
        resp.cache_control.max_age = cache_seconds
        return resp

    video_name_by_id = {v.id: v.name for v in video_dict.values()}

    def video_name_or_id(v):
        try:
            v_id = int(v)
            return video_name_by_id[v_id].name
        except ValueError:
            return v

    def video_to_dict(video):
        return {
            'id': video.id,
            'name': video.name,
            'width': video.width,
            'height': video.height,
            'fps': video.fps,
            'num_frames': video.num_frames
        }

    @app.route('/text-search/videos')
    def text_search_videos():
        ids = request.args.get('ids', None)
        videos = list(video_name_by_id[i] for i in json.loads(ids))

        results = []
        text_query_str = request.args.get('text', '')
        if text_query_str:
            # Run the query on the selected videos
            text_query = Query(text_query_str.upper())
            window = request.args.get('window', type=int)

            missing_videos = 0
            matched_videos = 0
            filtered_videos = 0
            for result in text_query.execute(lexicon, index, [
                documents[v] for v in videos if v in documents
            ]):
                document = documents[result.id]
                video = video_dict.get(document.name)
                if video is None:
                    missing_videos += 1
                    continue
                else:
                    matched_videos += 1

                postings = result.postings
                if window:
                    postings = PostingUtil.deoverlap(PostingUtil.dilate(
                        result.postings, window, video.num_frames / video.fps))

                results.append({
                    'meta': video_to_dict(video),
                    'intervals': [
                        (p.start, p.end) for p in postings
                    ]
                })
            print('  matched {} videos, {} missing'.format(
                  matched_videos, missing_videos))
        else:
            # Return the entire video
            for v in videos:
                video = video_dict[v]
                results.append({
                    'meta': video_to_dict(video),
                    'intervals': [(0, video.num_frames)]
                })

        resp = jsonify(results)
        resp.cache_control.max_age = cache_seconds
        return resp

    @app.route('/captions/<video>')
    def get_captions(video):
        video = video_name_or_id(video)
        document = documents.prefix(video)[0]
        vtt_str = get_vtt(index, lexicon, document)
        response = Response(vtt_str, mimetype='text/vtt')
        response.headers['Content-Type'] = 'text/vtt'
        return response

    @app.route('/video-names')
    def get_video_names():
        return jsonify(list(video_dict.keys()))

    @app.route('/video-info/<video>')
    def get_video_info(video):
        video = video_name_or_id(video)
        return jsonify(video_dict[video])

    @app.route('/shows')
    def get_shows():
        return jsonify(shows_by_channel)

    @app.route('/people')
    def get_people():
        return jsonify(sorted(id_intervals.keys()))

    @app.route('/vgrid/bundle.js')
    def get_vgrid_bundle():
        return send_file('vgrid/dist/bundle.js', mimetype='text/javascript')

    @app.route('/vgrid/index.css')
    def get_vgrid_css():
        return send_file('vgrid/dist/index.css', mimetype='text/css')

    return app


def main(host, port, data_dir, index_dir, debug):
    video_dict, face_intervals, id_intervals = load_video_data(data_dir)
    index, documents, lexicon = load_index(index_dir)
    app = build_app(video_dict, index, documents, lexicon, face_intervals,
                    id_intervals, 0 if debug else 3600)
    kwargs = {
        'host': host, 'port': port, 'debug': debug
    }
    if not debug:
        kwargs['threaded'] = False
        kwargs['processes'] = os.cpu_count()
    app.run(**kwargs)


if __name__ == '__main__':
    main(**vars(get_args()))
