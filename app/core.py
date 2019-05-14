"""
Main application code
"""

from datetime import datetime, timedelta
import os
import json
from flask import Flask, Response, jsonify, request, render_template, send_file
from typing import Dict, List, Set, Tuple, Optional

from captions import CaptionIndex, Documents, Lexicon   # type: ignore
from captions.util import PostingUtil                   # type: ignore
from captions.query import Query                        # type: ignore
from rs_intervalset import (                            # type: ignore
    MmapIntervalSetMapping, MmapIntervalListMapping)

from .types import *
from .error import InvalidUsage
from .parsing import *
from .sum import *
from .load import get_video_name, load_video_data, load_index


FILE_DIR = os.path.dirname(os.path.realpath(__file__))
TEMPLATE_DIR = os.path.join(FILE_DIR, '..', 'templates')
STATIC_DIR = os.path.join(FILE_DIR, '..', 'static')


MIN_DATE = datetime(2010, 1, 1)
MAX_DATE = datetime(2018, 4, 1)
DEFAULT_TEXT_WINDOW = 30
DEFAULT_IS_COMMERCIAL = Ternary.false


def milliseconds(s: float) -> int:
    return int(s * 1000)


def get_entire_video_ms_interval(video: Video) -> List[Interval]:
    return [(0, int(video.num_frames / video.fps * 1000))]


def assert_option_not_set(
    option: str, countable: str, suggested_var: Optional[str] = None
) -> None:
    if option in request.args:
        mesg = '"{}" cannot be used when counting "{}".'.format(
           option, countable)
        if suggested_var:
            mesg += ' Try counting "{}" instead.'.format(suggested_var)
        raise InvalidUsage(mesg)


def get_video_filter() -> Optional[VideoFilterFn]:
    start_date = parse_date(request.args.get('start_date', None, type=str))
    end_date = parse_date(request.args.get('end_date', None, type=str))
    channel = request.args.get('channel', None, type=str)
    show = request.args.get('show', None, type=str)
    hours = parse_hour_set(request.args.get('hour', None, type=str))
    daysofweek = parse_day_of_week_set(
        request.args.get('dayofweek', None, type=str))

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
    agg = request.args.get('aggregate', None, type=str)
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
    value = request.args.get('iscommercial', None, type=str)
    return Ternary[value] if value else DEFAULT_IS_COMMERCIAL


def get_countable() -> Countable:
    value = request.args.get('count', None, type=str)
    if value is None:
        raise InvalidUsage('no count variable specified')
    return Countable[value]


def get_onscreen_face_isetmap(
    face_intervals: FaceIntervals
) -> MmapIntervalSetMapping:
    filter_str = request.args.get(
        'onscreen.face', '', type=str
    ).strip().lower()
    if not filter_str:
        return None
    if filter_str == 'all':
        isetmap = face_intervals.all
    elif filter_str == 'male':
        isetmap = face_intervals.male
    elif filter_str == 'female':
        isetmap = face_intervals.female
    elif filter_str == 'host':
        isetmap = face_intervals.host
    elif filter_str == 'nonhost':
        isetmap = face_intervals.nonhost
    elif filter_str == 'male:host':
        isetmap = face_intervals.male_host
    elif filter_str == 'female:host':
        isetmap = face_intervals.female_host
    elif filter_str == 'male:nonhost':
        isetmap = face_intervals.male_nonhost
    elif filter_str == 'female:nonhost':
        isetmap = face_intervals.female_nonhost
    else:
        raise InvalidUsage('{} is not a valid face filter'.format(filter_str))
    return isetmap


def get_onscreen_face_filter(
    face_intervals: FaceIntervals
) -> Optional[OnScreenFilterFn]:
    isetmap = get_onscreen_face_isetmap(face_intervals)
    if isetmap is None:
        return None
    return lambda v, t: isetmap.is_contained(v, t, True)


def get_onscreen_person_isetmap(
    person_intervals: PersonIntervals
) -> MmapIntervalSetMapping:
    filter_str = request.args.get(
        'onscreen.person', '', type=str).strip().lower()
    if not filter_str:
        return None
    isetmap = person_intervals.get(filter_str, None)
    if isetmap is None:
        raise InvalidUsage('{} is not a valid person'.format(filter_str))
    return isetmap


def get_onscreen_person_filter(
    person_intervals: PersonIntervals
) -> Optional[OnScreenFilterFn]:
    isetmap = get_onscreen_person_isetmap(person_intervals)
    if isetmap is None:
        return None
    return lambda v, t: isetmap.is_contained(v, t, True)


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
                raise InvalidUsage('{} is not a valid gender'.format(gender))
    if role:
        role = role.strip().lower()
        if role and role != 'all':
            payload_mask |= 0b10
            if role == 'host':
                payload_value |= 0b10
            elif role == 'nonhost':
                pass
            else:
                raise InvalidUsage('{} is not a valid role'.format(role))
    return payload_mask, payload_value


def get_face_time_agg_fn(
    all_faces_ilistmap: MmapIntervalListMapping,
    person_intervals: PersonIntervals
) -> FaceTimeAggregateFn:
    if 'person' in request.args:
        assert_option_not_set('gender', 'person')
        assert_option_not_set('role', 'person')
        person_str = request.args.get('person', '', type=str).strip().lower()
        if not person_str:
            raise InvalidUsage('person cannot be blank')
        person_isetmap = person_intervals.get(person_str, None)
        if person_isetmap is None:
            raise InvalidUsage('{} is not a valid person'.format(person_str))

        def f(video: Video, intervals: List[Interval]) -> float:
            return sum(
                b - a for a, b in
                person_isetmap.intersect(video.id, intervals, True)
            ) / 1000
    else:
        gender = request.args.get('gender', None, type=str)
        role = request.args.get('role', None, type=str)
        payload_mask, payload_value = get_face_time_filter_mask(gender, role)

        def f(video: Video, intervals: List[Interval]) -> float:
            return all_faces_ilistmap.intersect_sum(
                video.id, intervals, payload_mask, payload_value, True
            ) / 1000
    return f


def get_face_time_intersect_fn(
    all_faces_ilistmap: MmapIntervalListMapping,
    person_intervals: PersonIntervals
) -> FaceTimeIntersectFn:
    if 'person' in request.args:
        assert_option_not_set('gender', 'person')
        assert_option_not_set('role', 'person')
        person_str = request.args.get('person', '', type=str).strip().lower()
        if not person_str:
            raise InvalidUsage('person cannot be blank')
        person_isetmap = person_intervals.get(person_str, None)
        if person_isetmap is None:
            raise InvalidUsage('{} is not a valid person'.format(person_str))

        def f(video: Video, intervals: List[Interval]) -> List[Interval]:
            return intersect_isetmap(video, person_isetmap, intervals)
    else:
        gender = request.args.get('gender', None, type=str)
        role = request.args.get('role', None, type=str)
        payload_mask, payload_value = get_face_time_filter_mask(gender, role)

        def f(video: Video, intervals: List[Interval]) -> List[Interval]:
            return all_faces_ilistmap.intersect(
                video.id, intervals, payload_mask, payload_value, True)
    return f


def get_shows_by_channel(video_dict: Dict[str, Video]) -> Dict[str, List[str]]:
    tmp_shows_by_channel: Dict[str, Set[str]] = {}
    for v in video_dict.values():
        if v.channel not in tmp_shows_by_channel:
            tmp_shows_by_channel[v.channel] = set()
        tmp_shows_by_channel[v.channel].add(v.show)
    return {k: list(sorted(v)) for k, v in tmp_shows_by_channel.items()}


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


def build_app(
    data_dir: str, index_dir: str, frameserver_endpoint: Optional[str],
    cache_seconds: int
) -> Flask:
    (
        video_dict, commercial_isetmap, all_faces_ilistmap,
        face_intervals, person_intervals
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

    shows_by_channel = get_shows_by_channel(video_dict)
    all_shows: List[str] = list(sorted({
        show for shows in shows_by_channel.values() for show in shows
    }))

    @app.errorhandler(InvalidUsage)
    def _handle_invalid_usage(error: InvalidUsage) -> Response:
        response = jsonify(error.to_dict())
        response.status_code = error.status_code
        return response

    @app.route('/')
    def root() -> Response:
        start_date = max(min(v.date for v in video_dict.values()), MIN_DATE)
        end_date = min(max(v.date for v in video_dict.values()), MAX_DATE)
        return render_template(
            'home.html', host=request.host, aggregate='month',
            start_date=format_date(start_date),
            end_date=format_date(end_date), shows=all_shows,
            default_text_window=DEFAULT_TEXT_WINDOW,
            default_is_commercial=DEFAULT_IS_COMMERCIAL.name)

    @app.route('/embed')
    def embed() -> Response:
        return render_template('embed.html', shows=all_shows)

    @app.route('/videos')
    def show_videos() -> Response:
        return render_template('videos.html',
                               frameserver_endpoint=frameserver_endpoint)

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

    def _count_mentions(
        accumulator: DateAccumulator,
        text_query_str: str, is_commercial: Ternary,
        video_filter: Optional[VideoFilterFn],
        onscreen_face_filter: Optional[OnScreenFilterFn],
        onscreen_person_filter: Optional[OnScreenFilterFn]
    ) -> None:
        missing_videos = 0
        matched_videos = 0
        filtered_videos = 0

        if text_query_str:
            text_query = Query(text_query_str.upper())
            for result in text_query.execute(lexicon, index):
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
                if onscreen_person_filter:
                    postings = [
                        p for p in postings
                        if onscreen_person_filter(
                            video.id, milliseconds((p.start + p.end) / 2))]
                if onscreen_face_filter:
                    postings = [
                        p for p in postings
                        if onscreen_face_filter(
                            video.id, milliseconds((p.start + p.end) / 2))]

                if is_commercial != Ternary.both:

                    def in_commercial(p: CaptionIndex.Posting) -> int:
                        return 1 if commercial_isetmap.is_contained(
                            video.id, int((p.start + p.end) / 2 * 1000), True
                        ) else 0

                    if is_commercial == Ternary.true:
                        total = sum(in_commercial(p) for p in postings)
                    else:
                        total = sum(1 - in_commercial(p) for p in postings)
                else:
                    total = len(postings)
                accumulator.add(video.date, video.id, total)
        else:
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

                if onscreen_person_filter:
                    raise InvalidUsage(
                        'Not implemented: empty text and person filter')
                if onscreen_face_filter:
                    raise InvalidUsage(
                        'Not implemented: empty text and face filter')

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
        onscreen_face_isetmap: Optional[MmapIntervalSetMapping],
        onscreen_person_isetmap: Optional[MmapIntervalSetMapping]
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

            if onscreen_person_isetmap:
                intervals = intersect_isetmap(
                    video, onscreen_person_isetmap, intervals)
                if not intervals:
                    return
            if onscreen_face_isetmap:
                intervals = intersect_isetmap(
                    video, onscreen_face_isetmap, intervals)
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
            ).execute(lexicon, index):
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
            if request.args.get('detailed', 'true', type=str) == 'true' else
            SimpleDateAcumulator(aggregate_fn))
        if countable == Countable.mentions:
            assert_option_not_set(
                'caption.text', countable.value,
                Countable.facetime.value + ' or ' + Countable.videotime.value)
            assert_option_not_set(
                'caption.window', countable.value,
                Countable.facetime.value + ' or ' + Countable.videotime.value)
            assert_option_not_set(
                'gender', countable.value, Countable.facetime.value)
            assert_option_not_set(
                'role', countable.value, Countable.facetime.value)
            assert_option_not_set(
                'person', countable.value, Countable.facetime.value)

            text_query = request.args.get('text', '', type=str).strip()
            _count_mentions(
                accumulator,
                text_query, is_commercial, video_filter,
                get_onscreen_face_filter(face_intervals),
                get_onscreen_person_filter(person_intervals))

        elif (countable == Countable.videotime
              or countable == Countable.facetime):
            assert_option_not_set(
                'text', countable.value, Countable.mentions.value)
            if countable == Countable.videotime:
                assert_option_not_set(
                    'gender', countable.value, Countable.facetime.value)
                assert_option_not_set(
                    'role', countable.value, Countable.facetime.value)
                assert_option_not_set(
                    'person', countable.value, Countable.facetime.value)

            caption_query = request.args.get(
                'caption.text', '', type=str).strip()
            caption_window = request.args.get(
                'caption.window', DEFAULT_TEXT_WINDOW, type=int)
            _count_time(
                accumulator,
                caption_query, caption_window,
                is_commercial, video_filter,
                None if countable == Countable.videotime else
                get_face_time_agg_fn(all_faces_ilistmap, person_intervals),
                get_onscreen_face_isetmap(face_intervals),
                get_onscreen_person_isetmap(person_intervals))

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
        onscreen_face_filter: Optional[OnScreenFilterFn],
        onscreen_person_filter: Optional[OnScreenFilterFn]
    ) -> List[JsonObject]:
        results = []
        if text_query_str:
            # Run the query on the selected videos
            for result in Query(text_query_str.upper()).execute(
                lexicon, index, [documents[v.name] for v in videos
                                 if v.name in documents]
            ):
                document = documents[result.id]
                video = video_dict[document.name]
                postings = result.postings

                if onscreen_person_filter:
                    postings = [
                        p for p in postings
                        if onscreen_person_filter(
                            video.id, milliseconds((p.start + p.end) / 2))]
                if onscreen_face_filter:
                    postings = [
                        p for p in postings
                        if onscreen_face_filter(
                            video.id, milliseconds((p.start + p.end) / 2))]

                if is_commercial != Ternary.both:

                    def in_commercial(p: CaptionIndex.Posting) -> bool:
                        return commercial_isetmap.is_contained(
                            video.id, int((p.start + p.end) / 2 * 1000), True)

                    is_commercial_bool = is_commercial == Ternary.true
                    postings = [p for p in postings
                                if is_commercial_bool == in_commercial(p)]

                if len(postings) > 0:
                    results.append({
                        'metadata': _video_to_dict(video),
                        'intervals': [
                            (p.start, p.end) for p in postings
                        ],
                        'captions': _get_captions(document)
                    })
        else:
            if onscreen_face_filter:
                raise InvalidUsage(
                    'not implemented: empty text and face filter')
            if onscreen_person_filter:
                raise InvalidUsage(
                    'not implemented: empty text and person filter')
            if is_commercial != Ternary.both:
                raise InvalidUsage(
                    'not implemented: empty text and commercial filter')

            # Return the entire video
            for v in videos:
                results.append(_get_entire_video(v))
        return results

    def _count_time_in_videos(
        videos: List[Video],
        caption_query_str: str, caption_window: int,
        is_commercial: Ternary,
        face_time_isect_fn: Optional[FaceTimeIntersectFn],
        onscreen_face_isetmap: Optional[MmapIntervalSetMapping],
        onscreen_person_isetmap: Optional[MmapIntervalSetMapping]
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

            if onscreen_person_isetmap:
                intervals = intersect_isetmap(
                    video, onscreen_person_isetmap, intervals)
                if not intervals:
                    return
            if onscreen_face_isetmap:
                intervals = intersect_isetmap(
                    video, onscreen_face_isetmap, intervals)
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
                    'intervals': [
                        (i[0] / 1000, i[1] / 1000) for i in intervals
                    ]
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
                helper(video, [(int(p.start * 1000), int(p.end * 1000))
                               for p in postings])
        else:
            for v in videos:
                helper(v)
        return results

    @app.route('/search-videos')
    def search_videos() -> Response:
        ids = request.args.get('ids', None, type=str)
        if not ids:
            raise InvalidUsage('must specify video ids')
        videos = [video_by_id[i] for i in json.loads(ids)]
        countable = get_countable()
        is_commercial = get_is_commercial()

        if countable == Countable.mentions:
            text_query = request.args.get('text', '', type=str).strip()
            assert_option_not_set(
                'caption.text', countable.value,
                Countable.facetime.value + ' or ' + Countable.videotime.value)
            assert_option_not_set(
                'caption.window', countable.value,
                Countable.facetime.value + ' or ' + Countable.videotime.value)
            assert_option_not_set(
                'gender', countable.value, Countable.facetime.value)
            assert_option_not_set(
                'role', countable.value, Countable.facetime.value)
            assert_option_not_set(
                'person', countable.value, Countable.facetime.value)

            results = _count_mentions_in_videos(
                videos, text_query, is_commercial,
                get_onscreen_face_filter(face_intervals),
                get_onscreen_person_filter(person_intervals))

        elif (countable == Countable.videotime
              or countable == Countable.facetime):
            assert_option_not_set(
                'text', countable.value, Countable.mentions.value)
            if countable == Countable.videotime:
                assert_option_not_set(
                    'gender', countable.value, Countable.facetime.value)
                assert_option_not_set(
                    'role', countable.value, Countable.facetime.value)
                assert_option_not_set(
                    'person', countable.value, Countable.facetime.value)

            caption_query = request.args.get(
                'caption.text', '', type=str).strip()
            caption_window = request.args.get(
                'caption.window', DEFAULT_TEXT_WINDOW, type=int)
            results = _count_time_in_videos(
                videos, caption_query, caption_window, is_commercial,
                None if countable == Countable.videotime
                else get_face_time_intersect_fn(
                    all_faces_ilistmap, person_intervals),
                get_onscreen_face_isetmap(face_intervals),
                get_onscreen_person_isetmap(person_intervals))

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
                start: float = round(p.start, 1)
                end: float = round(p.end, 1)
                lines.append((start, end, ' '.join(tokens)))
        return lines

    @app.route('/captions/<int:i>')
    def get_captions(i: int) -> Response:
        video = video_by_id[i]
        document = document_by_name[video.name]
        resp = jsonify(_get_captions(document))
        resp.cache_control.max_age = cache_seconds * 100
        return resp

    @app.route('/shows')
    def get_shows() -> Response:
        return jsonify(shows_by_channel)

    @app.route('/people')
    def get_people() -> Response:
        return jsonify(sorted(person_intervals.keys()))

    return app
