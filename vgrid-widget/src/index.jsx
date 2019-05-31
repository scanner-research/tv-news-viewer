import React from 'react';
import ReactDOM from 'react-dom';
import {
  VGrid, Database, Table, Bounds, Interval, IntervalSet,
  SpatialType_Temporal, SpatialType_Caption, Metadata_Generic
} from '@wcrichto/vgrid';

import '@wcrichto/vgrid/dist/vgrid.css';


function loadJsonData(json_data, caption_data) {
  let videos = [];
  let interval_blocks = [];

  json_data.forEach(video_json => {
    let video_id = video_json.metadata.id;
    let video_name = video_json.metadata.name;

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
          _.get(caption_data, video_id, []).map(
            caption => {
              let [start, end, text] = caption;
              return new Interval(
                new Bounds(start, end),
                {spatial_type: new SpatialType_Caption(text), metadata: {}}
              );
            }
          ))
      }, {
        name: '_metadata',
        interval_set: new IntervalSet([
          new Interval(
            new Bounds(0, video_json.metadata.num_frames / video_json.metadata.fps),
            {
              spatial_type: SpatialType_Temporal.get_instance(),
              metadata: {video: new Metadata_Generic(video_name)}
            }
          )
        ])
      }]
    });
  });

  let database = new Database([new Table('videos', videos)]);
  return [database, interval_blocks];
}


function renderVGrid(json_data, caption_data, settings, container) {
  let [database, interval_blocks] = loadJsonData(json_data, caption_data);
  ReactDOM.render(
    <VGrid interval_blocks={interval_blocks} database={database}
           settings={settings} />,
    document.getElementById(container));
}

window.renderVGrid = renderVGrid;
