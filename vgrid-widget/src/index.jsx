import React from 'react';
import ReactDOM from 'react-dom';
import {VGridProps, IntervalSet, Database, VGrid, vdata_from_json} from '@wcrichto/vgrid';

import '@wcrichto/vgrid/dist/vgrid.css';

function renderVGrid(interval_blocks, database, settings) {
  database = Database.from_json(database);
  interval_blocks = interval_blocks.map((intervals) => {
     let {video_id, interval_dict} = intervals;
     return {
       video_id: video_id,
       interval_sets: _.mapValues(interval_dict, (intervals, name) =>
         (IntervalSet).from_json(intervals, vdata_from_json))
     };
   });
  ReactDOM.render(
    <VGrid interval_blocks={interval_blocks} database={database} settings={settings} />,
    document.getElementById("videos"));
}

window.renderVGrid = renderVGrid;
