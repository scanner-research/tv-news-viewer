/* Embed a chart using vega-embed */

const MAX_DISPLAY_VIDEOS = 12;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fillZeros(data, unit, start, end, default_value) {
  let all_ts = new Set(Object.keys(data));
  Object.keys(data).forEach(t_curr_str => {
    let t_prev = new Date(t_curr_str);
    let t_next = new Date(t_curr_str);
    if (unit == 'day') {
      t_prev.setUTCDate(t_prev.getUTCDate() - 1);
      t_next.setUTCDate(t_next.getUTCDate() + 1);
    } else if (unit == 'week') {
      t_prev.setUTCDate(t_prev.getUTCDate() - 7);
      t_next.setUTCDate(t_next.getUTCDate() + 7);
    } else if (unit == 'month') {
      t_prev.setUTCMonth(t_prev.getUTCMonth() - 1);
      t_next.setUTCMonth(t_next.getUTCMonth() + 1);
    } else if (unit == 'year') {
      t_prev.setUTCMonth(t_prev.getUTCFullYear() - 1);
      t_next.setUTCMonth(t_next.getUTCFullYear() + 1);
    } else {
      throw Error(`Unknown unit: ${unit}`);
    }
    [t_prev, t_next].forEach(t => {
      let t_str = t.toISOString().split('T')[0];
      if (t_str >= start && t_str <= end) {
        if (t_str == t_curr_str) {
          throw Error('Perturbed date cannot equal current date');
        }
        if (!all_ts.has(t_str)) {
          data[t_str] = default_value;
          all_ts.add(t_str);
        }
      }
    });
  });
  return data;
}

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

function chartHrefHandler(b64json) {
  let params = JSON.parse(atob(b64json));
  console.log('Click params:', params);
  window.open(`/videos?params=${encodeURIComponent(JSON.stringify(params))}`, '_blank');
}

function getDateFormat(agg) {
  if (agg == 'year') {
    return '%Y';
  } else if (agg == 'month') {
    return '%b `%y';
  } else {
    return '%b %d, %Y';
  }
};

function loadChart(div_id, chart_options, search_results, dimensions) {

  let getSeriesName = (color) => {
    let result = search_results[color];
    // TODO: hack to make vega-lite work
    let query = result.query.replaceAll('[', '').replaceAll(']', '').replaceAll('"', '').replaceAll('.', '');
    return query;
  };

  let year_span = (
    new Date(chart_options.end_date).getUTCFullYear() -
    new Date(chart_options.start_date).getUTCFullYear()
  );
  let x_tick_count = chart_options.aggregate == 'year' ? year_span + 1 : 24;

  let unit = chart_options.count == 'mentions' ? 'mentions' : 'seconds';

  var has_norm = false;
  var has_raw = false;
  Object.keys(search_results).forEach(k => {
    let is_norm = search_results[k].has_normalization();
    has_norm |= is_norm;
    has_raw |= !is_norm;
  });

  var y_axis_title;
  if (has_norm) {
    if (has_raw) {
      y_axis_title = `(WARNING!) Mixing normalized and raw ${unit}`;
    } else {
      y_axis_title = `# of ${unit} / # of ${unit} (Normalized)`;
    }
  } else {
    y_axis_title = `# of ${unit}`;
  }

  let raw_precision = chart_options.count == 'mentions' ? 0 : 1;
  function getPointValue(result, video_data, t) {
    var value = video_data.reduce((acc, x) => acc + x[1], 0);
    var value_str;
    if (result.normalize) {
      // Normalized is unitless
      value /= _.get(result.normalize, t, 1.);
      value_str = value.toString();
    } else {
      // Unit remains the same
      if (result.subtraction) {
        value -= _.get(result.subtraction, t, 0.);
      }
      value_str = `${value.toFixed(raw_precision)} ${unit}`;
    }
    return {value: value, text: value_str};
  }

  let point_data = Object.keys(search_results).flatMap(color => {
    let result = search_results[color];
    let values = fillZeros(
      result.main, chart_options.aggregate, chart_options.start_date,
      chart_options.end_date, []);
    return Object.keys(values).map(
      t => {
        var link_href = null;
        if (ENABLE_PLAYBACK && values[t].length > 0) {
          // Enable embedded player
          let video_ids = shuffle(values[t].map(x => x[0]));
          let params = {
            count: chart_options.count,
            query: result.query,
            video_ids: video_ids.slice(0, MAX_DISPLAY_VIDEOS),
            video_count: values[t].length
          };
          link_href = `javascript:chartHrefHandler("${btoa(JSON.stringify(params))}")`;
        }
        let x = getPointValue(result, values[t], t);
        return {
          time: t, color: color, query: getSeriesName(color),
          value: x.value, value_str: x.text,
          video_href: link_href, size: values[t].length > 0 ? 30 : 0
        };
      }
    );
  });

  let series = Object.keys(search_results).map(
    color => ({name: getSeriesName(color), color: color})
  );
  let tooltip_data = Array.from(
    new Set(point_data.map(x => x.time))
  ).map(t => {
    let point = {time: t};
    Object.keys(search_results).forEach(color => {
      let result = search_results[color]
      let video_data = _.get(result.main, t, []);
      let x = getPointValue(result, video_data, t);
      point[getSeriesName(color)] = `${x.text} in ${video_data.length} videos`;
    });
    return point;
  });

  let chart_description = (
    chart_options.count == 'mentions' ? 'Keyword mentions' : (
      chart_options.count == 'videotime' ? 'Video time' : 'Face time'
    ));

  let vega_spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v3.json',
    width: dimensions.width,
    height: dimensions.height,
    autosize: {type: 'fit', resize: true, contains: 'padding'},
    description: `${chart_description} over time`,
    data: {values: tooltip_data},
    encoding: {
      x: {
        timeUnit: 'utcyearmonthdate', field: 'time', type: 'temporal',
        scale: {
          domain: [chart_options.start_date, chart_options.end_date]
        }
      },
      tooltip: [{
        field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate',
        title: 'time', format: getDateFormat(chart_options.aggregate)
      }].concat(series.map(x => ({field: x.name, type: 'nominal'}))),
    },
    layer: [{
      data: {values: point_data},
      mark: {
        type: 'line',
        interpolate: 'monotone'
      },
      encoding: {
        x: {
          field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate',
          scale: {
            domain: [chart_options.start_date, chart_options.end_date]
          }
        },
        y: {field: 'value', type: 'quantitative'},
        color: {field: 'color', type: 'nominal', scale: null},
        size: {value: 2},
        opacity: {value: 0.6}
      }
    }, {
      mark: 'rule',
      selection: {
        hover: {type: 'single', on: 'mouseover', nearest: true}
      },
      encoding: {
        color: {
          condition:{
            selection: {not: 'hover'}, value: 'transparent'
          }
        },
      }
    }, {
      data: {values: point_data},
      mark: {
        type: 'point',
        filled: true
      },
      encoding: {
        x: {
          field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate',
          title: null,
          axis: {
            titleFontSize: 12, labelFontSize: 12, tickCount: x_tick_count,
            format: getDateFormat(chart_options.aggregate), labelAngle: -30
          },
          scale: {
            domain: [chart_options.start_date, chart_options.end_date]
          }
        },
        y: {
          field: 'value', type: 'quantitative', title: y_axis_title,
          axis: {
            titleFontSize: 12, labelFontSize: 12, tickCount: 5
          }
        },
        color: {field: 'color', type: 'nominal', scale: null},
        size: {field: 'size', type: 'quantitative', scale: null},
        opacity: {value: 1},
        href: ENABLE_PLAYBACK ? {
          field: 'video_href', type: 'nominal'
        } : null,
        tooltip: [
          {field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate',
           title: 'time', format: getDateFormat(chart_options.aggregate)},
          {field: 'query', type: 'nominal'},
          {field: 'value_str', type: 'nominal', title: 'value'}
        ]
      }
    }]
  };
  vega_opts = {
    actions: false
  };
  vegaEmbed(div_id, vega_spec, vega_opts);
}
