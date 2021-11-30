from flask import Flask, jsonify

from .load import VideoDataContext
from .types_frontend import *
from .error import *

""" Support limited export of interval data """
def add_data_export_routes(
        app: Flask,
        video_data_context: VideoDataContext
):

    all_video_ids = [(v.id, v.name) for v in
                     video_data_context.video_by_id.values()]
    all_video_ids.sort()

    @app.route('/export/list/video')
    def list_videos():
        return jsonify(all_video_ids)

    all_people_names = list(sorted(
        video_data_context.all_person_intervals.keys()))

    @app.route('/export/list/person')
    def list_people():
        return jsonify(all_people_names)

    @app.route('/export/person/<person>')
    def get_person(person):
        # start_date = parse_date(
        #     request.args.get(SearchParam.start_date, None, type=str))
        # end_date = parse_date(
        #     request.args.get(SearchParam.end_date, None, type=str))

        person_intervals = video_data_context.all_person_intervals.get(
            person, None)
        if person_intervals is None:
            raise PersonNotInDatabase(person)

        ret = []
        for video_id in person_intervals.isetmap.get_ids():
            video = video_data_context.video_by_id.get(video_id)
            if video is None:
                continue
            ret.append({
                'video_id': video_id,
                'archive_id': video.name,
                'intervals': person_intervals.isetmap.get_intervals(
                    video_id, True)
            })
        return jsonify(ret)

    @app.route('/export/commercial')
    def get_commercial():
        ret = []
        for video_id in video_data_context.commercial_isetmap.get_ids():
            video = video_data_context.video_by_id.get(video_id)
            if video is None:
                continue
            ret.append({
                'video_id': video_id,
                'archive_id': video.name,
                'intervals':
                    video_data_context.commercial_isetmap.get_intervals(
                        video_id, True)
            })
        return jsonify(ret)
