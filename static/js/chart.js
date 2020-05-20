/* Embed a chart using vega-embed */

const VGRID_INSTRUCTIONS = $('<ul />').append(
  $('<li>').html('Click on the thumbnails to expand videos and press <kbd>Space</kbd> to play/pause.'),
  $('<li>').html('The playback position is indicated by the <mark style="background-color: #84db57;">green</mark> bar.'),
  $('<li>').html('<mark style="background-color: grey">Gray</mark> bars indicate matched intervals (note that commercials are excluded by default).'),
  $('<li>').html('Relavant words in the transcripts are highlighted in <mark style="background-color: yellow;">yellow</mark>.'),
  $('<li>').html('Expand the video thumbnail to show labeled identities.')
);

const EPSILON = 1e-4;

function weightedShuffle(data) {
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


function getNumTimeBins(unit, start, end) {
  var increment;
  if (unit == 'day') {
    increment = d => d.setUTCDate(d.getUTCDate() + 1);
  } else if (unit == 'week') {
    increment = d => d.setUTCDate(d.getUTCDate() + 7);
  } else if (unit == 'month') {
    increment = d => d.setUTCMonth(d.getUTCMonth() + 1);
  } else if (unit == 'year') {
    increment = d => d.setUTCFullYear(d.getUTCFullYear() + 1);
  } else {
    throw Error(`Unknown unit: ${unit}`);
  }
  let end_t = new Date(end);
  var curr_t = new Date(start);
  var i = 0;
  while (curr_t <= end_t) {
    increment(curr_t);
    i++;
  }
  return i;
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
      t_prev.setUTCFullYear(t_prev.getUTCFullYear() - 1);
      t_next.setUTCFullYear(t_next.getUTCFullYear() + 1);
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
}

function getDateFormatFunction(agg) {
  var date_format;
  if (agg == 'year') {
    date_format = 'YYYY';
  } else if (agg == 'month') {
    date_format = 'MMM YYYY';
  } else {
    date_format = 'll';
  }
  return t => {
    var date_str = moment(t).format(date_format);
    if (agg == 'week') {
      date_str = '(Week of) ' + date_str;
    }
    return date_str;
  };
}

function getStartDate(agg, date_str) {
  let date = new Date(date_str);
  if (agg == 'year') {
    date.setUTCMonth(0, 1);
  } else if (agg == 'month') {
    date.setUTCDate(1);
  } else if (agg == 'week') {
    date.setUTCDate(date.getUTCDate() - date.getDay());
  } else if (agg == 'day') {
    // Do nothing
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

function secondsToMinutes(x) {
  return x / 60;
}

function getPointValue(result, video_data, t) {
  var value = video_data.reduce((acc, x) => acc + x[1], 0);
  if (result.normalize) {
    var denom = _.get(result.normalize, t, null);
    if (denom) { // TODO: what if this is NaN
      value /= denom;
    }
  } else {
    if (result.subtract) {
      value -= _.get(result.subtract, t, 0.);
    }
    value = secondsToMinutes(value);
  }
  return value;
}

function getRoundedValue(value, frac_digits) {
  let exp_threshold = 1. / Math.pow(10, frac_digits);
  return (value >= exp_threshold || Math.abs(value) <= 1e-12 ?
    value.toLocaleString(undefined, {
      maximumFractionDigits: frac_digits,
      minimumFractionDigits: frac_digits
    }) : value.toExponential(Math.max(frac_digits, 2)));
}

class Chart {
  constructor(chart_options, search_results, dimenisons, search_macros) {
    this.dimensions = dimenisons;
    this.options = chart_options;
    this.search_results = search_results;
    this.search_macros = search_macros;
  }

  _getVegaSpec(options) {
    let year_span = (
      new Date(this.options.end_date).getUTCFullYear() -
      new Date(this.options.start_date).getUTCFullYear()
    );

    // Data for lines
    let line_data = _.flatMap(this.search_results, ([color, result]) => {
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
          let value = getPointValue(result, v, t);
          return {
            time: t, color: color, value: value,
            size: v.length > 0 ? 30 : 0
          };
        }
      );
    });

    // X axis settings
    let all_times_set = new Set(line_data.map(x => x.time));
    let x_axis_data = Array.from(all_times_set).map(t => {return {time: t};});
    let x_tick_count = Math.min(24, all_times_set.size);
    let x_start_date = getStartDate(
      this.options.aggregate, this.options.start_date);
    let x_end_date = getEndDate(this.options.end_date);

    // Y axis settings
    var y_axis_title;
    if (this.search_results.some(kv => kv[1].has_normalization())) {
      if (this.search_results.some(kv => !kv[1].has_normalization())) {
        y_axis_title = 'Warning: mixing normalized and absolute screen time';
      } else {
        y_axis_title = `Fraction of Screen Time`;
      }
    } else {
      y_axis_title = 'Minutes';
    }

    let vega_layers = [{
      data: {values: line_data},
      mark: {
        type: 'line',
        interpolate: 'linear'
      },
      encoding: {
        x: {
          field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate',
          axis: {
            titleFontSize: 12, labelFontSize: 12, tickCount: x_tick_count,
            format: getVegaDateFormat(this.options.aggregate), title: null,
            labelAngle: 0, gridOpacity: 0.5, tickCount: 10
          },
          scale: {
            domain: [x_start_date, x_end_date]
          }
        },
        y: {
          field: 'value', type: 'quantitative', title: y_axis_title,
          axis: {
            titleFontSize: 12, labelFontSize: 12, tickCount: 5,
            gridOpacity: 0.5
          }
        },
        color: {field: 'color', type: 'nominal', scale: null},
        size: {value: 2},
        opacity: {value: 0.6}
      }
    }];

    if (options.show_mean) {
      // Compute mean for each value
      let num_time_bins = getNumTimeBins(
        this.options.aggregate, this.options.start_date, this.options.end_date);
      let mean_data = Object.entries(
        line_data.reduce((acc, x) => {
          if (acc.hasOwnProperty(x.color)) {
            acc[x.color] += x.value;
          } else {
            acc[x.color] = x.value;
          }
          return acc;
        }, {})
      ).map(([color, total]) => {
        let value = total / num_time_bins;
        let num_digits = value > 15 ? 0 : 2;
        return {
          color: color, value: value, time: this.options.start_date,
          value_str: `avg=${getRoundedValue(value, num_digits)}`
        };
      });
      vega_layers.push({
        data: {values: mean_data},
        mark: {
          type: 'text', align: 'right', dx: -15
        },
        encoding: {
          x: {field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate', title: null},
          y: {field: 'value', type: 'quantitative', title: null},
          text: {field: 'value_str', type: 'nominal'},
          color: {field: 'color', type: 'nominal', scale: null}
        }
      });
    }

    if (options.show_tooltip) {
      vega_layers.push({
        mark: 'rule',
        selection: {
          hover: {
            type: 'single', on: 'mouseover', nearest: true, encodings: ['x'],
            clear: 'mouseout'
          }
        },
        encoding: {
          opacity: {
            condition: {
              selection: {not: 'hover'}, value: 'transparent'
            },
            value: 0.5
          }
        }
      });
    }

    let vega_spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v3.json',
      width: this.dimensions.width,
      height: this.dimensions.height,
      autosize: {type: 'fit', resize: true, contains: 'padding'},
      data: {values: x_axis_data},
      encoding: {
        x: {
          timeUnit: 'utcyearmonthdate', field: 'time', type: 'temporal',
          axis: {
            titleFontSize: 12, labelFontSize: 12, tickCount: x_tick_count,
            format: getVegaDateFormat(this.options.aggregate), title: null,
            labelAngle: 0, gridOpacity: 0.5, tickCount: 10
          },
          scale: {
            domain: [x_start_date, x_end_date]
          }
        },
        tooltip: null
      },
      layer: vega_layers,
      view: {
         stroke: 'transparent'
      }
    };
    if (!options.transparent) {
      vega_spec.background = 'white';
    }
    return vega_spec;
  }

  _showVideos(t, video_div_id) {
    let video_div = $(video_div_id).empty();
    let date_str = getDateFormatFunction(this.options.aggregate)(t);
    let content_str = SERVE_FROM_INTERNET_ARCHIVE ? 'clips (up to 3 minutes)' : 'videos';
    video_div.append(
      $('<h5>').append(`Showing ${content_str} from <b>${date_str}</b>.`),
      $('<p>').append(VGRID_INSTRUCTIONS)
    );

    let search_macros = this.search_macros;
    let count = this.options.count;
    this.search_results.forEach(([color, result]) => {
      let shuffled_results = weightedShuffle(
        [..._.get(result.main, t, [])]
      );
      let video_ids = shuffled_results.map(x => x[0]);
      let params = {
        color: color, count: count, query: result.query, macros: search_macros,
        video_ids: video_ids, video_count: video_ids.length
      };

      video_div.append(
        '<hr>',
        $('<iframe>').addClass('vgrid-iframe').attr(
          {color: color, src: '/video-embed'}
        ).on('load', function() {
          let iframe = $(this)[0];
          iframe.contentWindow.loadVideos(params, SERVE_FROM_INTERNET_ARCHIVE);
        })
      );
    });
    video_div.show();

    // For small screens, scroll the page
    $([document.documentElement, document.body]).animate({
      scrollTop: video_div.offset().top
    }, 1000);
  }

  load(div_id, options) {
    let vega_spec = this._getVegaSpec(options);

    let formatDate = getDateFormatFunction(this.options.aggregate);
    let this_chart = this;
    vegaEmbed(
      div_id, vega_spec, {actions: _.get(options, 'vega_actions', false)}
    ).then(
      ({spec, view}) => {
        if (options.show_tooltip) {
          let tooltip = $('<div>').addClass('chart-tooltip').append(
            $('<span>').addClass('tooltip-time'),
            this_chart.search_results.map(([color, result]) =>
              $('<span>').addClass('tooltip-entry').append(
                $('<div>').addClass('tooltip-legend').css('background-color', color),
                $('<span>').addClass('tooltip-data').attr('color', color))
            )
          );
          // Hack to prevent tooltip from stealing focus
          tooltip.hover(function() {
            tooltip.hide();
          });
          $(div_id).append(tooltip);

          view.addEventListener('mouseout', function(event, item) {
            tooltip.hide();
            $('.chart-link').hide();
          });

          view.addEventListener('mouseover', function(event, item) {
            let chart_link = $('.chart-link');
            if (item && item.datum) {
              let t = new Date(item.datum.datum.time).toISOString().split('T')[0];
              let t_str = formatDate(t);
              tooltip.find('.tooltip-time').text(t_str);
              let values = this_chart.search_results.map(
                ([color, result]) => {
                  let video_data = _.get(result.main, t, []);
                  return [color,  getPointValue(result, video_data, t)];
                }
              );
              let values_only = values.map(x => x[1]);
              let min_value = _.min(values_only);
              let max_value = _.max(values_only);
              let num_digits = min_value > 15 ? 0 : (
                max_value < 1 || min_value < 0.1 ? 2 : 1);
              values.forEach(
                ([color, value]) =>
                  tooltip.find(`.tooltip-data[color="${color}"]`).text(
                    getRoundedValue(value, num_digits))
              );

              let chart_div = $(div_id);
              let tooltip_x = (
                event.x >= window.innerWidth / 2 ?
                event.x - tooltip.width() - 25 : event.x + 10);
              let tooltip_y = (
                event.y >= chart_div.position().top + chart_div.height() / 2 ?
                event.y - tooltip.height() - 25 : event.y + 10);
              tooltip.css('left', tooltip_x);
              tooltip.css('top', tooltip_y);
              tooltip.show();
              chart_link.show();
            } else {
              tooltip.hide();
              chart_link.hide();
            }
          });
        }

        if (options) {
          if (options.video_div) {
            let video_div = options.video_div;
            view.addEventListener('click', function(event, item) {
              let t = new Date(item.datum.datum.time).toISOString().split('T')[0];
              this_chart._showVideos(t, video_div);
            });
          } else if (options.href) {
            let open_href = () => window.open(options.href, '_blank');
            view.addEventListener('click', open_href);
            $(div_id).append(
              $('<div>').addClass('chart-link').text(
                options.href_message ? options.href_message : 'Click to open!'
              ).click(open_href)
            );
          }
        }
      }
    );
  }
}

setInterval(() => {
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
}, 100);

// Invalidate all tooltips
function hideTooltips() {
  $('.chart-tooltip').hide();
}
$(window).scroll(hideTooltips);

testVideoAuth();
