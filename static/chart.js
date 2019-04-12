/* Embed a chart using vega-embed */

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

function loadChart(div_id, chart_options, search_results, dimensions) {
  let agg_data = Object.keys(search_results).flatMap(color => {
    let result = search_results[color];
    let data = fillZeros(
      result.data, chart_options.aggregate, chart_options.start_date,
      chart_options.end_date, []);
    return Object.keys(data).map(
      t => {
        var link_href = null;
        if (data[t].length > 0) {
          link_href = `/videos?query=${result.query}&window=${chart_options.window}&ids=${JSON.stringify(data[t].map(x => x[0]))}`;
        }
        return {
          time: t, color: color, query: result.query,
          value: data[t].reduce((acc, x) => acc + x[1], 0),
          video_count: data[t].length,
          video_href: link_href,
          size: data[t].length > 0 ? 30 : 0
        };
      }
    );
  });

  let unit = chart_options.window > 0 ? 'seconds' : 'mentions';
  let vega_spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v3.json',
    description: `${chart_options.window  > 0 ? 'Keyword mentions' : 'Topic time'} over time`,
    data: {
      values: agg_data
    },
    layer: [{
      mark: {
        type: 'point',
        filled: true
      },
      encoding: {
        x: {
          field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate',
          title: 'time', axis: {titleFontSize: 18, labelFontSize: 18},
          scale: {
            domain: [chart_options.start_date, chart_options.end_date]
          }
        },
        y: {field: 'value', type: 'quantitative', title: unit, axis: {titleFontSize: 18, labelFontSize: 18}},
        color: {field: 'color', type: 'nominal', scale: null},
        size: {field: 'size', type: 'quantitative', scale: null},
        tooltip: [
          {field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate', title: 'time'},
          {field: 'query', type: 'nominal'},
          {field: 'value', type: 'quantitative', title: unit},
          {field: 'video_count', type: 'quantitative'}
        ],
        href: {field: 'video_href', type: 'nominal'}
      },
    }, {
      mark: {
        type: 'line',
        interpolate: 'monotone'
      },
      selection: {
        highlight: {type: 'single', on: 'mouseover', nearest: true, field: 'color'}
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
        size: {
          condition: {selection: {not: 'highlight'}, value: 2},
          value: 4
        },
        opacity: {
          condition: {selection: {not: 'highlight'}, value: 0.5},
          value: 1
        },
        tooltip: null,
        href: null,
      }
    }],
    width: dimensions.width,
    height: dimensions.height,
  };
  vega_opts = {
    loader: {'target': '_blank'},
    actions: false
  };
  vegaEmbed(div_id, vega_spec, vega_opts);
}

function getQueryOptions(chart_options, query_filters) {
  let options = query_filters;
  options.start_date = chart_options.start_date;
  options.end_date = chart_options.end_date;
  options.aggregate = chart_options.aggregate;
  options.window = chart_options.window;
  return options;
}

function parseFilters(filter_str) {
  let filters = {};
  if (filter_str) {
    filter_str.split(';').forEach(line => {
      line = $.trim(line);
      if (line.length > 0) {
        let i = line.indexOf(':');
        if (i == -1) {
          throw Error(`Invalid filter: ${line}`);
        }
        let k = $.trim(line.substr(0, i));
        let v = $.trim(line.substr(i + 1));
        filters[k] = v;
      }
    });
  }
  return filters;
}
