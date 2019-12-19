const CHART_H_SLACK = 50;
const CHART_MIN_WIDTH = 300;

function checkDataVersion(params) {
  if (params.get('dataVersion')) {
    let version_id = params.get('dataVersion');
    if (DATA_VERSION_ID != version_id) {
      return $('<span>').html(`<b>Warning:</b> the requested data version has changed from <b>${version_id}</b> to <b>${DATA_VERSION_ID}</b>. The following chart may have changed.`);
    }
  }
  return null;
}

function getChartDimensions() {
  let width = Math.max($(document).width() - CHART_H_SLACK, CHART_MIN_WIDTH);
  let height = $(document).height() - $('.chart-info').height() - 20;
  return {width: width, height: height};
}


function getDataString(chart_options, lines) {
  return urlSafeBase64Encode(JSON.stringify({
    options: chart_options,
    queries: lines.map(l => ({color: l.color, text: l.query.query}))
  }));
}

function search(editor) {
  var chart_options;
  try {
    chart_options = editor.getChartOptions();
  } catch (e) {
    alertAndThrow(e.message);
  }

  let lines = editor.getRawQueries().map(
    raw_query => {
      var parsed_query;
      try {
        parsed_query = new SearchableQuery(raw_query.text, false);
      } catch (e) {
        alertAndThrow(e.message);
      }
      return {color: raw_query.color, query: parsed_query};
    }
  );

  $('#loadingText').show();
  let indexed_search_results = [];
  function onDone() {
    $('#loadingText').hide();
    indexed_search_results.sort();
    let data_str = getDataString(chart_options, lines);
    new Chart(
      chart_options, indexed_search_results.map(([i, v]) => v),
      getChartDimensions()
    ).load('#chart', {
      show_tooltip: true, show_mean: false,
      href: `//${SERVER_HOST}/?data=` + data_str
    });
  }

  Promise.all(lines.map((line, i) => {
    console.log('Executing query:', line.query);

    var errored = false;
    function onError(xhr, status, error) {
      if (errored) {
        return;
      }
      var msg;
      try {
        msg = `${status}=${JSON.parse(xhr.responseText).message}`;
      } catch {
        msg = `${status}=${error}`;
      }
      alert(`[Query failed. The chart is incomplete.]\n\n${line.query.query}\n\n${msg}`);
      console.log('Failed:', line.query, xhr);
      errored = true;
    }

    return line.query.search(
      chart_options,
      result => indexed_search_results.push([i, [line.color, result]]),
      onError);
  })).then(onDone).catch(onDone);
}

function initializeDynamic(params) {
  $('.chart-info').show();
  $('#editor').show();
  let editor = new Editor('#editor', false);

  var loaded = false;
  if (params.get('data')) {
    try {
      let data = JSON.parse(urlSafeBase64Decode(params.get('data')));
      editor.initChartOptions(data.options);
      data.queries.forEach(query => editor.addRow(query));
      search(editor);
      loaded = true;
    } catch (e) {
      alert('Invalid data in url. Please make sure you copied it correctly. Loading defaults instead.');
      console.log('Unable to load:', e);
    }
  }
  if (!loaded) {
    editor.initChartOptions();
    editor.addRow({text: ''});
    try {
      search(editor);
    } catch (e) {};
  }

  $('.chosen-select').chosen({width: 'auto'});
  $('#searchButton').click(() => {
    $('#chart').empty();
    search(editor)
  });
  $('#resetButton').click(() => {
    $('#chart').empty();
    editor.reset();
  });
}

function getStaticLegend(lines) {
  let legend = $('<div>').append(lines.map(line => {
    var entry;
    if (line.query.alias) {
      entry = [
        $('<code>').text(line.query.alias), '&nbsp;',
        $('<span>').html('&#9432;').attr('title', line.query.query)
      ];
    } else {
      entry = [
        $('<code>').text(line.query.query),
        $.trim(line.query.query).length == 0 ?
          $('<code>').css('color', 'gray').text('all the data') : null
      ];
    }
    return $('<span>').addClass('legend-item').append(
      $('<div>').addClass('legend-color').css('background-color', line.color),
      $('<span>').addClass('legend-text').append(entry)
    );
  }));
  return legend;
}

function initializeStatic(params) {
  $('#loadingText').show();
  let hide_legend = params.get('hideLegend') == 1;
  let hide_tooltip = params.get('hideTooltip') == 1;
  let hide_mean = params.get('showMean') != 1;
  let data_str = params.get('data');
  let data = JSON.parse(urlSafeBase64Decode(data_str));

  let lines = data.queries.map(raw_query => {
    var parsed;
    try {
      parsed_query = new SearchableQuery(raw_query.text, false);
    } catch (e) {
      alertAndThrow(e.message);
    }
    return {color: raw_query.color, query: parsed_query};
  });

  $('#shade').show();
  $('#search').prop('disabled', true);

  let search_results = [];
  function onDone() {
    let chart_info_div = $('.chart-info');
    if (!hide_legend) {
      chart_info_div.append(getStaticLegend(lines));
    }
    chart_info_div.show();
    new Chart(
      data.options, search_results, getChartDimensions(),
    ).load('#chart', {
      show_tooltip: !hide_tooltip, show_mean: !hide_mean,
      href: `//${SERVER_HOST}/?data=` + data_str
    });
    $('#loadingText').hide();
  };

  Promise.all(lines.map(line => {
    console.log('Executing query:', line.query);

    function onError(xhr) {
      var msg;
      try {
        msg = JSON.parse(xhr.responseText).message;
      } catch {
        msg = 'Unknown server error';
      }
      alert(`[Query failed. The chart may be incomplete.]\n\n${msg}`);
      console.log('Failed:', line, xhr);
    }

    return line.query.search(
      data.options,
      result => search_results.push([line.color, result]),
      onError);
  })).then(onDone).catch(onDone);
}

function initialize() {
  let params = (new URL(document.location)).searchParams;
  let chart_info_div = $('.chart-info');
  chart_info_div.prepend(checkDataVersion(params));

  let enable_editor = params.get('edit') == 1;
  if (enable_editor) {
    initializeDynamic(params);
  } else {
    initializeStatic(params);
  }
}

/* Load widget */
initialize();
