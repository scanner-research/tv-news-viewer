/* Embed a chart using vega-embed */

const VGRID_INSTRUCTIONS = $('<ul />').append(
  $('<li>').html('Click on the thumbnails to expand videos and press <kbd>Space</kbd> to play/pause.'),
  $('<li>').html('The playback position is indicated by the <mark style="background-color: #84db57;">green</mark> bar.'),
  $('<li>').html('<mark style="background-color: grey">Gray</mark> bars indicate matched intervals (note that commercials are excluded by default).'),
  $('<li>').html('Relavant words in the transcripts are highlighted in <mark style="background-color: yellow;">yellow</mark>.')
);

var SERVE_FROM_INTERNET_ARCHIVE = true;

{% if video_endpoint is not none %}
function test_auth() {
  let img = new Image();
  img.onload = () => { SERVE_FROM_INTERNET_ARCHIVE = false; };
  img.src = '{{ video_endpoint }}/do_not_delete.jpg';
}
test_auth();
{% endif %}

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.split(search).join(replacement);
};

const EPSILON = 1e-4;

function weighted_shuffle(data) {
  let result = [];
  while (data.length > 0) {
    let total = data.reduce((acc, x) => acc + x[1], 0.);
    var sample = Math.random() * total - EPSILON;
    for (var i = 0; i < data.length; i++) {
      sample -= data[i][1];
      if (sample < 0) {
        result.push(data[i]);
        if (i < data.length - 1) {
          data[i] = data.pop();
        } else {
          data.pop();
        }
        break;
      }
    }
  }
  return result;
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

class Chart {
  constructor(chart_options, search_results, dimenisons) {
    this.dimensions = dimenisons;
    this.options = chart_options;
    this.search_results = search_results;
  }

  load(div_id, options) {
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
        value_str = (value >= exp_threshold ?
          value.toLocaleString(undefined, {maximumFractionDigits: 5}) : value.toExponential(2));
      } else {
        // Unit remains the same
        if (result.subtract) {
          value -= _.get(result.subtract, t, 0.);
        }
        if (unit == 'minutes') {
          value = secondsToMinutes(value);
        }
        value_str = `${value.toLocaleString(undefined, {maximumFractionDigits: 2})} ${unit}`;
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
    function showVideos(t, video_div) {
      let video_div_selector = $(video_div).empty();
      let date_str = moment(t).format(moment_date_format);
      let content_str = SERVE_FROM_INTERNET_ARCHIVE ? 'clips (up to 3 minutes)' : 'videos';
      video_div_selector.append(
        $('<h5 />').append(`Showing ${content_str} from <b>${date_str}</b>.`),
        $('<p />').append(VGRID_INSTRUCTIONS)
      );

      let count = this_chart.options.count;
      Object.entries(this_chart.search_results).sort(
        (a, b) => a[1].query >= b[1].query
      ).forEach(([color, result]) => {
        let shuffled_results = weighted_shuffle(
          [..._.get(result.main, t, [])]
        );
        let video_ids = shuffled_results.map(x => x[0]);
        let params = {
          color: color, count: count, query: result.query,
          video_ids: video_ids, video_count: video_ids.length
        };

        video_div_selector.append(
          '<hr>',
          $('<iframe class="vgrid-iframe" src="/video-embed" width="100%" frameBorder="0">').attr(
            'color', color
          ).on('load', function() {
            let iframe = $(this)[0];
            iframe.contentWindow.loadVideos(params, SERVE_FROM_INTERNET_ARCHIVE);
          })
        );
      });
      video_div_selector.show();

      // For small screens, scroll the page
      $([document.documentElement, document.body]).animate({
        scrollTop: video_div_selector.offset().top
      }, 1000);
    }

    vegaEmbed(div_id, vega_spec, {actions: false}).then(
      ({spec, view}) => {
        let tooltip = $('<div class="chart-tooltip" />').append(
          $('<span />').append($('<h6 name="time" />')
        ));
        Object.entries(this_chart.search_results).forEach(
          ([color, result]) => {
            tooltip.append(
              result.alias ?
                $('<span />').append(
                  $(`<span />`).css('color', color).text(result.alias)) :
                $('<span />').append(
                  $(`<code />`).css('color', color).text(result.query),
                  $.trim(result.query).endsWith('WHERE') ?
                    $('<code />').css('color', 'gray').text('all the data') : null));
            tooltip.append(
              $('<span />').append($('<i />').attr('color', color)));
          })
        $(div_id).append(tooltip);

        view.addEventListener('mouseover', function(event, item) {
          if (item && item.datum) {
            let t = new Date(item.datum.datum.time).toISOString().split('T')[0];
            let t_str = moment(t).format(moment_date_format);
            tooltip.find('h6[name="time"]').text(t_str);
            Object.entries(this_chart.search_results).forEach(
              ([color, result]) => {
                let video_data = _.get(result.main, t, []);
                let x = getPointValue(result, video_data, t);
                tooltip.find(`i[color="${color}"]`).text(`${x.text}, ${video_data.length.toLocaleString()} videos`);
              });
            tooltip.css('left', event.x + 10);
            tooltip.css('top', event.y + 10);
            tooltip.show();
          } else {
            tooltip.hide();
          }
        });

        if (options) {
          if (options.video_div) {
            let video_div = options.video_div;
            view.addEventListener('click', function(event, item) {
              let t = new Date(item.datum.datum.time).toISOString().split('T')[0];
              showVideos(t, video_div);
            });
          } else if (options.href) {
            view.addEventListener('click', function(event, item) {
              window.open(options.href, '_blank');
            });
          }
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
function hideTooltips() {
  $('.chart-tooltip').hide();
}
$(window).scroll(hideTooltips);
$(window).mousemove(function(e){
  if ($(e.target).parent().is('canvas')) {
    hideTooltips();
  }
});
