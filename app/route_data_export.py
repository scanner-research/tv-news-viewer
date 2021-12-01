from flask import Flask, jsonify, request
from typing import List

from captions.query import Query                        # type: ignore

from .load import CaptionDataContext, VideoDataContext
from .types_frontend import *
from .error import *

from .route_search import MAX_TRANSCRIPT_SEARCH_COST


""" Support limited export of interval data """
def add_data_export_routes(
        app: Flask,
        caption_data_context: CaptionDataContext,
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

    def get_caption_video_ids(
            cdc: CaptionDataContext,
            vdc: VideoDataContext,
            text_str: str
    ) -> List[str]:
        missing_videos = 0
        matched_videos = 0

        query = None
        try:
            query = Query(text_str.upper())
        except Exception as e:
            raise InvalidCaptionSearch(text_str)

        if query.estimate_cost(cdc.lexicon) > MAX_TRANSCRIPT_SEARCH_COST:
            raise QueryTooExpensive(
                'The text query is too expensive to compute. '
                '"{}" contains too many common words/phrases.'.format(text_str))

        results = []
        for raw_result in query.execute(
                cdc.lexicon, cdc.index, ignore_word_not_found=True,
                case_insensitive=True
        ):
            document = cdc.documents[raw_result.id]
            video = vdc.video_dict.get(document.name)
            if video is None:
                missing_videos += 1
                continue
            else:
                matched_videos += 1

            results.append({
                'video_id': video.id,
                'archive_id': video.name,
                'count': len(raw_result.postings)
            })
        return results

    @app.route('/export/search/video+text')
    def get_video_with_text():
        query = request.args.get('query', None)
        if query is None:
            raise InvalidCaptionSearch('No query specified.')
        return jsonify(get_caption_video_ids(
            caption_data_context, video_data_context, query))
