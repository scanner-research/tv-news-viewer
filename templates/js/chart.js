/* Embed a chart using vega-embed */

const VGRID_INSTRUCTIONS = 'Click to expand videos and press <kbd>space</kbd> to play/pause.';
var SERVE_FROM_INTERNET_ARCHIVE = true;

function test_auth() {
  let img = new Image();
  img.onload = () => { SERVE_FROM_INTERNET_ARCHIVE = false; };
  img.src = '{{ video_endpoint }}/do_not_delete.jpg';
}
test_auth();

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
    return '%b %Y';
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

function getEndDate(date_str) {
  let date = new Date(date_str);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().split('T')[0];
}

let secondsToMinutes = x => x / 60;

// FIXME: hack to make vega-lite work
function sanitizeStringForVegalite(s) {
  return s.replaceAll('[', '').replaceAll(']', '').replaceAll('"', '').replaceAll('.', '').replaceAll("'", '');
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
      return sanitizeStringForVegalite(result.query);
    };

    let year_span = (
      new Date(this.options.end_date).getUTCFullYear() -
      new Date(this.options.start_date).getUTCFullYear()
    );

    let unit = this.options.count == '{{ countables.mentions.value }}' ? 'mentions' : 'minutes';

    // Helper to compute values
    let raw_precision = this.options.count == '{{ countables.mentions.value }}' ? 0 : 2;
    let exp_threshold = 0.001;
    function getPointValue(result, video_data, t) {
      var value = video_data.reduce((acc, x) => acc + x[1], 0);
      var value_str;
      if (result.normalize) {
        // Normalized is unitless
        var denom = _.get(result.normalize, t, null);
        if (denom) { // TODO: what if this is NaN
          value /= denom;
        }
        value_str = value >= exp_threshold ? value.toFixed(5) : value.toExponential(2);
      } else {
        // Unit remains the same
        if (result.subtract) {
          value -= _.get(result.subtract, t, 0.);
        }
        if (unit == 'minutes') {
          value = secondsToMinutes(value);
        }
        value_str = `${value.toFixed(raw_precision)} ${unit}`;
      }
      return {value: value, text: value_str};
    }

    // Data for lines
    let line_data = Object.entries(this.search_results).flatMap(
      ([color, result]) => {
        var values = result.main;
        // Fill in zeros for subtraction
        if (result.subtract) {
          Object.keys(result.subtract).forEach(t => {
            if (!values.hasOwnProperty(t)) {
              values[t] = [];
            }
          });
        }
        // Fill in zeros for points next to non-zero points
        values = fillZeros(
          values, this.options.aggregate, this.options.start_date,
          this.options.end_date, []);
        return Object.entries(values).map(
          ([t, v]) => {
            let x = getPointValue(result, v, t);
            return {
              time: t, color: color, value: x.value, value_str: x.text,
              size: v.length > 0 ? 30 : 0
            };
          }
        );
      }
    );

    // Data for tooltips
    let all_times_set = new Set(line_data.map(x => x.time));
    let tooltip_data = Array.from(all_times_set).map(t => {return {time: t};});

    // X axis settings
    let x_tick_count = Math.min(24, all_times_set.size);
    let x_start_date = getStartDate(
      this.options.aggregate, this.options.start_date);
    let x_end_date = getEndDate(this.options.end_date);

    // Y axis settings
    var y_axis_title;
    if (Object.values(this.search_results).some(v => v.has_normalization())) {
      if (Object.values(this.search_results).some(v => !v.has_normalization())) {
        y_axis_title = 'Unknown: normalized and raw units';
      } else {
        y_axis_title = `Normalized fraction of ${unit}`;
      }
    } else {
      y_axis_title = `Number of ${unit}`;
    }

    let vega_spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v3.json',
      width: this.dimensions.width,
      height: this.dimensions.height,
      autosize: {type: 'fit', resize: true, contains: 'padding'},
      data: {values: tooltip_data},
      encoding: {
        x: {
          timeUnit: 'utcyearmonthdate', field: 'time', type: 'temporal',
          axis: {
            titleFontSize: 12, labelFontSize: 12, tickCount: x_tick_count,
            format: getVegaDateFormat(this.options.aggregate), title: null,
            labelAngle: -30
          },
          scale: {
            domain: [x_start_date, x_end_date]
          }
        },
        tooltip: null
      },
      layer: [{
        data: {values: line_data},
        mark: {
          type: 'line',
          interpolate: 'linear'
        },
        encoding: {
          x: {
            field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate',
            scale: {
              domain: [x_start_date, x_end_date]
            }
          },
          y: {
            field: 'value', type: 'quantitative', title: y_axis_title,
            axis: {
              titleFontSize: 12, labelFontSize: 12, tickCount: 5
            }
          },
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
            condition: {
              selection: {not: 'hover'}, value: 'transparent'
            }
          },
        }
      }]
    };

    let moment_date_format = getMomentDateFormat(this.options.aggregate);
    let this_chart = this;
    function showVideos(t) {
      let video_div_selector = $(video_div_id).empty();
      let date_str = moment(t).format(moment_date_format);
      let content_str = SERVE_FROM_INTERNET_ARCHIVE ? 'clips (up to 3 minutes)' : 'videos';
      video_div_selector.append(
        $('<h5 />').append(`Showing ${content_str} from <b>${date_str}</b>.`),
        $('<p />').append(VGRID_INSTRUCTIONS)
      );
      let count = this_chart.options.count;
      Object.entries(this_chart.search_results).forEach(([color, result]) => {
        let video_ids = result.main[t].map(x => x[0]);
        let params = {
          color: color, count: count, query: result.query,
          video_ids: video_div_id ? video_ids :
            shuffle(video_ids).slice(0, MAX_NEW_WINDOW_VIDEOS),
          video_count: video_ids.length
        };

        video_div_selector.append('<hr>', $(`<iframe class="vgrid-iframe" color="${color}" src="/videos" width="100%" frameBorder="0">`));
        $(`${video_div_id} iframe[color="${color}"]`).on('load', function() {
          let iframe = $(this)[0];
          iframe.contentWindow.loadVideos(params, SERVE_FROM_INTERNET_ARCHIVE);
        });
      });
      video_div_selector.show();
    }

    vegaEmbed(div_id, vega_spec, {actions: false}).then(
      ({spec, view}) => {
        let tooltip = $('<div class="chart-tooltip" />').append(
          $('<span />').append(
            $('<h6 name="time" />'),
            video_div_id ? '&nbsp; Click to view videos.' : null
          ));
        Object.entries(this_chart.search_results).forEach(
          ([color, result]) => {
            tooltip.append(
              $('<span />').append(
                $(`<code />`).css('color', color).text(result.query)));
            tooltip.append(
              $('<span />').append($('<i />').attr('color', color)));
          })
        $(div_id).append(tooltip);

        view.addEventListener('mouseover', function(event, item) {
          if (item) {
            let t = new Date(item.datum.datum.time).toISOString().split('T')[0];
            let t_str = moment(t).format(moment_date_format);
            tooltip.find('h6[name="time"]').text(t_str);
            Object.entries(this_chart.search_results).forEach(
              ([color, result]) => {
                let video_data = _.get(result.main, t, []);
                let x = getPointValue(result, video_data, t);
                tooltip.find(`i[color="${color}"]`).text(`${x.text} in ${video_data.length} videos`);
              });
            tooltip.css('left', event.x + 10);
            tooltip.css('top', event.y + 10);
            tooltip.show();
          } else {
            tooltip.hide();
          }
        });

        if (video_div_id) {
          view.addEventListener('click', function(event, item) {
            let t = new Date(item.datum.datum.time).toISOString().split('T')[0];
            showVideos(t);
          });
        }
      }
    );
  }
}

function resizeVideoIFrames() {
  $('.vgrid-iframe').each(function() {
    let iframe = $(this)[0];
    if (iframe && document.contains(iframe)) {
      $(iframe).ready(function() {
        if (iframe.contentWindow.document.body) {
          iframe.height = iframe.contentWindow.document.body.scrollHeight;
        }
      });
    }
  });
  setTimeout(resizeVideoIFrames, 100);
}
resizeVideoIFrames();

// Invalidate all tooltips
$(window).scroll(function() {
  $('.chart-tooltip').hide();
});
