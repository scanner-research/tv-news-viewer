import os
import time
import re
from datetime import datetime
from typing import Optional, Dict
from flask import Flask, Response, render_template, request

from .types_frontend import SearchKey, SearchParam, GlobalTags


HOURS_GRANULATITY = 10000
DATE_FORMAT = '%B %-d, %Y'

DIR_PATH = os.path.dirname(os.path.realpath(__file__))
ANALYTICS_PATH = os.path.join(DIR_PATH, '..', 'analytics')


def add_html_routes(
        app: Flask,
        host: Optional[str],
        num_videos: int,
        num_video_hours: int,
        num_video_samples: int,
        num_videos_with_captions: int,
        num_people: int,
        start_date: datetime,
        end_date: datetime,
        default_text_window: int,
        hide_person_tags: bool,
        allow_sharing: bool,
        show_uptime: bool
):
    server_start_time = time.time()

    def _get_uptime() -> str:
        s = time.time() - server_start_time
        d = int(s / 86400)
        s -= d * 86400
        h = int(s / 3600)
        s -= h * 3600
        m = int(s / 60)
        s -= m * 60
        return '{}d {}h {}m {}s'.format(d, h, m, int(s))

    def _get_host() -> str:
        return host if host else request.host

    analytics_str = None
    if os.path.exists(ANALYTICS_PATH):
        with open(ANALYTICS_PATH) as fp:
            analytics_str = fp.read()

    def _get_template_kwargs() -> Dict[str, str]:
        kwargs = {'host': _get_host()}
        if show_uptime:
            kwargs['uptime'] = _get_uptime()
        if analytics_str:
            kwargs['analytics_str'] = analytics_str
        return kwargs

    @app.template_filter('quoted')
    def quoted(s: str) -> Optional[str]:
        l = re.findall('\'([^\']*)\'', str(s))
        return l[0] if l else None

    @app.route('/')
    def root() -> Response:
        return render_template(
            'home.html', allow_sharing=allow_sharing, **_get_template_kwargs())

    @app.route('/embed')
    def embed() -> Response:
        return render_template('embed.html', host=_get_host())

    @app.route('/video-embed')
    def show_videos() -> Response:
        return render_template('video-embed.html')

    start_date_str = start_date.strftime(DATE_FORMAT)
    end_date_str = end_date.strftime(DATE_FORMAT)

    @app.route('/getting-started')
    def get_getting_started() -> Response:
        return render_template(
            'getting-started.html', search_keys=SearchKey,
            global_tags=GlobalTags, hide_person_tags=hide_person_tags,
            default_text_window=default_text_window, start_date=start_date_str,
            **_get_template_kwargs())

    @app.route('/docs')
    def get_docs() -> Response:
        return render_template(
            'docs.html', search_keys=SearchKey, global_tags=GlobalTags,
            hide_person_tags=hide_person_tags,
            default_text_window=default_text_window, **_get_template_kwargs())

    @app.route('/methodology')
    def get_methodology() -> Response:
        return render_template(
            'methodology.html', hide_person_tags=hide_person_tags,
            **_get_template_kwargs())

    rounded_hour_str = '{:,}'.format(
        int(num_video_hours / HOURS_GRANULATITY) * HOURS_GRANULATITY)
    caption_percent_str = '{:0.1f}'.format(
        num_videos_with_captions / num_videos * 100)

    @app.route('/data')
    def get_dataset() -> Response:
        return render_template(
            'dataset.html',
            n_total_hours=rounded_hour_str,
            n_caption_percentage=caption_percent_str,
            start_date=start_date_str, end_date=end_date_str,
            **_get_template_kwargs())

    @app.route('/about')
    def get_about() -> Response:
        return render_template('about.html', **_get_template_kwargs())

    num_people_str = '{:,}'.format(num_people)

    @app.route('/faq')
    def get_faq() -> Response:
        return render_template(
            'faq.html', n_people=num_people_str, **_get_template_kwargs())

    @app.route('/data/people')
    def get_data_people() -> Response:
        return render_template(
            'data/people.html', search_keys=SearchKey,
            hide_person_tags=hide_person_tags,
            **_get_template_kwargs())

    @app.route('/data/tags')
    def get_data_tags() -> Response:
        return render_template(
            'data/tags.html', search_keys=SearchKey, global_tags=GlobalTags,
            hide_person_tags=hide_person_tags,
            **_get_template_kwargs())

    @app.route('/data/shows')
    def get_data_shows() -> Response:
        return render_template('data/shows.html', search_keys=SearchKey,
                               **_get_template_kwargs())

    @app.route('/data/videos')
    def get_data_videos() -> Response:
        return render_template(
            'data/videos.html', n_samples='{:,}'.format(num_video_samples),
            n_total='{:,}'.format(num_videos),
            **_get_template_kwargs())

    @app.route('/data/captions')
    def get_data_captions() -> Response:
        return render_template(
            'data/captions.html', params=SearchParam, search_keys=SearchKey,
            n_caption_percentage=caption_percent_str,
            **_get_template_kwargs())

    #NOTE(kayvonf): I'm adding misc/ routes here to add pages to the site,
    # although they may not be linked in for others to see

    @app.route('/misc/gender')
    def get_misc_gender() -> Response:
        return render_template('misc/gender.html', global_tags=GlobalTags)
