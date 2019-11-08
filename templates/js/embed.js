const DATA_VERSION_ID = {% if data_version is not none %}"{{ data_version }}"{% else %}null{% endif %};

let params = (new URL(document.location)).searchParams;
let hide_legend = params.get('hideLegend') == 1;
let data_str = params.get('data');
let data = JSON.parse(data_str);
let width = params.get('width');
let height = params.get('height');

function renderText(lines) {
  if (params.get('dataVersion')) {
    let version_id = decodeURIComponent(params.get('dataVersion'));
    if (DATA_VERSION_ID != version_id) {
      $('#warning').append(
        $('<span>').html(`<b>Warning:</b> the requested data version has changed from <b>${version_id}</b> to <b>${DATA_VERSION_ID}</b>. The following chart may have changed.`)
      ).show();
    }
  }

  $('#options').append(
    'Showing results from ',
    $('<b>').text(
      new Date(data.options.start_date).toLocaleDateString(undefined, {timeZone: 'UTC'})),
    ' to ',
    $('<b>').text(
      new Date(data.options.end_date).toLocaleDateString(undefined, {timeZone: 'UTC'})),
    ' aggregated by ',
    $('<b>').text(data.options.aggregate)
  );

  // TODO: XSS attack here
  lines.forEach(line => {
    $('#searchTable tbody').append(
      $('<tr>').append(
        $('<td>').append(
          $('<div>').addClass('color-box').css('background-color', line.color)
        ),
        $('<td>').append(
          line.query.alias ?
            [$('<code>').text(line.query.alias), '&nbsp;',
              $('<span>').html('&#9432;').attr('title', line.query.query)]
            : [$('<code>').text(line.query.query),
                $.trim(line.query.query).endsWith('WHERE') ?
                  $('<code>').css('color', 'gray').text('all the data') : null]
        )
      ));
  });
}

let lines = data.queries.map(raw_query => {
  var parsed;
  try {
    parsed_query = new SearchableQuery(
      raw_query.text, false);
  } catch (e) {
    alertAndThrow(e.message);
  }
  return {color: raw_query.color, query: parsed_query};
});

$('#shade').show();
$('#search').prop('disabled', true);

let search_results = [];
function onDone() {
  new Chart(
    data.options, search_results, {width: width, height: height}
  ).load('#chart', {
    show_tooltip: true,
    href: '//{{ host }}/?data=' + encodeURIComponent(data_str)
  });
  if (!hide_legend) {
    renderText(lines);
  }
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
