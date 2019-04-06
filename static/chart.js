/* Embed a chart using vega-embed */

function loadChart(div_id, width, height, chart_options, search_results) {
  let agg_search_results = Object.keys(search_results).flatMap(color => {
    let result = search_results[color];
    let data = result.data;
    return Object.keys(data).map(
      t => ({
        time: t, color: color, query: result.query,
        value: data[t].reduce((acc, x) => acc + x[1], 0),
        video_count: data[t].length,
        video_href: `/videos?ids=${JSON.stringify(data[t].map(x => x[0]))}&query=${result.query}&window=${window}`
      })
    );
  })

  let unit = chart_options.window > 0 ? 'seconds' : 'mentions';
  let vega_spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v3.json',
    description: `${chart_options.window  > 0 ? 'Keyword mentions' : 'Topic time'} over time`,
    data: {
      values: agg_search_results
    },
    layer: [{
        selection: {
          highlight: {type: 'single', on: 'mouseover', nearest: 'true', field: 'color'}
        },
        mark: 'line',
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
          tooltip: [
            {field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate', title: 'time'},
            {field: 'query', type: 'nominal'},
            {field: 'value', type: 'quantitative', title: unit},
            {field: 'video_count', type: 'quantitative'}
          ],
          size: {
            condition: {selection: {not: 'highlight'}, value: 2},
            value: 8
          },
          opacity: {
            condition: {selection: {not: 'highlight'}, value: 0.8},
            value: 1
          },
          href: {field: 'video_href', type: 'nominal'}
        },
      }
    ],
    width: width,
    height: height,
    autosize: {
      type: 'fit',
      contains: 'padding'
    }
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
      let i = line.indexOf(':');
      let k = $.trim(line.substr(0, i));
      let v = $.trim(line.substr(i + 1));
      filters[k] = v;
    });
  }
  return filters;
}
