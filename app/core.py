"""
Main application code
"""

from datetime import datetime, timedelta
import os
import json
import time
from collections import defaultdict, namedtuple
from flask import (
    Flask, Response, jsonify, request, render_template, send_file,
    make_response)
from flask_httpauth import HTTPBasicAuth
from typing import Dict, List, Set, Tuple, Optional, Iterable, Generator

from captions import CaptionIndex, Documents, Lexicon   # type: ignore
from captions.util import PostingUtil                   # type: ignore
from captions.query import Query                        # type: ignore
from rs_intervalset import (                            # type: ignore
    MmapIntervalSetMapping, MmapIntervalListMapping)
from rs_intervalset.wrapper import MmapIListToISetMapping

from .types import *
from .error import InvalidUsage, NotFound
from .parsing import *
from .sum import *
from .load import get_video_name, load_video_data, load_index
from .hash import sha256


FILE_DIR = os.path.dirname(os.path.realpath(__file__))
TEMPLATE_DIR = os.path.join(FILE_DIR, '..', 'templates')
STATIC_DIR = os.path.join(FILE_DIR, '..', 'static')


MIN_DATE = datetime(2010, 1, 1)
MAX_DATE = datetime(2018, 4, 1)
DEFAULT_AGGREGATE_BY = 'month'
DEFAULT_TEXT_WINDOW = 0
DEFAULT_IS_COMMERCIAL = Ternary.false


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
    hours = parse_hour_set(
        request.args.get(SearchParameter.hour, None, type=str))
    daysofweek = parse_day_of_week_set(
        request.args.get(SearchParameter.day_of_week, None, type=str))

    if start_date or end_date or channel or show or hours or daysofweek:
        def video_filter(video: Video) -> bool:
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
                video_end = video.hour + round(video.num_frames / video.fps
                                               / 3600)
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


def get_is_commercial() -> Ternary:
    value = request.args.get(
        SearchParameter.is_commercial, None, type=str)
    return Ternary[value] if value else DEFAULT_IS_COMMERCIAL


def get_countable() -> Countable:
    value = request.args.get(SearchParameter.count, None, type=str)
    if value is None:
        raise InvalidUsage('no count variable specified')
    return Countable(value)


def get_onscreen_face_isetmap(
    face_intervals: FaceIntervals, all_person_intervals: AllPersonIntervals,
    key: str
) -> Optional[MmapIntervalSetMapping]:
    gender, role, person = parse_face_filter_str(key)
    if person is not None:
        person_intervals = all_person_intervals.get(person, None)
        if person_intervals is None:
            raise InvalidUsage('{} is not a valid person'.format(key))
        if gender is None and role is None:
            isetmap = person_intervals.isetmap
        else:
            payload_mask, payload_value = get_face_time_filter_mask(
                gender, role)
            isetmap = MmapIListToISetMapping(
                person_intervals.ilistmap, payload_mask, payload_value,
                3000, 100)
    else:
        if gender is None:
            if role is None:
                isetmap = face_intervals.all_isetmap
            elif role == 'host':
                isetmap = face_intervals.host_isetmap
            elif role == 'nonhost':
                isetmap = face_intervals.nonhost_isetmap
            else:
                raise InvalidUsage('Unknown role: {}'.format(role))
        elif gender == 'male':
            if role is None:
                isetmap = face_intervals.male_isetmap
            elif role == 'host':
                isetmap = face_intervals.male_host_isetmap
            elif role == 'nonhost':
                isetmap = face_intervals.male_nonhost_isetmap
            else:
                raise InvalidUsage('Unknown role: {}'.format(role))
        elif gender == 'female':
            if role is None:
                isetmap = face_intervals.female_isetmap
            elif role == 'host':
                isetmap = face_intervals.female_host_isetmap
            elif role == 'nonhost':
                isetmap = face_intervals.female_nonhost_isetmap
            else:
                raise InvalidUsage('Unknown role: {}'.format(role))
        else:
            raise InvalidUsage('Unknown gender: {}'.format(gender))
    return isetmap


def get_onscreen_face_isetmaps(
    face_intervals: FaceIntervals, all_person_intervals: AllPersonIntervals
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
                    face_intervals.num_faces_ilistmap, 0xFF, num_faces,
                    3000, 0))

        elif k.startswith(SearchParameter.onscreen_face):
            filter_str = request.args.get(k, '', type=str).strip().lower()
            isetmap = get_onscreen_face_isetmap(
                face_intervals, all_person_intervals, filter_str)
            if isetmap:
                result.append(isetmap)

    return result if result else None


def get_face_time_filter_mask(
    gender: Optional[str], role: Optional[str]
) -> Tuple[int, int]:
    payload_value = 0
    payload_mask = 0
    if gender:
        gender = gender.strip().lower()
        if gender and gender != 'all':
            payload_mask |= 0b1
            if gender == 'male':
                payload_value |= 0b1
            elif gender == 'female':
                pass
            else:
                raise InvalidUsage('Unknown gender: {}'.format(gender))
    if role:
        role = role.strip().lower()
        if role and role != 'all':
            payload_mask |= 0b10
            if role == 'host':
                payload_value |= 0b10
            elif role == 'nonhost':
                pass
            else:
                raise InvalidUsage('Unknown role: {}'.format(role))
    return payload_mask, payload_value


def get_face_time_agg_fn(
    face_intervals: FaceIntervals,
    all_person_intervals: AllPersonIntervals
) -> FaceTimeAggregateFn:
    face_str = request.args.get(SearchParameter.face, '', type=str)
    gender, role, person = parse_face_filter_str(face_str)
    payload_mask, payload_value = get_face_time_filter_mask(gender, role)

    if person is not None:
        person_intervals = all_person_intervals.get(person, None)
        if person_intervals is None:
            raise InvalidUsage('{} is not a valid person'.format(person))
        ilistmap = person_intervals.ilistmap
    else:
        ilistmap = face_intervals.all_ilistmap

    def f(video: Video, intervals: List[Interval]) -> float:
        return ilistmap.intersect_sum(
            video.id, intervals, payload_mask, payload_value, True
        ) / 1000
    return f


def get_face_time_intersect_fn(
    face_intervals: FaceIntervals,
    all_person_intervals: AllPersonIntervals
) -> FaceTimeIntersectFn:
    face_str = request.args.get(SearchParameter.face, '', type=str)
    gender, role, person = parse_face_filter_str(face_str)
    payload_mask, payload_value = get_face_time_filter_mask(gender, role)

    if person:
        person_isetmap = all_person_intervals.get(person, None)
        if person_isetmap is None:
            raise InvalidUsage('{} is not a valid person'.format(person))
        ilistmap = person_isetmap.ilistmap
    else:
        ilistmap = face_intervals.all_ilistmap

    def f(video: Video, intervals: List[Interval]) -> List[Interval]:
        return ilistmap.intersect(
            video.id, intervals, payload_mask, payload_value, True)
    return f


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
    cache_seconds: int, authorized_users: List[LoginCredentials]
) -> Flask:
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

    (
        video_dict, commercial_isetmap, face_intervals, all_person_intervals
    ) = load_video_data(data_dir)
    index, documents, lexicon = load_index(index_dir)

    app = Flask(__name__, template_folder=TEMPLATE_DIR,
                static_folder=STATIC_DIR)

    # Make sure document name equals video name
    documents = Documents([
        d._replace(name=get_video_name(d.name))
        for d in documents])

    video_by_id: Dict[int, Video] = {
        v.id: v for v in video_dict.values()
    }
    document_by_name: Dict[str, Documents.Document] = {
        d.name: d for d in documents
    }

    all_shows: List[str] = list(sorted({v.show for v in video_dict.values()}))

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
            'home.html', uptime=_get_uptime(),
            countables=Countable, default_agg_by=DEFAULT_AGGREGATE_BY,
            default_text_window=DEFAULT_TEXT_WINDOW,
            default_is_commercial=DEFAULT_IS_COMMERCIAL.name)

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

    @app.route('/videos')
    def show_videos() -> Response:
        return render_template('videos.html')

    @app.route('/people')
    def get_people() -> Response:
        Person = namedtuple('person', ['name', 'screen_time'])
        return render_template(
            'people.html', people=sorted([
                Person(name, round(intervals.isetmap.sum() / 60000, 1))
                for name, intervals in all_person_intervals.items()
            ], key=lambda x: x.name))

    @app.route('/instructions')
    def get_instructions() -> Response:
        return render_template(
            'instructions.html', host=request.host, uptime=_get_uptime(),
            countables=Countable, parameters=SearchParameter,
            default_text_window=DEFAULT_TEXT_WINDOW,
            default_is_commercial=DEFAULT_IS_COMMERCIAL.name)

    @app.route('/shows')
    def get_shows() -> Response:
        tmp = defaultdict(float)
        for v in video_dict.values():
            tmp[(v.channel, v.show)] += v.num_frames / v.fps
        channel_and_show = [
            (channel, show, round(seconds / 3600))
            for (channel, show), seconds in tmp.items()]
        channel_and_show.sort()
        return render_template('shows.html', shows=channel_and_show)

    @app.route('/static/js/query.js')
    def get_query_js() -> Response:
        resp = make_response(render_template(
            'js/query.js', parameters=SearchParameter, countables=Countable,
            shows=all_shows, people=sorted(all_person_intervals.keys())))
        resp.headers['Content-type'] = 'text/javascript'
        resp.cache_control.max_age = cache_seconds
        return resp

    @app.route('/static/js/chart.js')
    def get_chart_js() -> Response:
        resp = make_response(render_template(
            'js/chart.js', countables=Countable,
            video_endpoint=video_endpoint))
        resp.headers['Content-type'] = 'text/javascript'
        resp.cache_control.max_age = cache_seconds
        return resp

    @app.route('/static/js/home.js')
    def get_home_js() -> Response:
        start_date = max(min(v.date for v in video_dict.values()), MIN_DATE)
        end_date = min(max(v.date for v in video_dict.values()), MAX_DATE)
        resp = make_response(render_template(
            'js/home.js', parameters=SearchParameter, countables=Countable,
            host=request.host, start_date=format_date(start_date),
            end_date=format_date(end_date),
            default_text_window=DEFAULT_TEXT_WINDOW,
            shows=all_shows, people=sorted(all_person_intervals.keys())
        ))
        resp.headers['Content-type'] = 'text/javascript'
        resp.cache_control.max_age = cache_seconds
        return resp

    @app.route('/static/js/videos.js')
    def get_videos_js() -> Response:
        return render_template(
            'js/videos.js', countables=Countable, parameters=SearchParameter,
            video_endpoint=video_endpoint,
            frameserver_endpoint=frameserver_endpoint,
            archive_video_endpoint=archive_video_endpoint)

    def _get_document_token_count(
        video: Video, document: Documents.Document, is_commercial: Ternary
    ) -> int:
        if is_commercial == Ternary.both:
            return index.document_length(document)
        else:
            commercial_tokens = 0
            for a, b in commercial_isetmap.get_intervals(
                video.id, True
            ):
                min_idx = index.position(document.id, a)
                max_idx = index.position(document.id, b)
                if max_idx > min_idx:
                    commercial_tokens += max(0, max_idx - min_idx)
            if is_commercial == Ternary.true:
                return commercial_tokens
            else:
                return index.document_length(document) - commercial_tokens

    def _in_commercial(v: Video, p: CaptionIndex.Posting) -> bool:
        return commercial_isetmap.is_contained(
            v.id, int((p.start + p.end) / 2 * 1000), True)

    def _count_mentions(
        accumulator: DateAccumulator,
        text_query_str: str, is_commercial: Ternary,
        video_filter: Optional[VideoFilterFn],
        onscreen_face_isetmaps: Optional[List[MmapIntervalSetMapping]]
    ) -> None:
        missing_videos = 0
        matched_videos = 0
        filtered_videos = 0

        if text_query_str:
            text_query = Query(text_query_str.upper())
            for result in text_query.execute(
                lexicon, index, ignore_word_not_found=True
            ):
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

                postings = result.postings
                if onscreen_face_isetmaps:
                    postings = [
                        p for p in postings if has_onscreen_face(
                            video, milliseconds((p.start + p.end) / 2),
                            onscreen_face_isetmaps
                        )]

                if is_commercial != Ternary.both:
                    if is_commercial == Ternary.true:
                        total = sum(int(_in_commercial(video, p))
                                    for p in postings)
                    else:
                        total = sum(1 - int(_in_commercial(video, p))
                                    for p in postings)
                else:
                    total = len(postings)
                accumulator.add(video.date, video.id, total)
        else:
            if onscreen_face_isetmaps:
                raise InvalidUsage(
                    'Not implemented: all text and face filter. '
                    'Please remove onscreen.face to proceed.')

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

                accumulator.add(
                    video.date, video.id, _get_document_token_count(
                        video, document, is_commercial))

        print('Matched {} videos, {} filtered, {} missing'.format(
              matched_videos, filtered_videos, missing_videos))

    def _count_time(
        accumulator: DateAccumulator,
        caption_query_str: str, caption_window: int,
        is_commercial: Ternary,
        video_filter: Optional[VideoFilterFn],
        face_time_agg_fn: Optional[FaceTimeAggregateFn],
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
                        video, commercial_isetmap, intervals)
                else:
                    intervals = minus_isetmap(
                        video, commercial_isetmap, intervals)
                if not intervals:
                    return

            if onscreen_face_isetmaps:
                for isetmap in onscreen_face_isetmaps:
                    intervals = intersect_isetmap(video, isetmap, intervals)
                    if not intervals:
                        return

            if face_time_agg_fn:
                accumulator.add(
                    video.date, video.id,
                    face_time_agg_fn(video, intervals if intervals else
                                     get_entire_video_ms_interval(video)))
            else:
                if intervals is not None:
                    accumulator.add(
                        video.date, video.id,
                        sum(i[1] - i[0] for i in intervals) / 1000)
                else:
                    accumulator.add(video.date, video.id,
                                    video.num_frames / video.fps)

        if caption_query_str:
            for result in Query(
                caption_query_str.upper()
            ).execute(lexicon, index, ignore_word_not_found=True):
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

                postings = result.postings
                if caption_window > 0:
                    postings = PostingUtil.deoverlap(PostingUtil.dilate(
                        postings, caption_window,
                        video.num_frames / video.fps))
                helper(video, [(int(p.start * 1000), int(p.end * 1000))
                               for p in postings])
        else:
            for video in video_dict.values():
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
        is_commercial = get_is_commercial()

        accumulator = (
            DetailedDateAccumulator(aggregate_fn)
            if request.args.get(
                SearchParameter.detailed, 'true', type=str
            ) == 'true' else SimpleDateAcumulator(aggregate_fn))
        if countable == Countable.mentions:
            assert_param_not_set(
                SearchParameter.caption_text, countable.value,
                Countable.facetime.value + ' or ' + Countable.videotime.value)
            assert_param_not_set(
                SearchParameter.caption_window, countable.value,
                Countable.facetime.value + ' or ' + Countable.videotime.value)
            assert_param_not_set(
                SearchParameter.face, countable.value,
                Countable.facetime.value)

            text_query = request.args.get(
                SearchParameter.mention_text, '', type=str).strip()
            _count_mentions(
                accumulator,
                text_query, is_commercial, video_filter,
                get_onscreen_face_isetmaps(
                    face_intervals, all_person_intervals))

        elif (countable == Countable.videotime
              or countable == Countable.facetime):
            assert_param_not_set(
                SearchParameter.mention_text, countable.value,
                Countable.mentions.value)
            if countable == Countable.videotime:
                assert_param_not_set(
                    SearchParameter.face, countable.value,
                    Countable.facetime.value)

            caption_query = request.args.get(
                SearchParameter.caption_text, '', type=str).strip()
            caption_window = request.args.get(
                SearchParameter.caption_window, DEFAULT_TEXT_WINDOW,
                type=int)
            _count_time(
                accumulator,
                caption_query, caption_window,
                is_commercial, video_filter,
                None if countable == Countable.videotime else
                get_face_time_agg_fn(face_intervals, all_person_intervals),
                get_onscreen_face_isetmaps(
                    face_intervals, all_person_intervals))

        else:
            raise NotImplementedError('unreachable code')

        resp = jsonify(accumulator.get())
        resp.cache_control.max_age = cache_seconds
        return resp

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

    def _count_mentions_in_videos(
        videos: List[Video],
        text_query_str: str, is_commercial: Ternary,
        onscreen_face_isetmaps: Optional[List[MmapIntervalSetMapping]]
    ) -> List[JsonObject]:
        results = []

        def helper(
            video: Video, postings: List['CaptionIndex.Posting']
        ) -> None:
            postings = PostingUtil.deoverlap(postings)

            if onscreen_face_isetmaps:
                postings = [
                    p for p in postings if has_onscreen_face(
                        video, milliseconds((p.start + p.end) / 2),
                        onscreen_face_isetmaps
                    )]

            if is_commercial != Ternary.both:
                is_commercial_bool = is_commercial == Ternary.true
                postings = [
                    p for p in postings
                    if is_commercial_bool == _in_commercial(video, p)]

            if len(postings) > 0:
                results.append({
                    'metadata': _video_to_dict(video),
                    'intervals': [
                        (p.start, p.end) for p in postings
                    ],
                    'captions': _get_captions(document)
                })

        if text_query_str:
            # Run the query on the selected videos
            for result in Query(text_query_str.upper()).execute(
                lexicon, index, [documents[v.name] for v in videos
                                 if v.name in documents]
            ):
                document = documents[result.id]
                video = video_dict[document.name]
                postings = result.postings
                helper(video, postings)
        else:
            # Empty query
            for video in videos:
                document = document_by_name.get(video.name)
                intervals = index.intervals(document) if document else []

                if onscreen_face_isetmaps or is_commercial != Ternary.both:
                    helper(video, intervals)
                else:
                    results.append(_get_entire_video(video))
        return results

    def _count_time_in_videos(
        videos: List[Video],
        caption_query_str: str, caption_window: int,
        is_commercial: Ternary,
        face_time_isect_fn: Optional[FaceTimeIntersectFn],
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
                        video, commercial_isetmap, intervals)
                else:
                    intervals = minus_isetmap(
                        video, commercial_isetmap, intervals)
                if not intervals:
                    return

            if onscreen_face_isetmaps:
                for isetmap in onscreen_face_isetmaps:
                    intervals = intersect_isetmap(video, isetmap, intervals)
                    if not intervals:
                        return

            if face_time_isect_fn:
                intervals = face_time_isect_fn(
                    video,
                    intervals if intervals else
                    get_entire_video_ms_interval(video))
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
            for result in Query(caption_query_str.upper()).execute(
                lexicon, index, [documents[v.name] for v in videos
                                 if v.name in documents]
            ):
                document = documents[result.id]
                video = video_dict[document.name]
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
        is_commercial = get_is_commercial()

        if countable == Countable.mentions:
            text_query = request.args.get(
                SearchParameter.mention_text, '', type=str).strip()
            assert_param_not_set(
                SearchParameter.caption_text, countable.value,
                Countable.facetime.value + ' or ' + Countable.videotime.value)
            assert_param_not_set(
                SearchParameter.caption_window, countable.value,
                Countable.facetime.value + ' or ' + Countable.videotime.value)
            assert_param_not_set(
                SearchParameter.face,
                countable.value, Countable.facetime.value)

            results = _count_mentions_in_videos(
                videos, text_query, is_commercial,
                get_onscreen_face_isetmaps(
                    face_intervals, all_person_intervals))

        elif (countable == Countable.videotime
              or countable == Countable.facetime):
            assert_param_not_set(
                SearchParameter.mention_text, countable.value,
                Countable.mentions.value)
            if countable == Countable.videotime:
                assert_param_not_set(
                    SearchParameter.face,
                    countable.value, Countable.facetime.value)

            caption_query = request.args.get(
                SearchParameter.caption_text, '', type=str).strip()
            caption_window = request.args.get(
                SearchParameter.caption_window, DEFAULT_TEXT_WINDOW,
                type=int)
            results = _count_time_in_videos(
                videos, caption_query, caption_window, is_commercial,
                None if countable == Countable.videotime
                else get_face_time_intersect_fn(
                    face_intervals, all_person_intervals),
                get_onscreen_face_isetmaps(
                    face_intervals, all_person_intervals))

        else:
            raise NotImplementedError('unreachable code')

        resp = jsonify(results)
        resp.cache_control.max_age = cache_seconds
        return resp

    def _get_captions(document: Documents.Document) -> List[Caption]:
        lines = []
        for p in index.intervals(document):
            if p.len > 0:
                tokens: List[str] = [
                    lexicon.decode(t)
                    for t in index.tokens(document, p.idx, p.len)]
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
        resp.cache_control.max_age = cache_seconds * 100
        return resp

    return app
