#!/usr/bin/env python3

import argparse
from datetime import datetime, timedelta
import os
import math
import json
from collections import namedtuple
from flask import Flask, Response, jsonify, request, render_template
from pathlib import Path

from captions import CaptionIndex, Documents, Lexicon
from captions.util import PostingUtil
from captions.query import Query
from captions.vtt import get_vtt


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


def load_json(file_path):
    with open(file_path, 'rb') as f:
        return json.load(f)


Video = namedtuple('Video', [
    'id', 'name', 'show', 'channel', 'date', 'weekday', 'hour', 'duration'
])


def parse_date(s):
    return datetime.strptime(s, '%Y-%m-%d') if s else None


def format_date(d):
    return d.strftime('%Y-%m-%d')


def parse_int_set(s):
    if s is None or not s.strip():
        return None
    result = set()
    for t in s.strip().split(','):
        if t == '':
            continue
        elif '-' in t:
            t0, t1 = t.split('-', 1)
            result.update(range(int(t0), int(t1) + 1))
        else:
            result.add(int(t))
    return result if result else None


def get_video_name(s):
    return Path(s).name.split('.')[0]


def load_video_data(data_dir):
    videos = {}
    for v in load_json(os.path.join(data_dir, 'videos.json')):
        id, name, show, channel, date, minute, duration = v
        name = get_video_name(name)
        date = parse_date(date)
        weekday = date.isoweekday()  # Mon == 1, Sun == 7
        videos[name] = Video(
            id=id, name=name, show=show, channel=channel,
            date=date, weekday=weekday, hour=math.floor(minute / 60),
            duration=duration)
    return videos


def load_index(index_dir):
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
    hours = parse_int_set(request.args.get('hours', None))
    weekdays = parse_int_set(request.args.get('weekdays', None))

    if start_date or end_date or channel or show or hours or weekdays:
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
                video_end = video.hour + round(video.duration / 3600)
                for h in range(video_start, video_end + 1):
                    if h in hours:
                        break
                else:
                    return False
            if weekdays and video.weekday not in weekdays:
                return False
            return True
        return video_filter
    else:
        return None


def get_aggregate_fn(agg):
    if agg is None or agg == 'day':
        return lambda d: d
    elif agg == 'month':
        return lambda d: datetime(d.year, d.month, 1)
    elif agg == 'week':
        return lambda d: d - timedelta(days=d.isoweekday() - 1)
    elif agg == 'year':
        return lambda d: datetime(d.year, 1, 1)
    raise NotImplementedError()


def build_app(videos, index, documents, lexicon):
    app = Flask(__name__)

    # Make sure document name equals video name
    documents = Documents([
        d._replace(name=get_video_name(d.name))
        for d in documents])

    @app.route('/')
    def root():
        start_date = format_date(min(v.date for v in videos.values()))
        end_date = format_date(max(v.date for v in videos.values()))
        return render_template(
            'home.html', start_date=start_date, end_date=end_date,
            aggregate='month')

    @app.route('/search')
    def search():
        query_str = request.args.get('query').upper()
        print('Searching:', query_str)
        query = Query(query_str)

        video_filter = get_video_filter()
        window = request.args.get('window', None, type=int)
        aggregate_fn = get_aggregate_fn(request.args.get(
            'aggregate', None, type=str))

        missing_videos = 0
        matched_videos = 0
        filtered_videos = 0
        totals_by_day = {}
        for result in query.execute(lexicon, index):
            document = documents[result.id]
            video = videos.get(document.name)
            if video is None:
                missing_videos += 1
                continue
            else:
                matched_videos += 1
            if video_filter is not None and not video_filter(video):
                filtered_videos += 1
                continue

            if window:
                total = sum(
                    max(p.end - p.start, 0)
                    for p in PostingUtil.deoverlap(PostingUtil.dilate(
                        result.postings, window, video.duration)))
            else:
                total = len(result.postings)
            date_key = format_date(aggregate_fn(video.date))
            if date_key not in totals_by_day:
                totals_by_day[date_key] = []
            totals_by_day[date_key].append((video.id, total))
        print('  matched {} videos, {} filtered, {} missing'.format(
            matched_videos, filtered_videos, missing_videos))
        return jsonify(totals_by_day)

    video_name_by_id = {v.id: v.name for v in videos.values()}

    def video_name_or_id(v):
        try:
            v_id = int(v)
            return video_name_by_id[v_id].name
        except ValueError:
            return v

    @app.route('/segments/<video>')
    def get_segments(video):
        video = video_name_or_id(video)
        query_str = request.args.get('query').upper()
        print('Searching (one video):', query_str)
        query = Query(query_str)
        window = request.args.get('window', type=int)

        segments = []
        for result in query.execute(lexicon, index, [documents[video].id]):
            postings = result.postings
            if window:
                postings = PostingUtil.deoverlap(PostingUtil.dilate(
                    result.postings, window, video.duration))
            segments.append(postings)
        return jsonify(segments)

    @app.route('/captions/<video>')
    def get_captions(video):
        video = video_name_or_id(video)
        document = documents.prefix(video)[0]
        vtt_str = get_vtt(index, lexicon, document)
        response = Response(vtt_str, mimetype='text/vtt')
        response.headers['Content-Type'] = 'text/vtt'
        return response

    @app.route('/videos')
    def get_video_names():
        ids = request.args.get('ids', None)
        if ids:
            return jsonify(list(video_name_by_id[i] for i in json.loads(ids)))
        else:
            return jsonify(list(videos.keys()))

    @app.route('/videos/<video>')
    def get_video_info(video):
        video = video_name_or_id(video)
        return jsonify(videos[video])

    shows_by_channel = {}
    for v in videos.values():
        if v.channel not in shows_by_channel:
            shows_by_channel[v.channel] = set()
        shows_by_channel[v.channel].add(v.show)
    shows_by_channel = {k: list(sorted(v))
                        for k, v in shows_by_channel.items()}

    @app.route('/shows')
    def get_shows():
        return jsonify(shows_by_channel)

    return app


def main(host, port, data_dir, index_dir, debug):
    videos = load_video_data(data_dir)
    index, documents, lexicon = load_index(index_dir)
    app = build_app(videos, index, documents, lexicon)
    app.run(host=host, port=port, debug=debug)


if __name__ == '__main__':
    main(**vars(get_args()))
