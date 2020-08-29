const DEFAULT_CHART_DIMS = {width: '100%', height: 400};
const EMBED_MACRO_MESSAGE = 'Feature disabled. Embedding with macros is not allowed.';

const MINOR_EDIT_REDRAW_DELAY = 500;

function clearChart() {
  $('#chart').empty();
  let vgrid_selector = $('#vgridArea');
  vgrid_selector.empty();
  vgrid_selector.hide()
  $('#embedArea').hide();
}

function getDataString(chart_options, lines, macros) {
  chart_options = Object.assign({}, chart_options);
  if (chart_options.start_date == DEFAULT_START_DATE) {
    delete chart_options.start_date;
  }
  if (chart_options.end_date == DEFAULT_END_DATE) {
    delete chart_options.end_date;
  }
  let data = {
    options: chart_options,
    queries: lines.map(l => ({color: l.color, text: l.query.query}))
  };
  if (macros) {
    data.macros = macros;
  }
  return urlSafeBase64Encode(JSON.stringify(data));
}

function getEmbedUrl(data) {
  var prefix = `https://${SERVER_HOST}/embed?`;
  if (DATA_VERSION_ID) {
    prefix += 'dataVersion=' + encodeURIComponent(DATA_VERSION_ID) + '&';
  }
  return prefix + `data=${data}`;
}

function getChartPath(data) {
  var prefix = '/?';
  if (DATA_VERSION_ID) {
    prefix += 'dataVersion=' + encodeURIComponent(DATA_VERSION_ID) + '&';
  }
  return prefix + 'data=' + data;
}

function getDownloadUrl(search_results) {
  let json_data = _.flatMap(search_results, ([color, result]) => {
    let times = new Set(Object.keys(result.main));
    if (result.normalize) {
      Object.keys(result.normalize).forEach(x => times.add(x));
    }
    if (result.subtract) {
      Object.keys(result.subtract).forEach(x => times.add(x));
    }
    var query_text = $.trim(result.query);
    let unit = result.normalize ? 'ratio' : 'seconds';
    return Array.from(times).map(t => {
      var value = _.get(result.main, t, []).reduce((acc, x) => acc + x[1], 0);
      if (result.normalize) {
        value /=  _.get(result.normalize, t, 0);
      } else if (result.subtract) {
        value -=  _.get(result.subtract, t, 0);
      }
      return [query_text, t, value.toFixed(3).replace(/\.0+$/, ''), unit];
    });
  });
  let schema = ['Query', 'Time', 'Value', 'Unit'];
  let data_blob = new Blob(
    [Papa.unparse([schema].concat(json_data))], {type: "text/csv"}
  );
  return URL.createObjectURL(data_blob);
}

var minimalMode, chartHeight, enableMacros, showStats;
var setCopyUrl, setEmbedUrl;

function displaySearchResults(
  chart_options, lines, search_results, push_state
) {
  // Kind of hacky, but it works
  var macros = null;
  if (lines[0].query.macros && Object.keys(lines[0].query.macros).length > 0) {
    macros = lines[0].query.macros;
  }

  let chart = new Chart(
    chart_options, search_results, {
      width: $("#chartArea").width(), height: chartHeight
    }, macros
  );
  chart.load('#chart', {
    video_div: '#vgridArea', show_tooltip: !minimalMode,
    show_stats: showStats, vega_actions: minimalMode
  });

  if (search_results.length == lines.length) {
    // Allow embedding if all queries are ok
    let data_str = getDataString(chart_options, lines, macros);
    let chart_path = getChartPath(data_str);
    let embed_str = !macros ?
      `<iframe src="${getEmbedUrl(data_str)}"></iframe>` :
      EMBED_MACRO_MESSAGE;

    setCopyUrl = () => {
      var dummy = document.createElement('input');
      document.body.appendChild(dummy);
      dummy.setAttribute('value', 'https://' + SERVER_HOST + chart_path);
      dummy.select();
      document.execCommand("copy");
      document.body.removeChild(dummy);
      alert('Copied link to clipboard!');
      return false;
    };

    setEmbedArea = () => {
      let x = $('#embedArea textarea[name="embed"]');
      x.val(embed_str);
      x.toggle();
      return false;
    };

    let time_str = new Date().toISOString().slice(0, 19).replaceAll(/\-|T|:/, '');

    saveImage = () => {
      chart.renderPNG('#dummyChartDiv', function (img_data) {
        var tmp = document.createElement('a');
        tmp.href = img_data;
        tmp.download = `tvnews_${time_str}.png`;
        tmp.click();
      });
    }

    downloadData = () => {
      var tmp = document.createElement('a');
      tmp.href =  getDownloadUrl(search_results);
      tmp.download = `tvnews_${time_str}.csv`;
      tmp.click();
    }

    $('#embedArea p[name="text"]').empty().append(
      $('<a>').addClass('copy-a').attr('href', 'javascript:void(0)').click(setCopyUrl).text('Copy'),
      ' url, ',
      $('<a>').addClass('embed-a').attr('href', 'javascript:void(0)').click(setEmbedArea).text('embed'),
      ' chart, ',
      $('<a>').addClass('save-img-a').attr('href', 'javascript:void(0)').click(saveImage).text('save'),
      ' image, or ',
      $('<a>').addClass('download-a').attr('href', 'javascript:void(0)').click(downloadData).text('download'),
      ' the data.'
    );
    $('#embedArea').show();
    if (push_state && !minimalMode) {
      window.history.pushState(null, '', chart_path);
    }
  } else {
    $('#embedArea p[name="text"]').empty();
    $('#embedArea').hide();
    if (push_state && !minimalMode) {
      window.history.pushState(null, '', '');
    }
  }
}

function search(editor, push_state) {
  clearChart();
  editor.closeQueryBuilders();

  var chart_options, lines;
  try {
    chart_options = editor.getChartOptions();
    lines = editor.getLines();
  } catch (e) {
    alertAndThrow(e.message);
  }


  var is_done = false;
  let indexed_search_results = [];
  function onDone() {
    is_done = true;
    $('#shade').hide();
    indexed_search_results.sort();
    displaySearchResults(
      chart_options, lines, indexed_search_results.map(([i, v]) => v),
      push_state);
  }

  // Give the query 100ms before setting the loading screen
  window.setTimeout(function() {
    if (!is_done) {
      $('#shade').show();
    }
  }, 100);

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

function addHighlight(trigger, targets) {
  let affected = [trigger].concat(targets).join(', ');
  $(trigger).mouseenter(function() {
    $(affected).addClass('highlight');
  });
  $(trigger).mouseleave(function() {
    $(affected).removeClass('highlight');
  });
}

function addWarning(message) {
  $('#warningArea').append(
    $('<div>').addClass('warning').text(message)
  ).show();
}

function parseDate(s) {
  let m = s.match(/(\d{1,4})-(\d{1,2})-(\d{2})/);
  if (!m) {
    throw Error(`Invalid date: ${s}. Please use YYYY/MM/DD format.`);
  }
  return new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])));
}

function lastNMonths(n) {
  new_date = parseDate(DEFAULT_END_DATE);
  new_date.setUTCMonth(new_date.getUTCMonth() - n);
  month = `${new_date.getUTCMonth() + 1}`.padStart(2, '0');
  day = `${new_date.getUTCDate()}`.padStart(2, '0');
  return `${new_date.getUTCFullYear()}-${month}-${day}`;
}

function lastNYears(n) {
  end_date = parseDate(DEFAULT_END_DATE);
  month = `${end_date.getUTCMonth() + 1}`.padStart(2, '0');
  return `${end_date.getUTCFullYear() - n}-${month}-01`;
}

function setDateShortcuts(editor, date_option) {
  switch(date_option) {
    case '1m':
      editor.setStartDate(lastNMonths(1));
      editor.setAggregateBy('day');
      break;
    case '3m':
      editor.setStartDate(lastNMonths(3));
      editor.setAggregateBy('day');
      break;
    case '6m':
      editor.setStartDate(lastNMonths(6));
      editor.setAggregateBy('day');
      break;
    case '1y':
      editor.setStartDate(lastNMonths(12));
      editor.setAggregateBy('day');
      break;
    case '2y':
      editor.setStartDate(lastNYears(2));
      editor.setAggregateBy('month');
      break;
    case '5y':
      editor.setStartDate(lastNYears(5));
      editor.setAggregateBy('month');
      break;
    case 'all':
      editor.setStartDate(DEFAULT_START_DATE);
      editor.setAggregateBy('month');
    default:
      console.log(`Unknown: ${date_option}`)
  }
  $('.search-btn').click();
}

function initialize() {
  let params = (new URL(document.location)).searchParams;
  minimalMode = params.get('minimal') == 1;
  chartHeight = params.get('chartHeight') ? parseInt(params.get('chartHeight')) : DEFAULT_CHART_DIMS.height;
  showStats = params.get('showStats') == 1;
  enableMacros = params.get('macro') == 1;
  if (enableMacros) {
    $('.macro-div').show();
  }

  if (params.get('dataVersion')) {
    let version_id = params.get('dataVersion');
    if (DATA_VERSION_ID != version_id) {
      addWarning(`The data version has changed from ${version_id} to ${DATA_VERSION_ID}. Remove "dataVersion=${encodeURIComponent(version_id)}" from the shared link/URL to disable this warning.`);
    }
  }

  var last_minor_edit_time = null;
  function minorEditCallback() {
    last_minor_edit_time = (new Date()).getTime();
    setTimeout(function() {
      if ((new Date()).getTime() - last_minor_edit_time >= MINOR_EDIT_REDRAW_DELAY) {
        search(editor, true);
      }
    }, MINOR_EDIT_REDRAW_DELAY);
  }

  let editor = new Editor('#editor', {
    enable_query_builder: true, enable_query_macros: true,
    color_change_callback: minorEditCallback,
    remove_line_callback: minorEditCallback
  });

  $('.chosen-select').chosen({width: 'auto'});
  $('.search-btn').click(function() {
    search(editor, true);
  });

  $('#quickDateDropdown a').each(function(x) {
    let value = $(this).attr('value');
    this.onclick = function() { setDateShortcuts(editor, value); };
  });

  try {
    $('#exampleQueryDropdown .dropdown-menu').append(EXAMPLE_QUERIES.map(
      x => $('<a>').addClass('dropdown-item').attr('href', x[1]).text(x[0])));
  } catch (e) {
    console.log('Unable to load example queries');
    $('#exampleQueryDropdown').hide();
  }

  addHighlight('#plusMinusHover', ['.remove-row-btn', '.add-row-btn']);
  addHighlight('#dropdownEditorHover', ['.toggle-query-builder-btn']);
  addHighlight('#chartAreaHover', ['#chart']);
  addHighlight('#searchButtonHover', ['.search-btn']);

  $('#infoToggle').click(function() {
    let info_text = $('#infoSpanText');
    info_text.toggle();
    $(this).text(info_text.is(':visible') ? 'hide help' : 'help');
  });

  var loaded = false;
  let data_str = params.get('data');
  if (data_str) {
    try {
      let data = JSON.parse(urlSafeBase64Decode(data_str));
      editor.initChartOptions(data.options);
      if (data.macros) {
        enableMacros |= true;
        editor.setMacros(data.macros);
      }
      data.queries.forEach(query => editor.addRow(query));
      search(editor, false);
      loaded = true;
    } catch (e) {
      alert('Invalid data in url. Please make sure you copied it correctly. Loading defaults instead.');
      console.log('Unable to load:', e);
    }
  }

  if (!loaded) {
    // Try to load the default queries, fallback to an empty one
    editor.initChartOptions();
    if (params.get('blank') != 1 && DEFAULT_QUERIES.every(isValidQuery)) {
      DEFAULT_QUERIES.forEach(x => editor.addRow({text: x}));
    } else {
      editor.addRow({text: ''});
    }
    try {
      search(editor, false);
    } catch (e) {
      editor.reset();
      // Clear the url
      window.history.pushState({}, document.title, '/');
    };
  }

  $('select[name="aggregateBy"], input[name="startDate"], input[name="endDate"]').change(function(e) {
    if (e.isTrigger) {
      var options_valid = false;
      try {
        editor.getChartOptions();
        options_valid = true;
      } catch(e) {}
      if (options_valid) {
        search(editor, true);
      }
    }
  });

  // Force reload the page on back or forward button press
  window.onpopstate = function(e) {
    window.location.reload();
  }
}

/* Load widget */
initialize();
