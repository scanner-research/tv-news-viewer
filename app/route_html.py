import time
import re
from typing import Optional
from flask import Flask, Response, render_template, request

from .types_frontend import SearchKey, SearchParam


def add_html_routes(
    app: Flask, num_total_videos: int, num_video_samples: int,
    default_text_window: int
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

    @app.template_filter('quoted')
    def quoted(s: str) -> Optional[str]:
        l = re.findall('\'([^\']*)\'', str(s))
        return l[0] if l else None

    @app.route('/')
    def root() -> Response:
        return render_template(
            'home.html', host=request.host, uptime=_get_uptime())

    @app.route('/embed')
    def embed() -> Response:
        return render_template('embed.html', host=request.host)

    @app.route('/video-embed')
    def show_videos() -> Response:
        return render_template('video-embed.html')

    @app.route('/getting-started')
    def get_getting_started() -> Response:
        return render_template(
            'getting-started.html', host=request.host, uptime=_get_uptime(),
            search_keys=SearchKey)

    @app.route('/docs')
    def get_docs() -> Response:
        return render_template(
            'docs.html', host=request.host, uptime=_get_uptime(),
            search_keys=SearchKey, default_text_window=default_text_window)

    @app.route('/methodology')
    def get_methodology() -> Response:
        return render_template(
            'methodology.html', host=request.host, uptime=_get_uptime())

    @app.route('/data')
    def get_dataset() -> Response:
        return render_template('dataset.html', host=request.host)

    @app.route('/about')
    def get_about() -> Response:
        return render_template('about.html', host=request.host)

    @app.route('/data/people')
    def get_data_people() -> Response:
        return render_template(
            'data/people.html', search_keys=SearchKey)

    @app.route('/data/tags')
    def get_data_tags() -> Response:
        return render_template(
            'data/tags.html', search_keys=SearchKey)

    @app.route('/data/shows')
    def get_data_shows() -> Response:
        return render_template('data/shows.html', search_keys=SearchKey)

    @app.route('/data/videos')
    def get_data_videos() -> Response:
        return render_template(
            'data/videos.html', n_samples='{:,}'.format(num_video_samples),
            n_total='{:,}'.format(num_total_videos))

    @app.route('/data/transcripts')
    def get_data_transcripts() -> Response:
        return render_template(
            'data/transcripts.html', params=SearchParam,
            search_keys=SearchKey)

    #NOTE(kayvonf): I'm adding misc/ routes here to add pages to the site,
    # although they may not be linked in for others to see

    @app.route('/misc/gender')
    def get_misc_gender() -> Response:
        return render_template('misc/gender.html')
