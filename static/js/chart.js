/* Embed a chart using vega-embed */

const MAX_NEW_WINDOW_VIDEOS = 100;

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

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

function getVegaDateFormat(agg) {
  if (agg == 'year') {
    return '%Y';
  } else if (agg == 'month') {
    return '%b `%y';
  } else {
    return '%b %d, %Y';
  }
};

function getMomentDateFormat(agg) {
  if (agg == 'year') {
    return 'YYYY';
  } else if (agg == 'month') {
    return 'MMMM YYYY';
  } else {
    return 'LL';
  }
};

function getStartDate(agg, date_str) {
  if (agg == 'day') {
    return date_str;
  }
  let date = new Date(date_str);
  if (agg == 'year') {
    date.setUTCDate(1);
    date.setUTCMonth(0);
  } else if (agg == 'month') {
    date.setUTCDate(1);
  } else if (agg == 'week') {
    date.setUTCDate(date.getUTCDate() - 6); // Not quite beautiful
  } else {
    throw Error(`Unknown unit: ${unit}`);
  }
  return date.toISOString().split('T')[0];
}

let secondsToMinutes = x => x / 60;

// The currently loaded chart
var current_chart;

function chartHrefHandler(color, t, video_div_id) {
  // Enable embedded player
  let result = current_chart.search_results[color];
  let video_ids = result.main[t].map(x => x[0]);
  let date_format = getMomentDateFormat(current_chart.options.aggregate);
  let params = {
    time: moment(t).format(date_format), color: color,
    count: current_chart.options.count, query: result.query,
    video_ids: video_div_id != 'null' ? video_ids :
      shuffle(video_ids).slice(0, MAX_NEW_WINDOW_VIDEOS),
    video_count: video_ids.length
  };
  console.log('Click params:', params);
  if (video_div_id != 'null') {
    $(video_div_id).html($(`<iframe src="/videos" width="100%" frameBorder="0">`));
    let iframe_selector = video_div_id + ' iframe';
    let iframe = $(iframe_selector)[0];
    $(iframe_selector).on('load', () => {
      iframe.contentWindow.loadVideos(params);
      function resizeIframe() {
        if (document.contains(iframe)) {
          iframe.height = iframe.contentWindow.document.body.scrollHeight + 35;
          setTimeout(resizeIframe, 250);
        } else {
          console.log('height timer terminated');
        }
      }
      setTimeout(resizeIframe, 250)
    });
  } else {
    let url = `/videos?params=${encodeURIComponent(JSON.stringify(params))}`;
    window.open(url, '_blank');
  }
}

class Chart {
  constructor(chart_options, search_results, dimenisons) {
    this.dimensions = dimenisons;
    this.options = chart_options;
    this.search_results = search_results;
  }

  load(div_id, video_div_id) {
    let getSeriesName = (color) => {
      let result = this.search_results[color];
      // TODO: hack to make vega-lite work
      let query = result.query.replaceAll('[', '').replaceAll(']', '').replaceAll('"', '').replaceAll('.', '');
      return query;
    };

    let year_span = (
      new Date(this.options.end_date).getUTCFullYear() -
      new Date(this.options.start_date).getUTCFullYear()
    );

    let date_format = getVegaDateFormat(this.options.aggregate);
    let unit = this.options.count == 'occurences' ? 'occurences' : 'minutes';

    var y_axis_title;
    if (Object.values(this.search_results).some(v => v.has_normalization())) {
      if (Object.values(this.search_results).some(v => !v.has_normalization())) {
        y_axis_title = `(WARNING!) Mixing normalized and raw ${unit}`;
      } else {
        y_axis_title = `(Normalized) # of ${unit} / # of ${unit}`;
      }
    } else {
      y_axis_title = `# of ${unit}`;
    }

    let raw_precision = this.options.count == '{{ countables.mentions.name }}' ? 0 : 4;
    function getPointValue(result, video_data, t) {
      var value = secondsToMinutes(video_data.reduce((acc, x) => acc + x[1], 0));
      var value_str;
      if (result.normalize) {
        // Normalized is unitless
        value /= secondsToMinutes(_.get(result.normalize, t, 60.));
        value_str = value.toString();
      } else {
        // Unit remains the same
        if (result.subtraction) {
          value -= secondsToMinutes(_.get(result.subtraction, t, 0.));
        }
        value_str = `${value.toFixed(raw_precision)} ${unit}`;
      }
      return {value: value, text: value_str};
    }

    let point_data = Object.keys(this.search_results).flatMap(color => {
      let result = this.search_results[color];
      var values = result.main;
      // Fill in zeros for subtraction
      if (result.subtraction) {
        Object.keys(result.subtraction).forEach(t => {
          if (!values.hasOwnProperty(t)) {
            values[t] = [];
          }
        });
      }
      // Fill in zeros for points next to non-zero points
      values = fillZeros(
        values, this.options.aggregate, this.options.start_date,
        this.options.end_date, []);
      return Object.keys(values).map(
        t => {
          let link_href = (ENABLE_PLAYBACK && values[t].length > 0) ?
            `javascript:chartHrefHandler("${color}", "${t}", "${video_div_id}")` : null;
          let x = getPointValue(result, values[t], t);
          return {
            time: t, color: color, query: getSeriesName(color),
            value: x.value, value_str: x.text,
            video_href: link_href, size: values[t].length > 0 ? 30 : 0
          };
        }
      );
    });

    let series = Object.keys(this.search_results).map(
      color => ({name: getSeriesName(color), color: color})
    );
    let set_t = new Set(point_data.map(x => x.time));
    let tooltip_data = Array.from(set_t).map(t => {
      let point = {time: t};
      Object.keys(this.search_results).forEach(color => {
        let result = this.search_results[color]
        let video_data = _.get(result.main, t, []);
        let x = getPointValue(result, video_data, t);
        point[getSeriesName(color)] = `${x.text} in ${video_data.length} videos`;
      });
      return point;
    });

    let x_tick_count = Math.min(24, set_t.size);
    let x_start_date = getStartDate(
      this.options.aggregate, this.options.start_date);

    let vega_spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v3.json',
      width: this.dimensions.width,
      height: this.dimensions.height,
      autosize: {type: 'fit', resize: true, contains: 'padding'},
      data: {values: tooltip_data},
      encoding: {
        x: {
          timeUnit: 'utcyearmonthdate', field: 'time', type: 'temporal',
          scale: {
            domain: [x_start_date, this.options.end_date]
          }
        },
        tooltip: [{
          field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate',
          title: 'time', format: date_format
        }].concat(series.map(x => ({field: x.name, type: 'nominal'}))),
      },
      layer: [{
        data: {values: point_data},
        mark: {
          type: 'line',
          interpolate: 'linear'
        },
        encoding: {
          x: {
            field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate',
            scale: {
              domain: [x_start_date, this.options.end_date]
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
              format: getVegaDateFormat(this.options.aggregate),
              labelAngle: -30
            },
            scale: {
              domain: [x_start_date, this.options.end_date]
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
             title: 'time', format: getVegaDateFormat(this.options.aggregate)},
            {field: 'query', type: 'nominal'},
            {field: 'value_str', type: 'nominal', title: 'value'}
          ]
        }
      }]
    };
    vegaEmbed(div_id, vega_spec, {actions: false});

    current_chart = this;
  }
}
