let params = (new URL(document.location)).searchParams;
let hide_legend = params.get('hideLegend') == 1;
let data_str = params.get('data');
let data = JSON.parse(data_str);
console.log(data);
let width = params.get('width');
let height = params.get('height');

function renderText(lines) {
  // TODO: XSS attack here
  lines.forEach(line => {
    $('#searchTable tbody').append(
      $('<tr />').append(
        $('<td />').append('<div class="color-box" />').css('background-color', line.color),
        $('<td />').append(
          line.query.alias ?
            [$('<code />').text(line.query.alias), '&nbsp;',
              $('<span />').html('&#9432;').attr('title', line.query.query)]
            : [$('<code />').text(line.query.query),
                $.trim(line.query.query).endsWith('WHERE') ?
                  $('<code />').css('color', 'gray').text('all the data') : null]
        )
      ));
  });
  $('#options').append(
    'Showing results from ',
    $('<b />').text(
      new Date(data.options.start_date).toLocaleDateString(undefined, {timeZone: 'UTC'})),
    ' to ',
    $('<b />').text(
      new Date(data.options.end_date).toLocaleDateString(undefined, {timeZone: 'UTC'})),
    ' aggregated by ',
    $('<b />').text(data.options.aggregate)
  );
}

let lines = data.queries.map(raw_query => {
  var parsed;
  try {
    parsed_query = new SearchableQuery(
      raw_query.text, data.options.count, false);
  } catch (e) {
    alertAndThrow(e.message);
  }
  return {color: raw_query.color, query: parsed_query};
});

$('#shade').show();
$('#search').prop('disabled', true);

let search_results = {};
function onDone() {
  new Chart(
    data.options, search_results, {width: width, height: height}
  ).load('#chart', {href: '//{{ host }}/?data=' + encodeURIComponent(data_str)});
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
    result => search_results[line.color] = result,
    onError);
})).then(onDone).catch(onDone);
