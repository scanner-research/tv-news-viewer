"""
Main application code
"""

from datetime import datetime, timedelta
import os
import json
import random
import re
import time
from collections import defaultdict, namedtuple
from flask import (
    Flask, Response, jsonify, request, render_template, send_file,
    make_response)
from flask_httpauth import HTTPBasicAuth                # type: ignore
from typing import Dict, List, Set, Tuple, Optional, Iterable, Generator

from captions import CaptionIndex, Documents, Lexicon   # type: ignore
from captions.util import PostingUtil                   # type: ignore
from captions.query import Query                        # type: ignore
from rs_intervalset import (                            # type: ignore
    MmapIntervalSetMapping, MmapIntervalListMapping)
from rs_intervalset.wrapper import (                    # type: ignore
    MmapIListToISetMapping, MmapUnionIlistsToISetMapping)

from .types import *
from .error import *
from .parsing import *
from .sum import *
from .load import (
    get_video_name, load_video_data, load_index,
    VideoDataContext, CaptionDataContext)
from .hash import sha256


FILE_DIR = os.path.dirname(os.path.realpath(__file__))
TEMPLATE_DIR = os.path.join(FILE_DIR, '..', 'templates')
STATIC_DIR = os.path.join(FILE_DIR, '..', 'static')

MAX_PERSON_ATTRIBUTE_QUERY = 5000


def milliseconds(s: float) -> int:
    return int(s * 1000)


def get_entire_video_ms_interval(video: Video) -> List[Interval]:
    return [(0, int(video.num_frames / video.fps * 1000))]


def assert_param_not_set(
    param: str, countable: str, suggested_var: Optional[str] = None
) -> None:
    if param in request.args:
        mesg = '"{}" cannot be used when counting "{}".'.format(
           param, countable)
        if suggested_var:
            mesg += ' Try counting "{}" instead.'.format(suggested_var)
        raise InvalidUsage(mesg)


def get_video_filter() -> Optional[VideoFilterFn]:
    start_date = parse_date(
        request.args.get(SearchParameter.start_date, None, type=str))
    end_date = parse_date(
        request.args.get(SearchParameter.end_date, None, type=str))
    channel = request.args.get(SearchParameter.channel, None, type=str)
    show = request.args.get(SearchParameter.show, None, type=str)
    video_name = request.args.get(SearchParameter.video, None, type=str)
    hours = parse_hour_set(
        request.args.get(SearchParameter.hour, None, type=str))
    daysofweek = parse_day_of_week_set(
        request.args.get(SearchParameter.day_of_week, None, type=str))

    if (
        start_date or end_date or channel
        or show or hours or daysofweek or video_name
    ):
        def video_filter(video: Video) -> bool:
            if video_name and video.name != video_name:
                return False
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
                video_end = (
                    video.hour + round(video.num_frames / video.fps / 3600))
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


def get_aggregate_fn() -> AggregateFn:
    agg = request.args.get(SearchParameter.aggregate, None, type=str)
    e = Aggregate[agg] if agg else Aggregate.day
    if e == Aggregate.day:
        return lambda d: d
    elif e == Aggregate.month:
        return lambda d: datetime(d.year, d.month, 1)
    elif e == Aggregate.week:
        return lambda d: d - timedelta(days=d.isoweekday() - 1)
    elif e == Aggregate.year:
        return lambda d: datetime(d.year, 1, 1)
    raise InvalidUsage('invalid aggregation parameter: {}'.format(agg))


def get_countable() -> Countable:
    value = request.args.get(SearchParameter.count, None, type=str)
    if value is None:
        raise InvalidUsage('no count variable specified')
    return Countable(value)


GLOBAL_TAGS = {'male', 'female', 'host', 'nonhost'}


def get_global_tags(face_filter: FaceFilter) -> Set[str]:
    return {t for t in face_filter.tags if t in GLOBAL_TAGS}


def either_tag_or_none(a: str, b: str, s: set) -> Optional[str]:
    has_a = a in s
    has_b = b in s
    if has_a and has_b:
        raise InvalidUsage('Cannot use {} and {} tags simultaneously'.format(a, b))
    elif has_a:
        return a
    elif has_b:
        return b
    return None


def interpret_global_tags(
    global_tags: Iterable[str]
) -> Tuple[Optional[str], Optional[str]]:
    gender_tag = either_tag_or_none('male', 'female', global_tags)
    host_tag = either_tag_or_none('host', 'nonhost', global_tags)
    return gender_tag, host_tag


def person_tags_to_people(
    video_data_context: VideoDataContext, face_filter: FaceFilter
) -> List[MmapIntervalListMapping]:
    selected_names = None
    for tag in face_filter.tags:
        if tag not in GLOBAL_TAGS:
            people_with_tag = \
                video_data_context.all_person_tags.tag_to_names(tag)
            if not people_with_tag:
                raise TagNotInDatabase(tag)

            if selected_names is None:
                selected_names = set(people_with_tag)
            selected_names = selected_names.intersection(people_with_tag)
    return selected_names


def people_to_ilistmaps(
    video_data_context: VideoDataContext, people: Iterable[str]
) -> List[MmapIntervalListMapping]:
    ilistmaps = []
    for person in people:
        person_intervals = video_data_context.all_person_intervals.get(
            person, None)
        if person_intervals is None:
            raise PersonNotInDatabase(person)
        ilistmaps.append(person_intervals.ilistmap)
    return ilistmaps


def person_to_isetmap(
    video_data_context: VideoDataContext, person: str,
    gender: Optional[str], role: Optional[str]
) -> MmapIntervalSetMapping:
    person_intervals = video_data_context.all_person_intervals.get(
        person, None)
    if person_intervals is None:
        raise PersonNotInDatabase(person)
    if gender is None and role is None:
        isetmap = person_intervals.isetmap
    else:
        payload_mask, payload_value = get_face_time_filter_mask(
            gender, role)
        isetmap = MmapIListToISetMapping(
            person_intervals.ilistmap, payload_mask, payload_value,
            3000, 100)
    return isetmap


def get_onscreen_face_isetmap(
    video_data_context: VideoDataContext, key: str
) -> Optional[MmapIntervalSetMapping]:
    face_filter = parse_face_filter_str(key)
    if face_filter.all:
        isetmap = video_data_context.face_intervals.all_isetmap

    elif face_filter.people is not None:
        people = list(face_filter.people)
        if face_filter.tags:
            global_tags = get_global_tags(face_filter)
            if len(global_tags) != len(face_filter.tags):
                people_with_tags = person_tags_to_people(
                    video_data_context, face_filter)
                people = [p for p in people if p in people_with_tags]
                if len(people) == 0:
                    raise InvalidUsage('None of the specified people match the tags')
            gender_tag, host_tag = interpret_global_tags(global_tags)
        else:
            gender_tag, host_tag = None, None

        if len(people) == 1:
            isetmap = person_to_isetmap(
                video_data_context, people[0], gender_tag, host_tag)
        else:
            ilistmaps = people_to_ilistmaps(
                video_data_context, people)
            payload_mask, payload_value = get_face_time_filter_mask(
                gender_tag, host_tag)
            isetmap = MmapUnionIlistsToISetMapping(
                ilistmaps, payload_mask, payload_value, 3000, 100)

    elif face_filter.tags is not None:
        global_tags = get_global_tags(face_filter)
        if len(global_tags) == len(face_filter.tags):
            gender_tag, host_tag = interpret_global_tags(global_tags)
            if gender_tag is None:
                if host_tag == 'host':
                    isetmap = video_data_context.face_intervals.host_isetmap
                elif host_tag == 'nonhost':
                    isetmap = video_data_context.face_intervals.nonhost_isetmap
                else:
                    raise UnreachableCode()
            elif gender_tag == 'male':
                if host_tag is None:
                    isetmap = video_data_context.face_intervals.male_isetmap
                elif host_tag == 'host':
                    isetmap = video_data_context.face_intervals.male_host_isetmap
                elif host_tag == 'nonhost':
                    isetmap = video_data_context.face_intervals.male_nonhost_isetmap
                else:
                    raise UnreachableCode()
            elif gender_tag == 'female':
                if host_tag is None:
                    isetmap = video_data_context.face_intervals.female_isetmap
                elif host_tag == 'host':
                    isetmap = video_data_context.face_intervals.female_host_isetmap
                elif host_tag == 'nonhost':
                    isetmap = video_data_context.face_intervals.female_nonhost_isetmap
                else:
                    raise UnreachableCode()
        else:
            people = person_tags_to_people(video_data_context, face_filter)
            assert people is not None
            ilistmaps = people_to_ilistmaps(video_data_context, people)
            gender_tag, host_tag = interpret_global_tags(global_tags)
            payload_mask, payload_value = get_face_time_filter_mask(
                gender_tag, host_tag)
            isetmap = MmapUnionIlistsToISetMapping(
                ilistmaps, payload_mask, payload_value, 3000, 100)

    else:
        raise UnreachableCode()
    return isetmap


def get_onscreen_face_isetmaps(
    video_data_context: VideoDataContext
) -> Optional[List[MmapIntervalSetMapping]]:
    result = []

    for k in request.args:
        if k == SearchParameter.onscreen_numfaces:
            num_faces = request.args.get(
                SearchParameter.onscreen_numfaces, type=int)
            if num_faces < 1:
                raise InvalidUsage('"{}" cannot be less than 1'.format(
                                  SearchParameter.onscreen_numfaces))
            if num_faces > 0xFF:
                raise InvalidUsage('"{}" cannot be less than {}'.format(
                                  SearchParameter.onscreen_numfaces, 0xFF))
            result.append(
                MmapIListToISetMapping(
                    video_data_context.face_intervals.num_faces_ilistmap,
                    0xFF, num_faces,
                    3000, 0))

        elif k.startswith(SearchParameter.onscreen_face):
            filter_str = request.args.get(k, type=str)
            assert filter_str is not None
            isetmap = get_onscreen_face_isetmap(
                video_data_context, filter_str.strip().lower())
            if isetmap:
                result.append(isetmap)

    return result if result else None


def get_face_time_filter_mask(
    gender_tag: Optional[str], host_tag: Optional[str]
) -> Tuple[int, int]:
    payload_mask = 0
    payload_value = 0

    if gender_tag:
        gender_tag = gender_tag.strip().lower()
        if gender_tag:
            payload_mask |= 1
            if gender_tag == 'male':
                payload_value |= 1
            elif gender_tag == 'female':
                pass
            else:
                raise UnreachableCode()
    if host_tag:
        host_tag = host_tag.strip().lower()
        if host_tag:
            payload_mask |= 1 << 1
            if host_tag == 'host':
                payload_value |= 1 << 1
            elif host_tag == 'nonhost':
                pass
            else:
                raise UnreachableCode()
    return payload_mask, payload_value


def intersect_isetmap(
    video: Video, isetmap: MmapIntervalSetMapping,
    intervals: Optional[List[Interval]]
) -> List[Interval]:
    return (isetmap.get_intervals(video.id, True) if intervals is None
            else isetmap.intersect(video.id, intervals, True))


def minus_isetmap(
    video: Video, isetmap: MmapIntervalSetMapping,
    intervals: Optional[List[Interval]]
) -> List[Interval]:
    return isetmap.minus(
        video.id, intervals
        if intervals else get_entire_video_ms_interval(video), True)


def merge_close_intervals(
    intervals: Iterable[Interval], threshold: float = 0.25
) -> Generator[Interval, None, None]:
    curr_i = None
    for i in intervals:
        if curr_i is not None:
            if max(curr_i[0], i[0]) - min(curr_i[1], i[1]) < threshold:
                curr_i = (min(curr_i[0], i[0]), max(curr_i[1], i[1]))
            else:
                yield curr_i
                curr_i = i
        else:
            curr_i = i
    if curr_i is not None:
        yield curr_i


def has_onscreen_face(
    v: Video, t: int, isetmaps: List[MmapIntervalSetMapping]
) -> bool:
    return all(isetmap.is_contained(v.id, t, True) for isetmap in isetmaps)


def build_app(
    data_dir: str, index_dir: str, video_endpoint: str,
    frameserver_endpoint: Optional[str], archive_video_endpoint: Optional[str],
    authorized_users: Optional[List[LoginCredentials]],
    min_date: datetime, max_date: datetime,
    min_person_screen_time: int,
    default_aggregate_by: str,
    default_text_window: int,
    default_is_commercial: Ternary,
    data_version: Optional[str]
) -> Flask:
    server_start_time = time.time()

    def _get_is_commercial() -> Ternary:
        value = request.args.get(
            SearchParameter.is_commercial, None, type=str)
        return Ternary[value] if value else default_is_commercial

    def _get_uptime() -> str:
        s = time.time() - server_start_time
        d = int(s / 86400)
        s -= d * 86400
        h = int(s / 3600)
        s -= h * 3600
        m = int(s / 60)
        s -= m * 60
        return '{}d {}h {}m {}s'.format(d, h, m, int(s))

    if authorized_users:
        auth = HTTPBasicAuth()

        @auth.verify_password
        def verify_password(username: str, password: str) -> bool:
            for l in authorized_users:
                if username == l.username:
                    return sha256(password) == l.password_hash
            return False

    else:
        auth = None

    video_data_context = load_video_data(data_dir)
    caption_data_context = load_index(index_dir)

    app = Flask(__name__, template_folder=TEMPLATE_DIR,
                static_folder=STATIC_DIR)

    @app.template_filter('quoted')
    def quoted(s):
        l = re.findall('\'([^\']*)\'', str(s))
        if l:
            return l[0]
        return None

    # Make sure document name equals video name
    caption_data_context = caption_data_context._replace(
        documents=Documents([
            d._replace(name=get_video_name(d.name))
            for d in caption_data_context.documents])
    )

    video_by_id: Dict[int, Video] = {
        v.id: v for v in video_data_context.video_dict.values()
    }
    document_by_name: Dict[str, Documents.Document] = {
        d.name: d for d in caption_data_context.documents
    }

    all_shows: List[str] = list(sorted({
        v.show for v in video_data_context.video_dict.values()
    }))

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

    def _root() -> Response:
        return render_template(
            'home.html', uptime=_get_uptime(), countables=Countable)

    if auth:
        @app.route('/')
        @auth.login_required
        def root() -> Response:
            return _root()
    else:
        @app.route('/')
        def root() -> Response:
            return _root()

    @app.route('/embed')
    def embed() -> Response:
        return render_template('embed.html')

    @app.route('/video-embed')
    def show_videos() -> Response:
        return render_template('video-embed.html')

    @app.route('/getting-started')
    def get_getting_started() -> Response:
        return render_template(
            'getting-started.html', host=request.host,
            countables=Countable, parameters=SearchParameter,
            default_text_window=default_text_window,
            default_is_commercial=default_is_commercial.name)

    @app.route('/detailed')
    def get_detailed() -> Response:
        return render_template(
            'detailed.html', host=request.host,
            countables=Countable, parameters=SearchParameter,
            default_text_window=default_text_window,
            default_is_commercial=default_is_commercial.name)

    @app.route('/methodology')
    def get_methodology() -> Response:
        return render_template('methodology.html')

    @app.route('/about-us')
    def get_about_us() -> Response:
        return render_template('about-us.html')

    # List of people to expose
    Person = namedtuple('person', ['name', 'screen_time', 'tags'])
    people = list(filter(
        lambda x: x.screen_time * 60 > min_person_screen_time, [
            Person(
                name, round(intervals.isetmap.sum() / 60000, 2),
                video_data_context.all_person_tags.name_to_tags(name)
            )
            for name, intervals in
            video_data_context.all_person_intervals.items()
        ]))
    people.sort(key=lambda x: x.name)

    @app.route('/data/people')
    def get_people() -> Response:
        return render_template('data/people.html', parameters=SearchParameter)

    @app.route('/data/people.json')
    def get_people_json() -> Response:
        return jsonify({'data': [
            (p.name, p.screen_time, ', '.join(p.tags)) for p in people
        ]})

    @app.route('/data/tags')
    def get_person_tags() -> Response:
        return render_template('data/tags.html', parameters=SearchParameter)

    @app.route('/data/tags.json')
    def get_person_tags_json() -> Response:
        return jsonify({'data': [
            (t, len(p), ', '.join(p))
            for t, p in video_data_context.all_person_tags.tag_dict.items()
        ]})

    @app.route('/data/shows')
    def get_shows() -> Response:
        return render_template('data/shows.html', parameters=SearchParameter)

    @app.route('/data/shows.json')
    def get_shows_json() -> Response:
        tmp = defaultdict(float)
        for v in video_data_context.video_dict.values():
            tmp[(v.channel, v.show)] += v.num_frames / v.fps
        channel_and_show = [
            (channel, show, round(seconds / 3600))
            for (channel, show), seconds in tmp.items()]
        channel_and_show.sort()
        return jsonify({'data': channel_and_show})

    @app.route('/data/videos')
    def get_videos() -> Response:
        return render_template('data/videos.html')

    @app.route('/data/videos.json')
    def get_videos_json() -> Response:
        return jsonify({'data': [
            (v.name, round(v.num_frames / v.fps / 60, 1))
            for v in video_data_context.video_dict.values()
        ]})

    @app.route('/data/transcripts')
    def get_transcripts() -> Response:
        return render_template(
            'data/transcripts.html', parameters=SearchParameter)

    @app.route('/static/js/values.js')
    def get_values_js() -> Response:
        resp = make_response(render_template(
            'js/values.js', shows=all_shows, people=[x.name for x in people],
            person_tags=video_data_context.all_person_tags.tags))
        resp.headers['Content-type'] = 'text/javascript'
        return resp

    @app.route('/static/js/query.js')
    def get_query_js() -> Response:
        resp = make_response(render_template(
            'js/query.js', parameters=SearchParameter, countables=Countable
        ))
        resp.headers['Content-type'] = 'text/javascript'
        return resp

    @app.route('/static/js/chart.js')
    def get_chart_js() -> Response:
        resp = make_response(render_template(
            'js/chart.js', countables=Countable,
            video_endpoint=video_endpoint))
        resp.headers['Content-type'] = 'text/javascript'
        return resp

    @app.route('/static/js/home.js')
    def get_home_js() -> Response:
        start_date = max(min(
            v.date for v in video_data_context.video_dict.values()), min_date)
        end_date = min(max(
            v.date for v in video_data_context.video_dict.values()), max_date)
        resp = make_response(render_template(
            'js/home.js', parameters=SearchParameter, countables=Countable,
            host=request.host, data_version=data_version,
            start_date=format_date(start_date),
            end_date=format_date(end_date),
            default_agg_by=default_aggregate_by,
            default_text_window=default_text_window,
            global_face_tags=list(sorted(GLOBAL_TAGS))
        ))
        resp.headers['Content-type'] = 'text/javascript'
        return resp

    @app.route('/static/js/videos.js')
    def get_videos_js() -> Response:
        return render_template(
            'js/videos.js', countables=Countable, parameters=SearchParameter,
            video_endpoint=video_endpoint,
            frameserver_endpoint=frameserver_endpoint,
            archive_video_endpoint=archive_video_endpoint)

    @app.route('/static/js/embed.js')
    def get_embed_js() -> Response:
        return render_template('js/embed.js', host=request.host,
                               data_version=data_version)

    def _get_document_token_count(
        video: Video, document: Documents.Document, is_commercial: Ternary
    ) -> int:
        if is_commercial == Ternary.both:
            return caption_data_context.index.document_length(document)
        else:
            commercial_tokens = 0
            for a, b in video_data_context.commercial_isetmap.get_intervals(
                video.id, True
            ):
                min_idx = caption_data_context.index.position(document.id, a)
                max_idx = caption_data_context.index.position(document.id, b)
                if max_idx > min_idx:
                    commercial_tokens += max(0, max_idx - min_idx)
            if is_commercial == Ternary.true:
                return commercial_tokens
            else:
                return (
                    caption_data_context.index.document_length(document)
                    - commercial_tokens)

    def _in_commercial(v: Video, p: CaptionIndex.Posting) -> bool:
        return video_data_context.commercial_isetmap.is_contained(
            v.id, int((p.start + p.end) / 2 * 1000), True)

    def _count_time(
        accumulator: DateAccumulator,
        caption_query_str: str, caption_window: int,
        is_commercial: Ternary,
        video_filter: Optional[VideoFilterFn],
        onscreen_face_isetmaps: Optional[List[MmapIntervalSetMapping]]
    ) -> None:
        missing_videos = 0
        matched_videos = 0
        filtered_videos = 0

        def helper(
            video: Video, intervals: Optional[List[Interval]] = None
        ) -> None:
            if is_commercial != Ternary.both:
                if is_commercial == Ternary.true:
                    intervals = intersect_isetmap(
                        video, video_data_context.commercial_isetmap,
                        intervals)
                else:
                    intervals = minus_isetmap(
                        video, video_data_context.commercial_isetmap,
                        intervals)
                if not intervals:
                    return

            if onscreen_face_isetmaps:
                for isetmap in onscreen_face_isetmaps:
                    intervals = intersect_isetmap(video, isetmap, intervals)
                    if not intervals:
                        return

            if intervals is not None:
                accumulator.add(
                    video.date, video.id,
                    sum(i[1] - i[0] for i in intervals) / 1000)
            else:
                accumulator.add(video.date, video.id,
                                video.num_frames / video.fps)

        if caption_query_str:
            query = None
            try:
                query = Query(caption_query_str.upper())
            except Exception as e:
                raise InvalidTranscriptSearch(caption_query_str)
            for result in query.execute(
                caption_data_context.lexicon,
                caption_data_context.index,
                ignore_word_not_found=True
            ):
                document = caption_data_context.documents[result.id]
                video = video_data_context.video_dict.get(document.name)
                if video is None:
                    missing_videos += 1
                    continue
                else:
                    matched_videos += 1
                if video_filter is not None and not video_filter(video):
                    filtered_videos += 1
                    continue

                postings = result.postings
                if caption_window > 0:
                    postings = PostingUtil.deoverlap(PostingUtil.dilate(
                        postings, caption_window,
                        video.num_frames / video.fps))
                helper(video, [(int(p.start * 1000), int(p.end * 1000))
                               for p in postings])
        else:
            for video in video_data_context.video_dict.values():
                if video_filter is not None and not video_filter(video):
                    filtered_videos += 1
                    continue
                matched_videos += 1
                helper(video)

        print('Matched {} videos, filtered {}, missing {}'.format(
              matched_videos, filtered_videos, missing_videos))

    @app.route('/search')
    def search() -> Response:
        video_filter = get_video_filter()
        countable = get_countable()
        aggregate_fn = get_aggregate_fn()
        is_commercial = _get_is_commercial()

        accumulator = (
            DetailedDateAccumulator(aggregate_fn)
            if request.args.get(
                SearchParameter.detailed, 'true', type=str
            ) == 'true' else SimpleDateAcumulator(aggregate_fn))
        if countable == Countable.videotime:
            caption_query = request.args.get(
                SearchParameter.caption_text, '', type=str).strip()
            caption_window = request.args.get(
                SearchParameter.caption_window, default_text_window,
                type=int)
            _count_time(
                accumulator,
                caption_query, caption_window,
                is_commercial, video_filter,
                get_onscreen_face_isetmaps(video_data_context))
        else:
            raise NotImplementedError('unreachable code')

        return jsonify(accumulator.get())

    def _video_name_or_id(v: str) -> str:
        try:
            v_id = int(v)
            return video_by_id[v_id].name
        except ValueError:
            return v

    def _video_to_dict(video: Video) -> JsonObject:
        return {
            'id': video.id,
            'name': video.name,
            'width': video.width,
            'height': video.height,
            'fps': video.fps,
            'num_frames': video.num_frames
        }

    def _get_entire_video(video: Video) -> JsonObject:
        document = document_by_name.get(video.name)
        return {
            'metadata': _video_to_dict(video),
            'intervals': [(0, video.num_frames)],
            'captions': _get_captions(document) if document else []
        }

    def _count_time_in_videos(
        videos: List[Video],
        caption_query_str: str, caption_window: int,
        is_commercial: Ternary,
        onscreen_face_isetmaps: Optional[List[MmapIntervalSetMapping]]
    ) -> List[JsonObject]:
        results = []

        def helper(
            video: Video,
            intervals: Optional[List[Interval]] = None
        ) -> None:
            if is_commercial != Ternary.both:
                if is_commercial == Ternary.true:
                    intervals = intersect_isetmap(
                        video, video_data_context.commercial_isetmap,
                        intervals)
                else:
                    intervals = minus_isetmap(
                        video, video_data_context.commercial_isetmap,
                        intervals)
                if not intervals:
                    return

            if onscreen_face_isetmaps:
                for isetmap in onscreen_face_isetmaps:
                    intervals = intersect_isetmap(video, isetmap, intervals)
                    if not intervals:
                        return

            if intervals is not None:
                assert len(intervals) > 0
                document = document_by_name.get(video.name)
                results.append({
                    'metadata': _video_to_dict(video),
                    'intervals': list(merge_close_intervals(
                        (i[0] / 1000, i[1] / 1000) for i in intervals
                    ))
                })
            else:
                results.append(_get_entire_video(video))

        if caption_query_str:
            # Run the query on the selected videos
            query = None
            try:
                query = Query(caption_query_str.upper())
            except Exception as e:
                raise InvalidTranscriptSearch(caption_query_str)
            for result in query.execute(
                caption_data_context.lexicon,
                caption_data_context.index,
                [caption_data_context.documents[v.name] for v in videos
                 if v.name in caption_data_context.documents]
            ):
                document = caption_data_context.documents[result.id]
                video = video_data_context.video_dict[document.name]
                postings = result.postings
                if caption_window > 0:
                    postings = PostingUtil.deoverlap(PostingUtil.dilate(
                        postings, caption_window,
                        video.num_frames / video.fps))
                helper(video, [(milliseconds(p.start), milliseconds(p.end))
                               for p in postings])
        else:
            for v in videos:
                helper(v)
        return results

    @app.route('/search-videos')
    def search_videos() -> Response:
        ids = request.args.get(SearchParameter.video_ids, None, type=str)
        if not ids:
            raise InvalidUsage('must specify video ids')
        videos = [video_by_id[i] for i in json.loads(ids)]
        countable = get_countable()
        is_commercial = _get_is_commercial()

        if countable == Countable.videotime:
            caption_query = request.args.get(
                SearchParameter.caption_text, '', type=str).strip()
            caption_window = request.args.get(
                SearchParameter.caption_window, default_text_window,
                type=int)
            results = _count_time_in_videos(
                videos, caption_query, caption_window, is_commercial,
                get_onscreen_face_isetmaps(video_data_context))

        else:
            raise NotImplementedError('unreachable code')

        return jsonify(results)

    def _get_captions(document: Documents.Document) -> List[Caption]:
        lines = []
        for p in caption_data_context.index.intervals(document):
            if p.len > 0:
                tokens: List[str] = [
                    caption_data_context.lexicon.decode(t)
                    for t in caption_data_context.index.tokens(
                        document, p.idx, p.len)]
                start: float = round(p.start, 2)
                end: float = round(p.end, 2)
                lines.append((start, end, ' '.join(tokens)))
        return lines

    @app.route('/captions/<int:i>')
    def get_captions(i: int) -> Response:
        video = video_by_id.get(i)
        if not video:
            raise NotFound('video id: {}'.format(i))
        document = document_by_name.get(video.name)
        if not document:
            raise NotFound('captions for video id: {}'.format(i))
        resp = jsonify(_get_captions(document))
        return resp

    return app
