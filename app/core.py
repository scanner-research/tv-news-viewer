"""
Main application code
"""

from datetime import datetime
import os
import re
from flask import (
    Flask, Response, jsonify, request, render_template,
    make_response)
from pytz import timezone
from typing import List, Optional, Iterable

from captions import Documents                           # type: ignore

from .types_frontend import *
from .types_backend import *
from .error import InvalidUsage, NotFound
from .parsing import format_date
from .load import load_app_data, CaptionDataContext
from .route_html import add_html_routes
from .route_data_json import add_data_json_routes
from .route_search import add_search_routes


FILE_DIR = os.path.dirname(os.path.realpath(__file__))
TEMPLATE_DIR = os.path.join(FILE_DIR, '..', 'templates')
STATIC_DIR = os.path.join(FILE_DIR, '..', 'static')

NUM_VIDEO_SAMPLES = 1000


def untokenize(words: Iterable[str]) -> str:
    text = ' '.join(words)
    step1 = text.replace("`` ", '"').replace(" ''", '"').replace('. . .',  '...')
    step2 = step1.replace(" ( ", " (").replace(" ) ", ") ")
    step3 = re.sub(r' ([.,:;?!%>]+)([ \'"`])', r"\1\2", step2)
    step4 = re.sub(r' ([.,:;?!%>]+)$', r"\1", step3)
    step5 = step4.replace(" '", "'").replace(" n't", "n't")\
        .replace(" N'T", "N'T").replace("' t", "'t").replace("' T", "'T")\
        .replace("can not", "cannot").replace("CAN NOT", "CANNOT")\
        .replace("' s", "'s").replace("' S", "'S")
    step6 = step5.replace(" ` ", " '")
    return step6.strip()


def get_captions(
    cdc: CaptionDataContext, document: Documents.Document
) -> List[Caption]:
    lines = []
    for p in cdc.index.intervals(document):
        if p.len > 0:
            tokens: List[str] = [
                cdc.lexicon.decode(t)
                for t in cdc.index.tokens(
                    document, p.idx, p.len)]
            start: float = round(p.start, 2)
            end: float = round(p.end, 2)
            lines.append((start, end, untokenize(tokens)))
    return lines


def build_app(
    data_dir: str,
    index_dir: str,
    video_endpoint: Optional[str],
    video_auth_endpoint: Optional[str],
    static_bbox_endpoint: Optional[str],
    static_caption_endpoint: Optional[str],
    host: Optional[str],
    min_date: datetime,
    max_date: datetime,
    tz: timezone,
    min_person_screen_time: int,
    min_person_autocomplete_screen_time: int,
    autocomplete_person_tags: bool,
    default_aggregate_by: str,
    default_text_window: int,
    default_is_commercial: Ternary,
    default_serve_from_archive: bool,
    default_color_gender_bboxes: bool,
    data_version: Optional[str],
    show_uptime: bool
) -> Flask:

    caption_data_context, video_data_context = \
        load_app_data(index_dir, data_dir, tz, min_person_screen_time)

    app = Flask(__name__, template_folder=TEMPLATE_DIR,
                static_folder=STATIC_DIR)

    @app.errorhandler(InvalidUsage)
    def _handle_invalid_usage(error: InvalidUsage) -> Response:
        response = jsonify(error.to_dict())
        response.status_code = error.status_code
        return response

    @app.errorhandler(NotFound)
    def _handle_not_found(error: NotFound) -> Response:
        response = Response(error.message)
        response.status_code = 404
        return response

    add_html_routes(
        app, host,
        num_total_videos=sum(
            1 for v in video_data_context.video_dict.values()
            if v.date >= min_date and v.date <= max_date
        ),
        num_video_samples=NUM_VIDEO_SAMPLES,
        default_text_window=default_text_window,
        show_uptime=show_uptime)

    add_data_json_routes(app, video_data_context,
                         min_date=min_date, max_date=max_date,
                         num_video_samples=NUM_VIDEO_SAMPLES)

    add_search_routes(
        app, caption_data_context, video_data_context,
        default_aggregate_by=default_aggregate_by,
        default_is_commercial=default_is_commercial,
        default_text_window=default_text_window)

    @app.route('/generated/js/values.js')
    def get_values_js() -> Response:
        start_date = max(min(
            v.date for v in video_data_context.video_dict.values()), min_date)
        end_date = min(max(
            v.date for v in video_data_context.video_dict.values()), max_date)
        all_shows: List[str] = list(sorted({
            v.show for v in video_data_context.video_dict.values()
        }))
        resp = make_response(render_template(
            'js/values.js',
            host=host if host else request.host,
            data_version=data_version,
            start_date=format_date(start_date),
            end_date=format_date(end_date),
            default_agg_by=default_aggregate_by,
            default_text_window=default_text_window,
            video_endpoint=video_endpoint,
            video_auth_endpoint=video_auth_endpoint,
            bbox_endpoint=(
                static_bbox_endpoint if static_bbox_endpoint
                else '/static/faces'),
            caption_endpoint=(
                static_caption_endpoint if static_caption_endpoint
                else '/transcript'),
            default_serve_from_archive=default_serve_from_archive,
            search_params=[
                (k, v) for k, v in SearchParam.__dict__.items()
                if not k.startswith('__')],
            search_keys=[
                (k, v) for k, v in SearchKey.__dict__.items()
                if not k.startswith('__')],
            shows=all_shows,
            people=list(video_data_context.all_person_intervals.keys()),
            autocomplete_people=[
                intervals.name for intervals
                in video_data_context.all_person_intervals.values()
                if intervals.screen_time_seconds >= min_person_autocomplete_screen_time
            ],
            autocomplete_person_tags=autocomplete_person_tags,
            global_face_tags=list(sorted(GLOBAL_TAGS)),
            person_tags_dict=video_data_context.all_person_tags.tag_name_dict),
            color_gender_bboxes=default_color_gender_bboxes)
        resp.headers['Content-type'] = 'application/javascript'
        return resp

    if static_caption_endpoint is None:
        @app.route('/transcript/<int:i>')
        def get_transcript(i: int) -> Response:
            video = video_data_context.video_by_id.get(i)
            if not video:
                raise NotFound('video id: {}'.format(i))
            document = caption_data_context.document_by_name.get(video.name)
            if not document:
                raise NotFound('transcripts for video id: {}'.format(i))
            resp = jsonify(get_captions(caption_data_context, document))
            return resp
    else:
        print('Serving captions from:', static_caption_endpoint)

    return app
