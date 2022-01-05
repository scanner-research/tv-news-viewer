import random
from datetime import datetime, timedelta
from collections import namedtuple, defaultdict
from flask import Flask, Response, jsonify

from .load import VideoDataContext


def add_data_json_routes(
        app: Flask,
        video_data_context: VideoDataContext,
        min_date: datetime,
        max_date: datetime,
        num_video_samples: int,
        hide_person_tags: bool
):
    Person = namedtuple('person', ['name', 'is_host', 'screen_time', 'tags'])
    people = [
        Person(
            intervals.name,
            sorted(video_data_context.host_to_channels.get(name, [])),
            round(intervals.screen_time_seconds / 60),
            video_data_context.all_person_tags.name_to_tags(name)
        )
        for name, intervals in video_data_context.all_person_intervals.items()
    ]

    @app.route('/data/people.json')
    def get_data_people_json() -> Response:
        return jsonify({'data': [
            (p.name, ', '.join(p.is_host),p.screen_time,
             '' if hide_person_tags else ', '.join(sorted({t.name for t in p.tags})))
            for p in people
        ]})

    if not hide_person_tags:
        @app.route('/data/tags.json')
        def get_data_tags_json() -> Response:
            return jsonify({'data': [
                (t.name, t.source, len(p), ', '.join(p))
                for t, p in video_data_context.all_person_tags.tag_dict.items()
            ]})

    @app.route('/data/shows.json')
    def get_data_shows_json() -> Response:
        time_all = defaultdict(float)
        time_1yr = defaultdict(float)
        max_date_minus_1yr = max(
            v.date for v in video_data_context.video_dict.values()
        ) - timedelta(days=365)
        for v in video_data_context.video_dict.values():
            s = v.num_frames / v.fps
            k = (v.channel, v.show)
            time_all[k] += s
            if v.date >= max_date_minus_1yr:
                time_1yr[k] += s

        channel_and_show = [
            (*k, round(s / 3600, 1), round(time_1yr[k] / 3600, 1))
            for k, s in time_all.items()]
        channel_and_show.sort()
        return jsonify({'data': channel_and_show})

    @app.route('/data/videos.json')
    def get_data_videos_json() -> Response:
        if len(video_data_context.video_dict) > num_video_samples:
            samples = random.sample(
                [v for v in video_data_context.video_dict.values()
                 if v.date >= min_date and v.date <= max_date],
                num_video_samples)
        else:
            samples = video_data_context.video_dict.values()
        return jsonify({'data': [
            (v.name, round(v.num_frames / v.fps / 60)) for v in samples
        ]})
