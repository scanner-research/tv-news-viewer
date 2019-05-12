import React from 'react';
import ReactDOM from 'react-dom';
import {
  VGrid, Database, Table, Bounds, Interval, IntervalSet,
  SpatialType_Temporal, SpatialType_Caption
} from '@wcrichto/vgrid';

import '@wcrichto/vgrid/dist/vgrid.css';


// Pad time onto intervals to make them more visible
const INTERVAL_PADDING = 60;


function loadJsonData(json_data) {
  let videos = [];
  let interval_blocks = [];

  json_data.forEach(video_json => {

    videos.push({
      id: video_json.metadata.id,
      width: video_json.metadata.width,
      height: video_json.metadata.height,
      fps: video_json.metadata.fps,
      num_frames: video_json.metadata.num_frames,
      path: `tvnews/videos/${video_json.metadata.name}.mp4`
    });

    interval_blocks.push({
      video_id: video_json.metadata.id,
      interval_sets: [{
        name: 'results',
        interval_set: new IntervalSet(
          video_json.intervals.map(interval => {
            let [start, end] = interval;
            return new Interval(
              new Bounds(start, Math.max(end, start + INTERVAL_PADDING)),
              {spatial_type: SpatialType_Temporal.get_instance(), metadata: {}}
            );
          }))
      }, {
        name: '_captions',
        interval_set: new IntervalSet(
          video_json.captions.map(caption => {
            let [start, end, text] = caption;
            return new Interval(
              new Bounds(start, end),
              {spatial_type: new SpatialType_Caption(text), metadata: {}}
            );
          }))
      }],
    });
      // , {
      //   name: '_captions',
      //   interval_set:
      //   }))
      // }, {
      //   name: '_metadata',
      //   interval_set: [{
      //     t: [0, video_json.metadata.num_frames / video_json.metadata.fps],
      //     x: [0, 1], y: [0, 1],
      //     payload: {
      //       metadata: {
      //         video: {type: 'Metadata_Generic', args: {data: video_json.metadata.name}}
      //       },
      //       spatial_type: {type: 'SpatialType_Bbox'}
      //     }
      //   }]
      // }]
    // });
  });

  let database = new Database([new Table('videos', videos)]);
  return [database, interval_blocks];
}


function renderVGrid(json_data, settings) {
  let [database, interval_blocks] = loadJsonData(json_data);
  ReactDOM.render(
    <VGrid interval_blocks={interval_blocks} database={database}
           settings={settings} />,
    document.getElementById('videos'));
}

window.renderVGrid = renderVGrid;
