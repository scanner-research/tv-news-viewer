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
from enum import Enum
from flask import (
    Flask, Response, jsonify, request, render_template, send_file,
    make_response)
from flask_httpauth import HTTPBasicAuth                # type: ignore
from typing import (
    Any, Dict, List, Set, Tuple, Optional, Iterable, Generator, NamedTuple)

from captions import CaptionIndex, Documents, Lexicon   # type: ignore
from captions.util import PostingUtil                   # type: ignore
from captions.query import Query                        # type: ignore
from rs_intervalset import (                            # type: ignore
    MmapIntervalSetMapping, MmapIntervalListMapping)
from rs_intervalset.wrapper import (                    # type: ignore
    MmapIListToISetMapping, MmapUnionIlistsToISetMapping,
    MmapISetSubsetMapping, MmapISetIntersectionMapping)

from .types import *
from .error import *
from .parsing import *
from .sum import *
from .load import (
    get_video_name, load_app_data, VideoDataContext, CaptionDataContext)
from .hash import sha256


FILE_DIR = os.path.dirname(os.path.realpath(__file__))
TEMPLATE_DIR = os.path.join(FILE_DIR, '..', 'templates')
STATIC_DIR = os.path.join(FILE_DIR, '..', 'static')

MAX_PERSON_ATTRIBUTE_QUERY = 5000


class SearchResultType(Enum):
    video_set = 0
    python_iset = 1
    rust_iset = 2


class SearchResult(NamedTuple):
    type: SearchResultType
    data: Any


class SearchContext(NamedTuple):
    start_date: Optional[datetime]
    end_date: Optional[datetime]
    video: Optional[str] = None
    channel: Optional[str] = None
    show: Optional[str] = None
    hours: Optional[Set[int]] = None
    days_of_week: Optional[Set[int]] = None
    text_window: int = 0


# Execution order preference (lower is higher)
SEARCH_KEY_EXEC_PRIORITY = {
    SearchKey.video: 0,
    SearchKey.channel: 0,
    SearchKey.show: 0,
    SearchKey.hour: 0,
    SearchKey.day_of_week: 0,
    'or': 1,
    'and': 2,
    SearchKey.text: 3,
    SearchKey.face_name: 4,
    SearchKey.face_tag: 5
}


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


def get_aggregate_fn() -> AggregateFn:
    agg = request.args.get(SearchParam.aggregate, None, type=str)
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


def get_transcript_intervals(
    cdc: CaptionDataContext, vdc: VideoDataContext,
    text_str: str, text_window: int, video_filter: VideoFilterFn
) -> Generator[Tuple[Video, List[Interval]], None, None]:
    missing_videos = 0
    matched_videos = 0
    filtered_videos = 0

    query = None
    try:
        query = Query(text_str.upper())
    except Exception as e:
        raise InvalidTranscriptSearch(text_str)
    for result in query.execute(
        cdc.lexicon, cdc.index, ignore_word_not_found=True
    ):
        document = cdc.documents[result.id]
        video = vdc.video_dict.get(document.name)
        if video is None:
            missing_videos += 1
            continue
        else:
            matched_videos += 1
        if video_filter is not None and not video_filter(video):
            filtered_videos += 1
            continue

        postings = result.postings
        if text_window > 0:
            postings = PostingUtil.deoverlap(PostingUtil.dilate(
                postings, text_window,
                video.num_frames / video.fps))
        yield (
            video,
            [(int(p.start * 1000), int(p.end * 1000)) for p in postings])


GLOBAL_TAGS = {'male', 'female', 'host', 'nonhost'}


def get_global_tags(tag: PersonTags) -> Set[str]:
    return {t for t in tag.tags if t in GLOBAL_TAGS}


def either_tag_or_none(a: str, b: str, s: set) -> Optional[str]:
    has_a = a in s
    has_b = b in s
    if has_a and has_b:
        raise InvalidUsage(
            'Cannot use {} and {} tags simultaneously'.format(a, b))
    elif has_a:
        return a
    elif has_b:
        return b
    return None


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


def interpret_global_tags(
    global_tags: Set[str]
) -> Tuple[Optional[str], Optional[str]]:
    gender_tag = either_tag_or_none('male', 'female', global_tags)
    host_tag = either_tag_or_none('host', 'nonhost', global_tags)
    return gender_tag, host_tag


def person_tags_to_people(
    video_data_context: VideoDataContext, tags: Iterable[str]
) -> List[MmapIntervalListMapping]:
    selected_names = None
    for tag in tags:
        if tag not in GLOBAL_TAGS:
            people_with_tag = \
                video_data_context.all_person_tags.tag_name_to_names(tag)
            if not people_with_tag:
                raise TagNotInDatabase(tag)

            if selected_names is None:
                selected_names = set(people_with_tag)
            selected_names = selected_names.intersection(people_with_tag)
    return selected_names


def person_tags_to_ilistmaps(
    video_data_context: VideoDataContext, tags: Iterable[str]
) -> List[MmapIntervalListMapping]:
    ilistmaps = []

    non_cached_tags = []
    for tag in tags:
        if tag not in GLOBAL_TAGS:
            ilistmap = video_data_context.cached_tag_intervals.get(tag, None)
            if ilistmap:
                ilistmaps.append(ilistmap)
            else:
                non_cached_tags.append(tag)

    if len(non_cached_tags) > 0:
        people = person_tags_to_people(video_data_context, non_cached_tags)
        assert people is not None
        ilistmaps.extend(people_to_ilistmaps(video_data_context, people))
    return ilistmaps


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


def get_video_filter(
    vdc: VideoDataContext, context: SearchContext
) -> VideoFilterFn:
    if (
        context.start_date is not None
        or context.end_date is not None
        or context.channel is not None
        or context.show is not None
        or context.hours is not None
        or context.days_of_week is not None
    ):
        def video_filter(video: Video) -> bool:
            if (
                (context.show is not None and video.show != context.show)
                or (context.days_of_week is not None
                    and video.dayofweek not in context.days_of_week)
                or (context.channel is not None
                    and video.channel != context.channel)
                or (context.start_date is not None
                    and video.date < context.start_date)
                or (context.end_date is not None
                    and video.date > context.end_date)
            ):
                return False
            if context.hours:
                video_start = video.hour
                video_end = (
                    video.hour + round(video.num_frames / video.fps / 3600))
                for h in range(video_start, video_end + 1):
                    if h in context.hours:
                        break
                else:
                    return False
            return True
        return video_filter
    return None


def get_videos_in_context(
    vdc: VideoDataContext, context: SearchContext
) -> Optional[Set[Video]]:
    if context.video is not None:
        video = vdc.video_dict.get(context.video)
        return {video} if video else set()
    video_filter = get_video_filter(vdc, context)
    if video_filter:
        return {v for v in vdc.video_dict.values() if video_filter(v)}
    return None


def get_face_tag_intervals(
    vdc: VideoDataContext, tag_str: str
) -> MmapIntervalSetMapping:
    all_tags = parse_tags(tag_str)
    global_tags = get_global_tags(all_tags)
    if len(global_tags) == len(all_tags.tags):
        gender_tag, host_tag = interpret_global_tags(global_tags)
        if gender_tag is None:
            if host_tag == 'host':
                isetmap = vdc.face_intervals.host_isetmap
            elif host_tag == 'nonhost':
                isetmap = vdc.face_intervals.nonhost_isetmap
            else:
                raise UnreachableCode()
        elif gender_tag == 'male':
            if host_tag is None:
                isetmap = vdc.face_intervals.male_isetmap
            elif host_tag == 'host':
                isetmap = vdc.face_intervals.male_host_isetmap
            elif host_tag == 'nonhost':
                isetmap = vdc.face_intervals.male_nonhost_isetmap
            else:
                raise UnreachableCode()
        elif gender_tag == 'female':
            if host_tag is None:
                isetmap = vdc.face_intervals.female_isetmap
            elif host_tag == 'host':
                isetmap = vdc.face_intervals.female_host_isetmap
            elif host_tag == 'nonhost':
                isetmap = vdc.face_intervals.female_nonhost_isetmap
            else:
                raise UnreachableCode()
    else:
        ilistmaps = person_tags_to_ilistmaps(vdc, all_tags.tags)
        gender_tag, host_tag = interpret_global_tags(global_tags)
        payload_mask, payload_value = get_face_time_filter_mask(
            gender_tag, host_tag)
        isetmap = MmapUnionIlistsToISetMapping(
            ilistmaps, payload_mask, payload_value, 3000, 100)
    return isetmap


def get_face_name_intervals(
    vdc: VideoDataContext, name: str
) -> MmapIntervalSetMapping:
    person_intervals = vdc.all_person_intervals.get(name, None)
    if person_intervals is None:
        raise PersonNotInDatabase(name)
    return person_intervals.isetmap


def get_face_count_intervals(
    vdc: VideoDataContext, face_count: int
) -> MmapIntervalSetMapping:
    if face_count < 1:
        raise InvalidUsage('"{}" cannot be less than 1'.format(
                           SearchParam.face_count))
    if face_count > 0xFF:
        raise InvalidUsage('"{}" cannot be less than {}'.format(
                           SearchParam.face_count, 0xFF))
    return MmapIListToISetMapping(
        vdc.face_intervals.num_faces_ilistmap,
        0xFF, face_count, 3000, 0)


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


def get_video_metadata_json(video: Video) -> JsonObject:
    return {
        'id': video.id,
        'name': video.name,
        'channel': video.channel,
        'show': video.show,
        'date': format_date(video.date),
        'width': video.width,
        'height': video.height,
        'fps': video.fps,
        'num_frames': video.num_frames
    }


def build_app(
    data_dir: str,
    index_dir: str,
    video_endpoint: str,
    frameserver_endpoint: Optional[str],
    archive_video_endpoint: Optional[str],
    authorized_users: Optional[List[LoginCredentials]],
    min_date: datetime,
    max_date: datetime,
    min_person_screen_time: int,
    default_aggregate_by: str,
    default_text_window: int,
    default_is_commercial: Ternary,
    data_version: Optional[str]
) -> Flask:
    server_start_time = time.time()

    def _get_is_commercial() -> Ternary:
        value = request.args.get(SearchParam.is_commercial, None, type=str)
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

    caption_data_context, video_data_context = \
        load_app_data(index_dir, data_dir)

    app = Flask(__name__, template_folder=TEMPLATE_DIR,
                static_folder=STATIC_DIR)

    @app.template_filter('quoted')
    def quoted(s):
        l = re.findall('\'([^\']*)\'', str(s))
        if l:
            return l[0]
        return None

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
            'home.html', uptime=_get_uptime())

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
            params=SearchParam,
            default_text_window=default_text_window,
            default_is_commercial=default_is_commercial.name)

    @app.route('/detailed')
    def get_detailed() -> Response:
        return render_template(
            'detailed.html', host=request.host, params=SearchParam,
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
                intervals.name, round(intervals.isetmap.sum() / 60000),
                video_data_context.all_person_tags.name_to_tags(name)
            )
            for name, intervals in
            video_data_context.all_person_intervals.items()
        ]))
    people.sort(key=lambda x: x.name)

    @app.route('/data/people')
    def get_data_people() -> Response:
        return render_template('data/people.html', params=SearchParam)

    @app.route('/data/people.json')
    def get_data_people_json() -> Response:
        return jsonify({'data': [
            (p.name, p.screen_time,
             ', '.join(sorted({t.name for t in p.tags})))
            for p in people
        ]})

    @app.route('/data/tags')
    def get_data_tags() -> Response:
        return render_template('data/tags.html', params=SearchParam)

    @app.route('/data/tags.json')
    def get_data_tags_json() -> Response:
        return jsonify({'data': [
            (t.name, t.source, len(p), ', '.join(p))
            for t, p in video_data_context.all_person_tags.tag_dict.items()
        ]})

    @app.route('/data/shows')
    def get_data_shows() -> Response:
        return render_template('data/shows.html', params=SearchParam)

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

    @app.route('/data/videos')
    def get_data_videos() -> Response:
        return render_template('data/videos.html')

    @app.route('/data/videos.json')
    def get_data_videos_json() -> Response:
        return jsonify({'data': [
            (v.name, round(v.num_frames / v.fps / 60, 1))
            for v in video_data_context.video_dict.values()
        ]})

    @app.route('/data/transcripts')
    def get_data_transcripts() -> Response:
        return render_template(
            'data/transcripts.html', params=SearchParam)

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
            'js/query.js', search_keys=SearchKey, params=SearchParam
        ))
        resp.headers['Content-type'] = 'text/javascript'
        return resp

    @app.route('/static/js/chart.js')
    def get_chart_js() -> Response:
        resp = make_response(render_template(
            'js/chart.js', video_endpoint=video_endpoint))
        resp.headers['Content-type'] = 'text/javascript'
        return resp

    @app.route('/static/js/home.js')
    def get_home_js() -> Response:
        start_date = max(min(
            v.date for v in video_data_context.video_dict.values()), min_date)
        end_date = min(max(
            v.date for v in video_data_context.video_dict.values()), max_date)
        resp = make_response(render_template(
            'js/home.js',
            search_keys=SearchKey, params=SearchParam,
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
            'js/videos.js', params=SearchParam,
            video_endpoint=video_endpoint,
            frameserver_endpoint=frameserver_endpoint,
            archive_video_endpoint=archive_video_endpoint)

    @app.route('/static/js/embed.js')
    def get_embed_js() -> Response:
        return render_template('js/embed.js', host=request.host,
                               data_version=data_version)

    def _search_and(
        children: Iterable[Any], context: SearchContext
    ) -> Optional[SearchResult]:
        # First pass: update the context
        deferred_children = []
        for c in children:
            kc, vc = c
            if kc == SearchKey.video:
                if context.video is not None and context.video != vc:
                    return None
                else:
                    context = context._replace(video=vc)

            elif kc == SearchKey.channel:
                if context.channel is not None and context.channel != vc:
                    return None
                else:
                    context = context._replace(channel=vc)

            elif kc == SearchKey.show:
                if context.show is not None and context.show != vc:
                    return None
                else:
                    context = context._replace(show=vc)

            elif kc == SearchKey.hour:
                hours = parse_hour_set(vc)
                if context.hours is not None:
                    hours &= context.hours
                    if not hours:
                        return None
                context = context._replace(hours=hours)

            elif kc == SearchKey.day_of_week:
                days = parse_day_of_week_set(vc)
                if context.days_of_week is not None:
                    days &= context.days_of_week
                    if not days:
                        return None
                context = context._replace(days_of_week=days)

            elif kc == SearchKey.text_window:
                context = context._replace(text_window=int(vc))

            else:
                deferred_children.append(c)

        # Second pass: execute search
        if deferred_children:
            deferred_children.sort(
                key=lambda x: SEARCH_KEY_EXEC_PRIORITY.get(x[0], 100))
            curr_result = None
            for child in deferred_children:
                child_result = _search_recusive(child, context)
                if child_result is None:
                    return None
                if curr_result is None:
                    curr_result = child_result
                    continue

                r1 = curr_result
                r2 = child_result

                if (
                    r2.type == SearchResultType.video_set
                    or (r1.type != SearchResultType.video_set
                        and r2.type == SearchResultType.python_iset)
                ):
                    r1, r2 = r2, r1

                if r1.type == SearchResultType.video_set:
                    if r2.type == SearchResultType.video_set:
                        curr_result = r2._replace(
                            data=r2.data & r1.data)
                    elif r2.type == SearchResultType.python_iset:
                        curr_result = r2._replace(
                            data=filter(
                                lambda v, d: v in r1.data,
                                r2.data))
                    elif r2.type == SearchResultType.rust_iset:
                        curr_result = r2._replace(
                            data=MmapISetSubsetMapping(
                                r2.data, {v.id for v in r1.data}))
                    else:
                        raise UnreachableCode()

                elif r1.type == SearchResultType.python_iset:
                    if r2.type == SearchResultType.python_iset:
                        raise NotImplementedError()
                    elif r2.type == SearchResultType.rust_iset:
                        curr_result = r1._replace(
                            data=filter(
                                lambda x: len(x[1]) > 0,
                                ((v, r2.data.intersect(v.id, ints, True))
                                 for v, ints in r1.data)))
                    else:
                        raise UnreachableCode()

                elif r1.type == SearchResultType.rust_iset:
                    if r2.type == SearchResultType.rust_iset:
                        curr_result = r1._replace(
                            data=MmapISetIntersectionMapping(
                                [r1.data, r2.data]))

                else:
                    raise UnreachableCode()
            return curr_result
        else:
            return SearchResult(
                SearchResultType.video_set,
                get_videos_in_context(video_data_context, context))

    def _search_or(
        children: Iterable[Any], context: SearchContext
    ) -> Optional[SearchResult]:
        child_results = []
        for c in children:
            child_result = _search_recusive(c, context)
            if child_result is not None:
                child_results.append(child_result)
        # TODO: do join
        raise NotImplementedError()

    def _join_isetmap_with_context(
        isetmap: MmapIntervalSetMapping, context: SearchContext
    ) -> Optional[SearchResult]:
        videos = get_videos_in_context(video_data_context, context)
        if videos is not None:
            isetmap = MmapISetSubsetMapping(isetmap, {v.id for v in videos})
        return SearchResult(SearchResultType.rust_iset, isetmap)

    def _search_recusive(
        query: Any, context: SearchContext
    ) -> Optional[SearchResult]:
        print(query)
        k, v = query
        if k == 'or':
            return _search_or(v, context)

        elif k == 'and':
            return _search_and(v, context)

        elif k == SearchKey.face_name:
            return _join_isetmap_with_context(
                get_face_name_intervals(video_data_context, v.lower()),
                context)

        elif k == SearchKey.face_tag:
            return _join_isetmap_with_context(
                get_face_tag_intervals(video_data_context, v.lower()),
                context)

        elif k == SearchKey.face_count:
            return _join_isetmap_with_context(
                get_face_count_intervals(video_data_context, int(v)),
                context)

        elif k == SearchKey.text:
            return SearchResult(
                SearchResultType.python_iset,
                get_transcript_intervals(
                    caption_data_context, video_data_context,
                    v, context.text_window,
                    get_video_filter(video_data_context, context)))

        elif k == SearchKey.text_window:
            # FIXME: this doesnt make any real sense here
            return None

        elif k == SearchKey.video:
            if context.video is not None and context.video != v:
                return None
            else:
                return SearchResult(
                    SearchResultType.video_set,
                    get_videos_in_context(
                        video_data_context, context._replace(video=v)))

        elif k == SearchKey.channel:
            if context.channel is not None and context.channel != v:
                return None
            else:
                return SearchResult(
                    SearchResultType.video_set,
                    get_videos_in_context(
                        video_data_context, context._replace(channel=v)))

        elif k == SearchKey.show:
            if context.show is not None and context.show != v:
                return None
            else:
                return SearchResult(
                    SearchResultType.video_set,
                    get_videos_in_context(
                        video_data_context, context._replace(channel=v)))

        elif k == SearchKey.hour:
            hours = parse_hour_set(v)
            if context.hours is not None:
                hours &= context.hours
                if not hours:
                    return None
            return SearchResult(
                SearchResultType.video_set,
                get_videos_in_context(
                    video_data_context, context._replace(hours=hours)))

        elif k == SearchKey.day_of_week:
            days = parse_day_of_week_set(v)
            if context.days_of_week is not None:
                days &= context.days_of_week
                if not days:
                    return None
            return SearchResult(
                SearchResultType.video_set,
                get_videos_in_context(
                    video_data_context, context._replace(days_of_week=days)))

        raise UnreachableCode()

    @app.route('/search')
    def search() -> Response:
        aggregate_fn = get_aggregate_fn()

        accumulator = (
            DetailedDateAccumulator(aggregate_fn)
            if request.args.get(
                SearchParam.detailed, 'true', type=str
            ) == 'true' else SimpleDateAcumulator(aggregate_fn))

        query_str = request.args.get(SearchParam.query, type=str)
        if not query_str:
            raise InvalidUsage('Received empty query')
        query = json.loads(query_str)

        start_date = parse_date(
            request.args.get(SearchParam.start_date, None, type=str))
        end_date = parse_date(
            request.args.get(SearchParam.end_date, None, type=str))

        is_commercial = _get_is_commercial()

        result = _search_recusive(
            query, SearchContext(
                start_date=start_date, end_date=end_date,
                text_window=default_text_window))

        def accumulate(v: Video, intervals: List[Interval]) -> None:
            if is_commercial != Ternary.both:
                if is_commercial == Ternary.true:
                    intervals = intersect_isetmap(
                        v, video_data_context.commercial_isetmap, intervals)
                else:
                    intervals = minus_isetmap(
                        v, video_data_context.commercial_isetmap, intervals)
                if not intervals:
                    return
            accumulator.add(
                v.date, v.id, sum(i[1] - i[0] for i in intervals) / 1000)

        if result is None:
            pass
        elif result.type == SearchResultType.video_set:
            for v in result.data:
                accumulate(v, [(0, int(1000 * v.num_frames / v.fps))])
        elif result.type == SearchResultType.rust_iset:
            for v_id in result.data.get_ids():
                v = video_by_id.get(v_id)
                if v is not None:
                    accumulate(v, result.data.get_intervals(v_id, True))
        elif result.type == SearchResultType.python_iset:
            for v, intervals in result.data:
                accumulate(v, intervals)

        return jsonify(accumulator.get())

    def _video_name_or_id(v: str) -> str:
        try:
            v_id = int(v)
            return video_by_id[v_id].name
        except ValueError:
            return v

    def _get_entire_video(video: Video) -> JsonObject:
        document = document_by_name.get(video.name)
        return {
            'metadata': get_video_metadata_json(video),
            'intervals': [(0, video.num_frames)],
        }

    # def _count_time_in_videos(
    #     videos: List[Video],
    #     caption_query_str: str, caption_window: int,
    #     is_commercial: Ternary,
    #     onscreen_face_isetmaps: Optional[List[MmapIntervalSetMapping]]
    # ) -> List[JsonObject]:
    #     results = []
    #
    #     def helper(
    #         video: Video,
    #         intervals: Optional[List[Interval]] = None
    #     ) -> None:
    #         if is_commercial != Ternary.both:
    #             if is_commercial == Ternary.true:
    #                 intervals = intersect_isetmap(
    #                     video, video_data_context.commercial_isetmap,
    #                     intervals)
    #             else:
    #                 intervals = minus_isetmap(
    #                     video, video_data_context.commercial_isetmap,
    #                     intervals)
    #             if not intervals:
    #                 return
    #
    #         if onscreen_face_isetmaps:
    #             for isetmap in onscreen_face_isetmaps:
    #                 intervals = intersect_isetmap(video, isetmap, intervals)
    #                 if not intervals:
    #                     return
    #
    #         if intervals is not None:
    #             assert len(intervals) > 0
    #             document = document_by_name.get(video.name)
    #             results.append({
    #                 'metadata': _video_to_dict(video),
    #                 'intervals': list(merge_close_intervals(
    #                     (i[0] / 1000, i[1] / 1000) for i in intervals
    #                 ))
    #             })
    #         else:
    #             results.append(_get_entire_video(video))
    #
    #     if caption_query_str:
    #         # Run the query on the selected videos
    #         query = None
    #         try:
    #             query = Query(caption_query_str.upper())
    #         except Exception as e:
    #             raise InvalidTranscriptSearch(caption_query_str)
    #         for result in query.execute(
    #             caption_data_context.lexicon,
    #             caption_data_context.index,
    #             [caption_data_context.documents[v.name] for v in videos
    #              if v.name in caption_data_context.documents]
    #         ):
    #             document = caption_data_context.documents[result.id]
    #             video = video_data_context.video_dict[document.name]
    #             postings = result.postings
    #             if caption_window > 0:
    #                 postings = PostingUtil.deoverlap(PostingUtil.dilate(
    #                     postings, caption_window,
    #                     video.num_frames / video.fps))
    #             helper(video, [(milliseconds(p.start), milliseconds(p.end))
    #                            for p in postings])
    #     else:
    #         for v in videos:
    #             helper(v)
    #     return results

    # @app.route('/search-videos')
    # def search_videos() -> Response:
    #     ids = request.args.get(SearchParam.video_ids, None, type=str)
    #     if not ids:
    #         raise InvalidUsage('must specify video ids')
    #     videos = [video_by_id[i] for i in json.loads(ids)]
    #     is_commercial = _get_is_commercial()
    #
    #     caption_query = request.args.get(
    #         SearchParam.caption_text, '', type=str).strip()
    #     caption_window = request.args.get(
    #         SearchParam.caption_window, default_text_window, type=int)
    #     results = _count_time_in_videos(
    #         videos, caption_query, caption_window, is_commercial,
    #         get_onscreen_face_isetmaps(video_data_context))
    #
    #     return jsonify(results)

    @app.route('/transcript/<int:i>')
    def get_transcript(i: int) -> Response:
        video = video_by_id.get(i)
        if not video:
            raise NotFound('video id: {}'.format(i))
        document = document_by_name.get(video.name)
        if not document:
            raise NotFound('transcripts for video id: {}'.format(i))
        resp = jsonify(get_captions(caption_data_context, document))
        return resp

    return app
