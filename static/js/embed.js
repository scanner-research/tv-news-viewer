const CHART_H_SLACK = 50;
const CHART_MIN_WIDTH = 300;
let params = (new URL(document.location)).searchParams;
let hide_legend = params.get('hideLegend') == 1;
let hide_tooltip = params.get('hideTooltip') == 1;
let hide_mean = params.get('hideMean') == 1;
let data_str = params.get('data');
let data = JSON.parse(data_str);

function checkDataVersion() {
  let chart_info_div = $('#chartInfo');
  if (params.get('dataVersion')) {
    let version_id = decodeURIComponent(params.get('dataVersion'));
    if (DATA_VERSION_ID != version_id) {
      chart_info_div.append(
        $('<span>').html(`<b>Warning:</b> the requested data version has changed from <b>${version_id}</b> to <b>${DATA_VERSION_ID}</b>. The following chart may have changed.`)
      ).show();
    }
  }
}

function renderChartInfo(lines) {
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
  $('#chartInfo').append(legend);
}

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
  checkDataVersion();
  if (!hide_legend) {
    renderChartInfo(lines);
  }

  let width = $(document).width();
  let height = $(document).height() - $('#chartInfo').height() - 20;
  new Chart(
    data.options, search_results,
    {width: Math.max(width - CHART_H_SLACK, CHART_MIN_WIDTH), height: height}
  ).load('#chart', {
    show_tooltip: !hide_tooltip, show_mean: !hide_mean,
    href: `//${SERVER_HOST}/?data=` + encodeURIComponent(data_str)
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
