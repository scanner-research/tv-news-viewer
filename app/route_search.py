from datetime import datetime, timedelta
import os
import json
import heapq
import random
import re
import time
from enum import Enum
from flask import Flask, Response, jsonify, request
from typing import (
    Any, Dict, List, Set, Tuple, Optional, Iterable, Generator, NamedTuple)

from captions.util import PostingUtil                   # type: ignore
from captions.query import Query                        # type: ignore
from rs_intervalset import (                            # type: ignore
    MmapIntervalSetMapping, MmapIntervalListMapping)
from rs_intervalset.wrapper import (                    # type: ignore
    MmapIListToISetMapping, MmapUnionIlistsToISetMapping,
    MmapISetIntersectionMapping)
from rs_intervalset.wrapper import _deoverlap as deoverlap_intervals

from .types_frontend import *
from .types_backend import *
from .error import *
from .parsing import (
    parse_date, format_date, parse_hour_set, parse_day_of_week_set,
    ParsedTags, parse_tags)
from .load import VideoDataContext, CaptionDataContext
from .sum import DetailedDateAccumulator, SimpleDateAccumulator


MAX_VIDEO_SEARCH_IDS = 10


class SearchResultType(Enum):
    video_set = 0
    python_iset = 1
    rust_iset = 2


class SearchContext(NamedTuple):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    videos: Optional[Set[int]] = None
    channel: Optional[str] = None
    show: Optional[str] = None
    hours: Optional[Set[int]] = None
    days_of_week: Optional[Set[int]] = None
    text_window: int = 0


class SearchResult(NamedTuple):
    type: SearchResultType
    context: Optional[SearchContext] = None
    data: Any = None


class PythonISetData(NamedTuple):
    video: Video
    is_entire_video: bool
    intervals: Optional[List[Interval]] = None


PythonISetDataGenerator = Generator[PythonISetData, None, None]


def get_non_none(a: Any, b: Any) -> Optional[Any]:
    return a if b is None else a


def and_search_contexts(
    c1: SearchContext, c2: SearchContext
) -> Optional[SearchContext]:
    if c1.start_date is not None and c2.start_date is not None:
        start_date = max(c1.start_date, c2.start_date)
    else:
        start_date = get_non_none(c1.start_date, c2.start_date)

    if c1.end_date is not None and c2.end_date is not None:
        end_date = min(c1.end_date, c2.end_date)
    else:
        end_date = get_non_none(c1.end_date, c2.end_date)

    if end_date and start_date and end_date < start_date:
        return None

    if c1.videos is not None and c2.videos is not None:
        videos = c1.videos & c2.videos
        if not videos:
            return None
    else:
        videos = get_non_none(c1.videos, c2.videos)

    if c1.channel == c2.channel:
        channel = c1.channel
    elif c1.channel is not None and c2.channel is not None:
        return None
    else:
        channel = get_non_none(c1.channel, c2.channel)

    if c1.show == c2.show:
        show = c1.show
    elif c1.show is not None and c2.show is not None:
        return None
    else:
        show = get_non_none(c1.show, c2.show)

    if c1.hours is not None and c2.hours is not None:
        hours = c1.hours & c2.hours
        if not hours:
            return None
    else:
        hours = get_non_none(c1.hours, c2.hours)

    if c1.days_of_week is not None and c2.days_of_week is not None:
        days_of_week = c1.days_of_week & c2.days_of_week
        if not days_of_week:
            return None
    else:
        days_of_week = get_non_none(c1.days_of_week, c2.days_of_week)

    return SearchContext(start_date, end_date, videos, channel, show, hours,
                         days_of_week)


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


def get_aggregate_fn(default_agg_by: str) -> AggregateFn:
    agg = request.args.get(SearchParam.aggregate, None, type=str)
    e = Aggregate[agg] if agg else default_agg_by
    if e == Aggregate.day:
        return lambda d: d
    elif e == Aggregate.month:
        return lambda d: datetime(d.year, d.month, 1)
    elif e == Aggregate.week:
        return lambda d: d - timedelta(days=d.isoweekday() - 1)
    elif e == Aggregate.year:
        return lambda d: datetime(d.year, 1, 1)
    raise UnreachableCode()


def get_python_iset_from_filter(
    vdc: VideoDataContext, video_filter: Optional[VideoFilterFn]
) -> PythonISetDataGenerator:
    for v in vdc.video_dict.values():  # sorted iterator
        if video_filter is not None and video_filter(v):
            yield PythonISetData(v, True)


def get_python_iset_from_rust_iset(
    vdc: VideoDataContext, isetmap: MmapIntervalSetMapping,
    video_filter: Optional[VideoFilterFn]
) -> PythonISetDataGenerator:
    for video_id in isetmap.get_ids():
        video = vdc.video_by_id.get(video_id)
        if video is not None and (
            video_filter is None or video_filter(video)
        ):
            intervals = isetmap.get_intervals(video_id, True)
            if intervals:
                yield PythonISetData(video, False, intervals=intervals)


MAX_TRANSCRIPT_SEARCH_COST = 0.005


def get_transcript_intervals(
    cdc: CaptionDataContext, vdc: VideoDataContext,
    text_str: str, context: SearchContext
) -> PythonISetDataGenerator:
    missing_videos = 0
    matched_videos = 0
    filtered_videos = 0

    text_window = context.text_window
    video_filter = get_video_filter(context)

    documents = None
    if context.videos is not None:
        documents = []
        for video_id in context.videos:
            video = vdc.video_by_id[video_id]
            if video_filter is None or video_filter(video):
                document = cdc.document_by_name.get(video.name)
                if document is not None:
                    documents.append(document)
        if len(documents) == 0:
            return iter(())

    results = []
    query = None
    try:
        query = Query(text_str.upper())
    except Exception as e:
        raise InvalidTranscriptSearch(text_str)

    if documents is None:
        if query.estimate_cost(cdc.lexicon) > MAX_TRANSCRIPT_SEARCH_COST:
            raise QueryTooExpensive(
                'The text query is too expensive to compute. '
                '"{}" contains too many common words/phrases.'.format(text_str))

    for raw_result in query.execute(
        cdc.lexicon, cdc.index, documents=documents, ignore_word_not_found=True
    ):
        document = cdc.documents[raw_result.id]
        video = vdc.video_dict.get(document.name)
        if video is None:
            missing_videos += 1
            continue
        else:
            matched_videos += 1
        if video_filter is not None and not video_filter(video):
            filtered_videos += 1
            continue

        postings = raw_result.postings
        if text_window > 0:
            postings = PostingUtil.deoverlap(PostingUtil.to_fixed_length(
                postings, text_window,
                video.num_frames / video.fps))
        results.append(PythonISetData(
            video, False,
            [(int(p.start * 1000), int(p.end * 1000)) for p in postings]))
    return iter(sorted(results, key=lambda x: x.video.id))


def search_result_to_python_iset(
    vdc: VideoDataContext, result: SearchResult
) -> PythonISetDataGenerator:
    if result.type == SearchResultType.video_set:
        video_filter = get_video_filter(result.context)
        return get_python_iset_from_filter(
            vdc, video_filter)

    elif result.type == SearchResultType.rust_iset:
        video_filter = get_video_filter(result.context)
        return get_python_iset_from_rust_iset(
            vdc, result.data, video_filter)

    elif result.type == SearchResultType.python_iset:
        return result.data

    raise UnreachableCode()


def and_python_isets(
    r1: SearchResult, r2: SearchResult
) -> PythonISetDataGenerator:
    prev = None
    for curr in heapq.merge(
        ((d.video.id, d) for d in r1.data),
        ((d.video.id, d) for d in r2.data)
    ):
        if prev is None:
            prev = curr
        elif prev[0] == curr[0]:
            if prev[1].is_entire_video:
                yield curr[1]
            elif curr[1].is_entire_video:
                yield prev[1]
            else:
                yield PythonISetData(
                    curr[1].video, False,
                    list(merge_close_intervals(intersect_sorted_intervals(
                            prev[1].intervals, curr[1].intervals))))
            prev = None
        else:
            assert prev[0] < curr[0]
            prev = curr


def or_python_iset_with_filter(
    vdc: VideoDataContext, video_filter: VideoFilterFn,
    search_result: SearchResult
) -> PythonISetDataGenerator:
    assert video_filter is not None
    assert search_result.type == SearchResultType.python_iset

    all_videos_iter = iter(vdc.video_dict.values())

    # Match videos from search_result to all videos
    for curr in search_result.data:
        curr_video = curr.video
        all_videos_head = next(all_videos_iter)
        while all_videos_head and all_videos_head.id < curr_video.id:
            if video_filter(all_videos_head):
                yield PythonISetData(curr_video, True)
            all_videos_head = next(all_videos_iter)

        assert all_videos_head.id == curr_video.id
        if video_filter(curr_video):
            yield PythonISetData(curr_video, True)
        else:
            yield curr

    # Finish up all_videos_iter
    for video in all_videos_iter:
        if video_filter(video):
            yield PythonISetData(video, True)


def or_python_isets(
    r1: SearchResult, r2: SearchResult
) -> PythonISetDataGenerator:
    assert r1.type == SearchResultType.python_iset
    assert r2.type == SearchResultType.python_iset

    prev = None
    for curr in heapq.merge(
        ((s.video.id, s) for s in r1.data),
        ((s.video.id, s) for s in r2.data)
    ):
        if prev is None:
            prev = curr
        elif curr[0] == prev[0]:
            if curr[1].is_entire_video:
                yield curr[1]
            elif prev[1].is_entire_video:
                yield prev[1]
            else:
                yield PythonISetData(
                    curr[1].video, False,
                    deoverlap_intervals(
                        heapq.merge(curr[1].intervals, prev[1].intervals),
                        100))
            prev = None
        else:
            assert curr[0] > prev[0]
            yield prev[1]
            prev = curr
    if prev is not None:
        yield prev[1]


def or_python_iset_with_rust_iset(
    vdc: VideoDataContext, python_result: SearchResult,
    rust_result: SearchResult
) -> PythonISetDataGenerator:
    assert python_result.type == SearchResultType.python_iset
    assert rust_result.type == SearchResultType.rust_iset

    try:
        python_result_head = next(python_result.data)
    except StopIteration:
        python_result_head = None

    video_filter = get_video_filter(rust_result.context)
    for video_id in rust_result.data.get_ids():
        video = vdc.video_by_id.get(video_id)
        if not video:
            continue

        while (
            python_result_head is not None
            and python_result_head.video.id < video_id
        ):
            yield python_result_head
            try:
                python_result_head = next(python_result.data)
            except StopIteration:
                python_result_head = None

        assert (python_result_head is None
                or python_result_head.video.id >= video_id)
        if (
            python_result_head is None
            or python_result_head.video.id != video_id
        ):
            if video_filter is None or video_filter(video):
                intervals = rust_result.data.get_intervals(video_id, True)
                if intervals:
                    yield PythonISetData(video, False, intervals=intervals)
        else:
            assert python_result_head.video.id == video_id
            if (
                python_result_head.is_entire_video
                or (video_filter is not None and not video_filter(video))
            ):
                yield python_result_head
            else:
                yield PythonISetData(
                    video, False,
                    deoverlap_intervals(heapq.merge(
                        python_result_head.intervals,
                        rust_result.data.get_intervals(video_id, True)),
                        100))
            try:
                python_result_head = next(python_result.data)
            except StopIteration:
                python_result_head = None

    # yield any remaining results
    if python_result_head is not None:
        yield python_result_head
        for x in python_result.data:
            yield x


def or_rust_isets(
    vdc: VideoDataContext, r1: SearchResult, r2: SearchResult
) -> PythonISetDataGenerator:
    assert r1.type == SearchResultType.rust_iset
    assert r2.type == SearchResultType.rust_iset

    r1_filter = get_video_filter(r1.context)
    r2_filter = get_video_filter(r2.context)
    r1_ids = set(r1.data.get_ids())
    r2_ids = set(r2.data.get_ids())
    for video_id in sorted(r1_ids | r2_ids):
        video = vdc.video_by_id.get(video_id)
        if video is None:
            continue

        r1_intervals = (
            r1.data.get_intervals(video_id, True)
            if (
                video.id in r1_ids
                and (r1_filter is None or r1_filter(video))
            ) else None)
        r2_intervals = (
            r2.data.get_intervals(video_id, True)
            if (
                video.id in r2_ids
                and (r2_filter is None or r2_filter(video))
            ) else None)
        if r1_intervals and r2_intervals:
            yield PythonISetData(
                video, False,
                deoverlap_intervals(
                    heapq.merge(r1_intervals, r2_intervals), 100))
        elif r1_intervals:
            yield PythonISetData(video, False, r1_intervals)
        elif r2_intervals:
            yield PythonISetData(video, False, r2_intervals)


def join_intervals_with_commercials(
    vdc: VideoDataContext, video: Video, intervals: List[Interval],
    is_commercial: Ternary
) -> List[Interval]:
    if is_commercial != Ternary.both:
        if is_commercial == Ternary.true:
            intervals = intersect_isetmap(
                video, vdc.commercial_isetmap, intervals)
        else:
            intervals = minus_isetmap(
                video, vdc.commercial_isetmap, intervals)
    return intervals


def get_global_tags(tag: ParsedTags) -> Set[str]:
    return {t for t in tag.tags if t in GLOBAL_TAGS}


def either_tag_or_none(a: str, b: str, s: set) -> Optional[str]:
    has_a = a in s
    has_b = b in s
    if has_a and has_b:
        raise InvalidUsage(
            'Cannot use {} and {} tags simultaneously. Try using "all".'.format(a, b))
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
) -> Tuple[bool, Optional[str], Optional[str]]:
    gender_tag = either_tag_or_none('male', 'female', global_tags)
    host_tag = either_tag_or_none('host', 'nonhost', global_tags)
    is_all = 'all' in global_tags and gender_tag is None and host_tag is None
    return is_all, gender_tag, host_tag


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
            else:
                selected_names = selected_names.intersection(people_with_tag)
    return selected_names


def person_tags_to_ilistmaps(
    video_data_context: VideoDataContext, tags: Iterable[str]
) -> List[MmapIntervalListMapping]:
    non_global_tags = [t for t in tags if t not in GLOBAL_TAGS]
    if len(non_global_tags) == 1:
        ilistmap = video_data_context.cached_tag_intervals.get(
            non_global_tags[0], None)
        if ilistmap:
            return [ilistmap]

    ilistmaps = []
    if len(non_global_tags) > 0:
        people = person_tags_to_people(video_data_context, non_global_tags)
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
            payload_mask |= 0b1
            if gender_tag == 'male':
                payload_value |= 0b1
            elif gender_tag == 'female':
                pass
            else:
                raise UnreachableCode()
    if host_tag:
        host_tag = host_tag.strip().lower()
        if host_tag:
            payload_mask |= 0b100
            if host_tag == 'host':
                payload_value |= 0b100
            elif host_tag == 'nonhost':
                pass
            else:
                raise UnreachableCode()
    return payload_mask, payload_value


def get_video_filter(context: SearchContext) -> Optional[VideoFilterFn]:
    if (
        context.videos is not None
        or context.start_date is not None
        or context.end_date is not None
        or context.channel is not None
        or context.show is not None
        or context.hours is not None
        or context.days_of_week is not None
    ):
        def video_filter(video: Video) -> bool:
            if (
                (context.videos is not None and video.id not in context.videos)
                or (context.show is not None and video.show != context.show)
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


def get_face_tag_intervals(
    vdc: VideoDataContext, tag_str: str
) -> MmapIntervalSetMapping:
    all_tags = parse_tags(tag_str)
    global_tags = get_global_tags(all_tags)
    if len(global_tags) == len(all_tags.tags):
        is_all, gender_tag, host_tag = interpret_global_tags(global_tags)
        if is_all:
            isetmap = vdc.face_intervals.all_isetmap
        elif gender_tag is None:
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
        _, gender_tag, host_tag = interpret_global_tags(global_tags)
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
                           SearchKey.face_count))
    if face_count > 0xFF:
        raise InvalidUsage('"{}" cannot be less than {}'.format(
                           SearchKey.face_count, 0xFF))
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


def intersect_sorted_intervals(
    l1: List[Interval], l2: List[Interval]
) -> Generator[Interval, None, None]:
    i, j = 0, 0
    curr_interval = None
    while i < len(l1) and j < len(l2):
        a1, b1 = l1[i]
        a2, b2 = l2[j]
        max_a = max(a1, a2)
        min_b = min(b1, b2)
        if min_b - max_a > 0:
            yield (max_a, min_b)
        if a1 < a2:
            i += 1
        else:
            j += 1


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


def add_search_routes(
    app: Flask, caption_data_context: CaptionDataContext,
    video_data_context: VideoDataContext,
    default_aggregate_by: str,
    default_is_commercial: Ternary,
    default_text_window: int
):
    def _get_is_commercial() -> Ternary:
        value = request.args.get(SearchParam.is_commercial, None, type=str)
        return Ternary[value] if value else default_is_commercial

    def _search_and(
        children: Iterable[Any], context: SearchContext
    ) -> Optional[SearchResult]:
        # First pass: update the context
        deferred_children = []
        for c in children:
            kc, vc = c
            if kc == SearchKey.video:
                video = video_data_context.video_dict.get(vc)
                if video is None:
                    raise VideoNotInDatabase(vc)
                if context.videos is not None and video.id not in context.videos:
                    return None
                context = context._replace(videos={video.id})

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
                child_result = _search_recursive(child, context)
                if child_result is None:
                    return None
                if curr_result is None:
                    curr_result = child_result
                    continue

                r1 = curr_result
                r2 = child_result

                # Symmetric cases
                if (
                    r2.type == SearchResultType.video_set
                    or (r1.type != SearchResultType.video_set
                        and r2.type == SearchResultType.python_iset)
                ):
                    r1, r2 = r2, r1

                if r1.type == SearchResultType.video_set:
                    if r2.type == SearchResultType.video_set:
                        # Result: video_set
                        new_context = and_search_contexts(
                            r1.context, r2.context)
                        if new_context is None:
                            return None
                        curr_result = r2._replace(context=new_context)
                    elif r2.type == SearchResultType.python_iset:
                        # Result: python_iset
                        video_filter = get_video_filter(r1.context)
                        if video_filter:
                            curr_result = SearchResult(
                                SearchResultType.python_iset,
                                data=filter(lambda x: video_filter(x.video),
                                            r2.data))
                    elif r2.type == SearchResultType.rust_iset:
                        # Result: rust_iset
                        new_context = and_search_contexts(
                            r1.context, r2.context)
                        if new_context is None:
                            return None
                        curr_result = r2._replace(context=new_context)
                    else:
                        raise UnreachableCode()

                elif r1.type == SearchResultType.python_iset:
                    if r2.type == SearchResultType.python_iset:
                        # Result: python_iset
                        curr_result = SearchResult(
                            SearchResultType.python_iset,
                            data=and_python_isets(r1, r2))
                    elif r2.type == SearchResultType.rust_iset:
                        # Result: python_iset
                        video_filter = get_video_filter(r2.context)
                        new_data = (
                            PythonISetData(
                                x.video, False,
                                intervals=intersect_isetmap(
                                    x.video, r2.data, x.intervals))
                            for x in r1.data if video_filter(x.video))
                        curr_result = SearchResult(
                            SearchResultType.python_iset,
                            data=filter(lambda x: len(x.intervals) > 0,
                                        new_data))
                    else:
                        raise UnreachableCode()

                elif r1.type == SearchResultType.rust_iset:
                    if r2.type == SearchResultType.rust_iset:
                        # Result: rust_iset
                        curr_result = SearchResult(
                            SearchResultType.rust_iset,
                            context=and_search_contexts(
                                r1.context, r2.context),
                            data=MmapISetIntersectionMapping(
                                [r1.data, r2.data]))
                    else:
                        raise UnreachableCode()

                else:
                    raise UnreachableCode()
            return curr_result
        else:
            return SearchResult(SearchResultType.video_set, context=context)

    def _search_or(
        children: Iterable[Any], context: SearchContext
    ) -> Optional[SearchResult]:
        # First, collect the child results with type video_set
        child_results = []
        deferred_children = []
        for c in children:
            kc, vc = c
            if (
                kc == SearchKey.video or kc == SearchKey.channel
                or kc == SearchKey.show or kc == SearchKey.hour
                or kc == SearchKey.day_of_week
            ):
                child_result = _search_recursive(c, context)
                if child_result is not None:
                    child_results.append(child_result)
            elif kc == SearchKey.text_window:
                # This is a no-op
                continue
            else:
                deferred_children.append(c)

        child_video_filters = []
        for c in child_results:
            assert c.type == SearchResultType.video_set, c.type
            child_video_filter = get_video_filter(c.context)
            if child_video_filter is None:
                # One of the children is "everything"
                return c
            child_video_filters.append(child_video_filter)

        curr_result = None
        if child_video_filters:
            curr_result = SearchResult(
                SearchResultType.python_iset,
                data=get_python_iset_from_filter(
                    video_data_context,
                    lambda v: any(f(v) for f in child_video_filters)))

        for c in deferred_children:
            child_result = _search_recursive(c, context)
            if child_result is None:
                continue
            if curr_result is None:
                curr_result = child_result
                continue

            r1 = curr_result
            r2 = child_result

            # Symmetric cases
            if (
                r2.type == SearchResultType.video_set
                or (r1.type != SearchResultType.video_set
                    and r2.type == SearchResultType.python_iset)
            ):
                r1, r2 = r2, r1

            if r1.type == SearchResultType.video_set:
                r1_filter = get_video_filter(r1.context)
                if r1_filter is None:
                    # R1 is "everything"
                    return r1

                elif r2.type != SearchResultType.video_set:
                    r2_filter = get_video_filter(r2.context)
                    if r2_filter is None:
                        # R2 is "everything"
                        return r2
                    else:
                        # Return: python_iset
                        curr_result = SearchResult(
                            SearchResultType.python_iset,
                            data=get_python_iset_from_filter(
                                video_data_context,
                                lambda v: r1_filter(v) or r2_filter(v)))
                elif r2.type == SearchResultType.python_iset:
                    # Return: python_iset
                    curr_result = SearchResult(
                        SearchResultType.python_iset,
                        data=or_python_iset_with_filter(
                            video_data_context, r1_filter, r2))
                elif r2.type == SearchResultType.rust_iset:
                    # Return: python_iset
                    curr_result = SearchResult(
                        SearchResultType.python_iset,
                        data=or_python_iset_with_rust_iset(
                            video_data_context,
                            SearchResult(
                                SearchResultType.python_iset,
                                data=get_python_iset_from_filter(
                                    video_data_context, r1_filter)
                            ), r2))
                else:
                    raise UnreachableCode()

            elif r1.type == SearchResultType.python_iset:
                if r2.type == SearchResultType.python_iset:
                    curr_result = SearchResult(
                        SearchResultType.python_iset,
                        data=or_python_isets(r1, r2))
                elif r2.type == SearchResultType.rust_iset:
                    curr_result = SearchResult(
                        SearchResultType.python_iset,
                        data=or_python_iset_with_rust_iset(
                            video_data_context, r1, r2))
                else:
                    raise UnreachableCode()

            elif r1.type == SearchResultType.rust_iset:
                if r2.type == SearchResultType.rust_iset:
                    # Return: python_iset
                    curr_result = SearchResult(
                        SearchResultType.python_iset,
                        data=or_rust_isets(video_data_context, r1, r2))
                else:
                    raise UnreachableCode()

            else:
                raise UnreachableCode()
        return curr_result

    def _search_recursive(
        query: Any, context: SearchContext
    ) -> Optional[SearchResult]:
        k, v = query
        if k == 'all':
            return SearchResult(SearchResultType.video_set, context=context)

        elif k == 'or':
            return _search_or(v, context)

        elif k == 'and':
            return _search_and(v, context)

        elif k == SearchKey.face_name:
            return SearchResult(
                SearchResultType.rust_iset, context=context,
                data=get_face_name_intervals(video_data_context, v.lower()))

        elif k == SearchKey.face_tag:
            return SearchResult(
                SearchResultType.rust_iset, context=context,
                data=get_face_tag_intervals(video_data_context, v.lower()))

        elif k == SearchKey.face_count:
            return SearchResult(
                SearchResultType.rust_iset, context=context,
                data=get_face_count_intervals(video_data_context, int(v)))

        elif k == SearchKey.text:
            return SearchResult(
                SearchResultType.python_iset,
                data=get_transcript_intervals(
                    caption_data_context, video_data_context, v, context))

        elif k == SearchKey.text_window:
            # FIXME: this doesnt make any real sense here
            return None

        elif k == SearchKey.video:
            video = video_data_context.video_dict.get(v)
            if video is None:
                raise VideoNotInDatabase(v)
            if context.videos is not None and video.id not in context.videos:
                return None
            else:
                return SearchResult(
                    SearchResultType.video_set,
                    context=context._replace(videos={video.id}))

        elif k == SearchKey.channel:
            if context.channel is not None and context.channel != v:
                return None
            else:
                return SearchResult(
                    SearchResultType.video_set,
                    context=context._replace(channel=v))

        elif k == SearchKey.show:
            if context.show is not None and context.show != v:
                return None
            else:
                return SearchResult(
                    SearchResultType.video_set,
                    context=context._replace(show=v))

        elif k == SearchKey.hour:
            hours = parse_hour_set(v)
            if context.hours is not None:
                hours &= context.hours
                if not hours:
                    return None
            return SearchResult(
                SearchResultType.video_set,
                context=context._replace(hours=hours))

        elif k == SearchKey.day_of_week:
            days = parse_day_of_week_set(v)
            if context.days_of_week is not None:
                days &= context.days_of_week
                if not days:
                    return None
            return SearchResult(
                SearchResultType.video_set,
                context=context._replace(days_of_week=days))

        raise UnreachableCode()

    @app.route('/search')
    def search() -> Response:
        aggregate_fn = get_aggregate_fn(default_aggregate_by)

        accumulator = (
            DetailedDateAccumulator(aggregate_fn)
            if request.args.get(
                SearchParam.detailed, 'true', type=str
            ) == 'true' else SimpleDateAccumulator(aggregate_fn))

        query_str = request.args.get(SearchParam.query, type=str)
        if query_str:
            query = json.loads(query_str)
        else:
            query = ['all', None]

        start_date = parse_date(
            request.args.get(SearchParam.start_date, None, type=str))
        end_date = parse_date(
            request.args.get(SearchParam.end_date, None, type=str))

        is_commercial = _get_is_commercial()

        search_result = _search_recursive(
            query, SearchContext(
                start_date=start_date, end_date=end_date,
                text_window=default_text_window))

        if search_result is not None:
            def helper(video: Video, intervals: List[Interval]) -> None:
                intervals = join_intervals_with_commercials(
                    video_data_context, video, intervals, is_commercial)
                if intervals:
                    accumulator.add(
                        video.date, video.id,
                        sum(i[1] - i[0] for i in intervals) / 1000)

            for data in search_result_to_python_iset(
                video_data_context, search_result
            ):
                if data.is_entire_video:
                    intervals = get_entire_video_ms_interval(data.video)
                else:
                    assert data.intervals is not None
                    intervals = data.intervals
                helper(data.video, intervals)

        return jsonify(accumulator.get())

    def _video_name_or_id(v: str) -> str:
        try:
            v_id = int(v)
            return video_data_context.video_by_id[v_id].name
        except ValueError:
            return v

    def _get_entire_video(video: Video) -> JsonObject:
        document = caption_data_context.document_by_name.get(video.name)
        return {
            'metadata': get_video_metadata_json(video),
            'intervals': [(0, video.num_frames)],
        }

    @app.route('/search-videos')
    def search_videos() -> Response:
        video_ids_str = request.args.get(SearchParam.video_ids, None, type=str)
        if not video_ids_str:
            raise InvalidUsage('must specify video ids')
        video_ids = set(json.loads(video_ids_str))
        if len(video_ids) > MAX_VIDEO_SEARCH_IDS:
            raise QueryTooExpensive('Too many video ids specified')

        query_str = request.args.get(SearchParam.query, type=str)
        if query_str:
            query = json.loads(query_str)
        else:
            query = ['all', None]

        is_commercial = _get_is_commercial()

        results = []

        def collect(video: Video, intervals: List[Interval]) -> None:
            intervals = join_intervals_with_commercials(
                video_data_context, video, intervals, is_commercial)
            if intervals:
                results.append({
                    'metadata': get_video_metadata_json(video),
                    'intervals': list(merge_close_intervals(
                        (i[0] / 1000, i[1] / 1000) for i in intervals
                    ))
                })

        search_result = _search_recursive(
            query, SearchContext(
                videos=video_ids, text_window=default_text_window))

        if search_result is not None:
            for data in search_result_to_python_iset(
                video_data_context, search_result
            ):
                assert data.video.id in video_ids, \
                    'Unexpected video {}, not in {}'.format(
                        data.video.id, video_ids)
                if data.is_entire_video:
                    intervals = get_entire_video_ms_interval(data.video)
                else:
                    assert data.intervals is not None
                    intervals = data.intervals
                collect(data.video, intervals)

        assert len(results) <= len(video_ids), \
            'Expected {} results, got {}'.format(len(video_ids), len(results))
        return jsonify(results)
