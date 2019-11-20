import React from 'react';
import ReactDOM from 'react-dom';
import {
  VGrid, Database, Table, Bounds, BoundingBox, Interval, IntervalSet,
  SpatialType_Temporal, SpatialType_Caption, SpatialType_Bbox
} from '@wcrichto/vgrid';

import '@wcrichto/vgrid/dist/vgrid.css';

const HIGHLIGHT_STYLE = {backgroundColor: 'yellow'};

const FACE_FADE_PARAMS = {amount: 0.75};

const INTERNET_ARCHIVE_MAX_CLIP_LEN = 180;
const INTERNET_ARCHIVE_PAD_START = 30;

function getHighlightIndexes(captions, highlight_phrases) {
  let highlight_phrase_arr = Array.from(highlight_phrases);
  let max_highlight_len = 1 + Math.max(
    ...(highlight_phrase_arr.map(p => p.split(' ').length))
  );

  let highlight_idxs = new Set();
  for (var i = 0; i < captions.length; i++) {
    var prefix = '';
    for (var j = i; j < Math.min(captions.length, i + max_highlight_len); j++) {
      prefix += $.trim(captions[j][2]).replace(/[!\.\?;:(),]/i, '').toLowerCase();
      if (highlight_phrases.has(prefix)) {
        for (var k = i; k <= j; k++) {
          highlight_idxs.add(k);
        }
      }
      prefix += ' ';

      // early termination
      var matches_prefix = false;
      highlight_phrase_arr.forEach(p => {
        matches_prefix |= p.startsWith(prefix);
      });
      if (!matches_prefix) break;
    }
  }
  return highlight_idxs;
}

function flattenCaption(caption) {
  let [start, end, text] = caption;
  let bounds = new Bounds(start, end);
  return text.split(' ').map(token => [start, end, token]);
}

function loadJsonData(json_data, caption_data, face_data, highlight_phrases) {
  let videos = [];
  let interval_blocks = [];

  json_data.forEach(video_json => {
    let video_id = video_json.metadata.id;
    let video_name = video_json.metadata.name;
    let duration = video_json.metadata.num_frames / video_json.metadata.fps;

    videos.push({
      id: video_id,
      width: video_json.metadata.width,
      height: video_json.metadata.height,
      fps: video_json.metadata.fps,
      num_frames: video_json.metadata.num_frames,
      path: `tvnews/videos/${video_name}.mp4`
    });

    let empty_interval = new Interval(
      new Bounds(0, duration), {
        spatial_type: new SpatialType_Caption('No captions found.', null),
        metadata: {}
      }
    );

    let captions = _.get(caption_data, video_id, []).flatMap(flattenCaption);
    let highlight_idxs = getHighlightIndexes(captions, highlight_phrases);
    let caption_intervals = captions.map(
      (caption, i) => {
        let [start, end, text] = caption;
        let bounds = new Bounds(start, end);
        return new Interval(
          bounds, {
            spatial_type: new SpatialType_Caption(
              text, highlight_idxs.has(i) ? HIGHLIGHT_STYLE : null),
            metadata: {}
          }
        );
      }
    );

    let video_face_data = _.get(face_data, video_id, {ids: [], faces: []});
    let faces = video_face_data.faces;
    let face_id_to_name = video_face_data.ids.reduce((acc, x) => {
      acc[x[1]] = x[0];
      return acc;
    }, {});
    let makeFaceInterval = function(face) {
      let [x1, y1, x2, y2] = face.b;
      let [t0, t1] = face.t;
      return new Interval(
        new Bounds(t0, t1, new BoundingBox(x1, x2, y1, y2)),
        {
          spatial_type: new SpatialType_Bbox({
            fade: FACE_FADE_PARAMS, text: face.i ? face_id_to_name[face.i] : null
          })
        }
      );
    };

    interval_blocks.push({
      video_id: video_id,
      title: getVideoTitle(video_json.metadata),
      interval_sets: [{
        name: 'results',
        interval_set: new IntervalSet(
          video_json.intervals.map(interval => {
            let [start, end] = interval;
            return new Interval(
              new Bounds(start, end),
              {spatial_type: SpatialType_Temporal.get_instance(), metadata: {}}
            );
          }))
      }, {
        name: '_male_faces',
        interval_set: new IntervalSet(
          faces.filter(f => f.g == 'm').map(makeFaceInterval))
      }, {
        name: '_female_faces',
        interval_set: new IntervalSet(
          faces.filter(f => f.g == 'f').map(makeFaceInterval))
      }, {
        name: '_captions',
        interval_set: new IntervalSet(
          caption_intervals.length > 0 ? caption_intervals : [empty_interval])
      }]
    });
  });

  let database = new Database([new Table('videos', videos)]);
  return [database, interval_blocks];
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function format_time(s) {
  let h = Math.floor(s / 3600);
  s -= h * 3600;
  let m = Math.floor(s / 60);
  s -= m * 60;
  let pad = x => x.toString().padStart(2, '0');
  var ret = `${pad(m)}m ${pad(Math.floor(s))}s`;
  if (h > 0) {
    ret = `${h}h ` + ret;
  }
  return ret;
}

function getVideoTitle(video) {
  let [y, m, d] = video.date.split('-').map(x => Number.parseInt(x));
  let show = video.show.length > 0 ? video.show : '&lt;unnamed&gt;';
  return $('<span>').attr('title', video.name).text(`${video.channel}, ${show} on ${m}/${d}/${y}`).prop('outerHTML');
}

function getArchiveLogo(video, start, end) {
  let url = `https://archive.org/details/${video.name}/start/${Math.floor(start)}/end/${Math.floor(end)}`;
  return $('<span>').addClass('archive-logo').append(
    $('<a>').attr({href: url, target: '_blank', title: 'View at the Internet Archive!'}).append(
      $('<img>').attr('src', '/static/img/archive.svg'))
  ).prop('outerHTML');
};

function loadJsonDataForInternetArchive(json_data, caption_data, face_data,
                                        highlight_phrases) {
  let videos = [];
  let interval_blocks = [];

  json_data.forEach(video_json => {
    let video_id = video_json.metadata.id;
    let video_name = video_json.metadata.name;

    let selected_interval = randomChoice(video_json.intervals);
    let block_start = Math.max(
      Math.floor(selected_interval[0] - INTERNET_ARCHIVE_PAD_START), 0);
    let block_end = Math.min(
      block_start + INTERNET_ARCHIVE_MAX_CLIP_LEN,
      video_json.metadata.num_frames / video_json.metadata.fps);
    let block_length = block_end - block_start;

    videos.push({
      id: video_id,
      width: video_json.metadata.width,
      height: video_json.metadata.height,
      fps: video_json.metadata.fps,
      num_frames: (block_end - block_start) * video_json.metadata.fps,
      path: `${video_name}/${video_name}.mp4?start=${block_start}&end=${block_end}&exact=1&ignore=x.mp4`
    });

    let filterIntervals = function(interval) {
      let start = interval[0];
      let end = interval[1];
      return Math.min(block_end, end) - Math.max(block_start, start) >= 0;
    };

    let makeBounds = function(start, end, bbox) {
      return new Bounds(
        Math.min(Math.max(start - block_start, 0), block_length),
        Math.min(Math.max(end - block_start, 0), block_length),
        bbox);
    };

    let empty_interval = new Interval(
      makeBounds(block_start, block_end), {
        spatial_type: new SpatialType_Caption('No captions found.', null),
        metadata: {}
      }
    );

    let captions = _.get(caption_data, video_id, []).filter(
      filterIntervals
    ).flatMap(flattenCaption);
    let highlight_idxs = getHighlightIndexes(captions, highlight_phrases);
    let caption_intervals = captions.map(
      (caption, i) => {
        let [start, end, text] = caption;
        let bounds = makeBounds(start, end);
        return new Interval(
          bounds, {
            spatial_type: new SpatialType_Caption(
              text, highlight_idxs.has(i) ? HIGHLIGHT_STYLE : null),
            metadata: {}
          }
        );
      }
    );

    let video_face_data = _.get(face_data, video_id, {ids: [], faces: []});
    let faces = video_face_data.faces.filter(face => {
      let [start, end] = face.t;
      return Math.min(block_end, end) - Math.max(block_start, start) >= 0;
    });
    let face_id_to_name = video_face_data.ids.reduce((acc, x) => {
      acc[x[1]] = x[0];
      return acc;
    }, {});

    let makeFaceInterval = function(face) {
      let [x1, y1, x2, y2] = face.b;
      let [t0, t1] = face.t;
      return new Interval(
        makeBounds(t0, t1, new BoundingBox(x1, x2, y1, y2)),
        {
          spatial_type: new SpatialType_Bbox({
            fade: FACE_FADE_PARAMS, text: face.i ? face_id_to_name[face.i] : null
          })
        }
      );
    };

    interval_blocks.push({
      video_id: video_id,
      title: `${getVideoTitle(video_json.metadata)} (from ${format_time(block_start)} to ${format_time(block_end)}) ${getArchiveLogo(video_json.metadata, block_start, block_end)}`,
      interval_sets: [{
        name: 'results',
        interval_set: new IntervalSet(
          video_json.intervals.filter(
            filterIntervals
          ).map(interval => {
            let [start, end] = interval;
            return new Interval(
              makeBounds(start, end),
              {spatial_type: SpatialType_Temporal.get_instance(), metadata: {}}
            );
          }))
      }, {
        name: '_male_faces',
        interval_set: new IntervalSet(
          faces.filter(f => f.g == 'm').map(makeFaceInterval))
      }, {
        name: '_female_faces',
        interval_set: new IntervalSet(
          faces.filter(f => f.g == 'f').map(makeFaceInterval))
      }, {
        name: '_captions',
        interval_set: new IntervalSet(
          caption_intervals.length > 0 ? caption_intervals : [empty_interval])
      }]
    });
  });

  let database = new Database([new Table('videos', videos)]);
  return [database, interval_blocks];
}

function renderVGrid(json_data, caption_data, face_data, settings, highlight_words,
                     serve_from_internet_archive, container) {
  let [database, interval_blocks] = serve_from_internet_archive ?
    loadJsonDataForInternetArchive(json_data, caption_data, face_data, highlight_words) :
    loadJsonData(json_data, caption_data, face_data, highlight_words);
  ReactDOM.render(
    <VGrid interval_blocks={interval_blocks} database={database}
           settings={settings} />,
    document.getElementById(container));
}

window.renderVGrid = renderVGrid;
