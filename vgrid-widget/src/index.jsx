import React from 'react';
import ReactDOM from 'react-dom';
import {
  VGrid, Database, Table, Bounds, Interval, IntervalSet,
  SpatialType_Temporal, SpatialType_Caption, Metadata_Generic
} from '@wcrichto/vgrid';

import '@wcrichto/vgrid/dist/vgrid.css';

const HIGHLIGHT_STYLE = {backgroundColor: 'yellow'};

function loadJsonData(json_data, caption_data, highlight_words) {
  let videos = [];
  let interval_blocks = [];

  function shouldHighlight(text) {
    return text.split(' ').some(t => highlight_words.has($.trim(t).toLowerCase()));
  }

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

    interval_blocks.push({
      video_id: video_id,
      title: video_name,
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
        name: '_captions',
        interval_set: new IntervalSet(
          _.get(caption_data, video_id, [[0, duration, 'No captions found.']]).flatMap(
            caption => {
              let [start, end, text] = caption;
              let bounds = new Bounds(start, end);
              return text.split(' ').map(token =>
                new Interval(
                  bounds, {
                    spatial_type: new SpatialType_Caption(token, shouldHighlight(token) ? HIGHLIGHT_STYLE : null),
                    metadata: {}
                  }
                ));
            }
          ))
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


const INTERNET_ARCHIVE_MAX_CLIP_LEN = 180;
const INTERNET_ARCHIVE_PAD_START = 30;


function loadJsonDataForInternetArchive(json_data, caption_data, highlight_words) {
  let videos = [];
  let interval_blocks = [];

  function shouldHighlight(text) {
    return text.split(' ').some(t => highlight_words.has($.trim(t).toLowerCase()));
  }

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

    let makeBounds = function(start, end) {
      return new Bounds(
        Math.min(Math.max(start - block_start, 0), block_length),
        Math.min(Math.max(end - block_start, 0), block_length));
    }

    interval_blocks.push({
      video_id: video_id,
      title: `${video_name} (from ${format_time(block_start)} to ${format_time(block_end)})`,
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
        name: '_captions',
        interval_set: new IntervalSet(
          _.get(caption_data, video_id, [[block_start, block_end, 'No captions found.']]).filter(
            filterIntervals
          ).flatMap(
            caption => {
              let [start, end, text] = caption;
              let bounds = makeBounds(start, end);
              return text.split(' ').map(token =>
                new Interval(
                  bounds, {
                    spatial_type: new SpatialType_Caption(token, shouldHighlight(token) ? HIGHLIGHT_STYLE : null),
                    metadata: {}
                  }
                ));
            }
          ))
      }]
    });
  });

  let database = new Database([new Table('videos', videos)]);
  return [database, interval_blocks];
}


function renderVGrid(json_data, caption_data, settings, highlight_words,
                     serve_from_internet_archive, container) {
  let [database, interval_blocks] = serve_from_internet_archive ?
    loadJsonDataForInternetArchive(json_data, caption_data, highlight_words) :
    loadJsonData(json_data, caption_data, highlight_words);
  ReactDOM.render(
    <VGrid interval_blocks={interval_blocks} database={database}
           settings={settings} />,
    document.getElementById(container));
}

window.renderVGrid = renderVGrid;
