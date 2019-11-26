import random
from collections import namedtuple, defaultdict
from flask import Flask, Response, jsonify

from .load import VideoDataContext


def add_data_json_routes(
    app: Flask, video_data_context: VideoDataContext,
    num_video_samples: int
):
    Person = namedtuple('person', ['name', 'screen_time', 'tags'])
    people = [
        Person(
            intervals.name, round(intervals.isetmap.sum() / 60000),
            video_data_context.all_person_tags.name_to_tags(name)
        )
        for name, intervals in video_data_context.all_person_intervals.items()
    ]

    @app.route('/data/people.json')
    def get_data_people_json() -> Response:
        return jsonify({'data': [
            (p.name, p.screen_time,
             ', '.join(sorted({t.name for t in p.tags})))
            for p in people
        ]})

    @app.route('/data/tags.json')
    def get_data_tags_json() -> Response:
        return jsonify({'data': [
            (t.name, t.source, len(p), ', '.join(p))
            for t, p in video_data_context.all_person_tags.tag_dict.items()
        ]})

    @app.route('/data/shows.json')
    def get_data_shows_json() -> Response:
        tmp = defaultdict(float)
        for v in video_data_context.video_dict.values():
            tmp[(v.channel, v.show)] += v.num_frames / v.fps
        channel_and_show = [
            (channel, show, round(seconds / 3600, 1))
            for (channel, show), seconds in tmp.items()]
        channel_and_show.sort()
        return jsonify({'data': channel_and_show})

    @app.route('/data/videos.json')
    def get_data_videos_json() -> Response:
        samples = random.sample(
            list(video_data_context.video_dict.values()), num_video_samples)
        return jsonify({'data': [
            (v.name, round(v.num_frames / v.fps / 60)) for v in samples
        ]})
