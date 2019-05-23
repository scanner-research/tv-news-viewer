function fromDatepickerStr(s) {
  let tokens = s.split('/');
  return `${tokens[2].padStart(2, '0')}-${tokens[0].padStart(2, '0')}-${tokens[1].padStart(2, '0')}`;
}

function toDatepickerStr(s) {
  let tokens = s.split('-');
  return `${tokens[1]}/${tokens[2]}/${tokens[0]}`
}

function getChartOptions() {
  let start_date = fromDatepickerStr($('#startDate').val());
  let end_date = fromDatepickerStr($('#endDate').val());
  if (start_date > end_date) {
    alertAndThrow('Start date cannot exceed end date.');
  }
  return {
    start_date: start_date,
    end_date: end_date,
    count: $('#countVar').val(),
    aggregate: $('#aggregateBy').val()
  }
}

function initChartOptions(chart_options) {
  var start_date = '{{ start_date }}';
  var end_date = '{{ end_date }}';
  if (chart_options) {
    start_date = chart_options.start_date;
    end_date = chart_options.end_date;
    $('#countVar').val(chart_options.count);
    $('#aggregateBy').val(chart_options.aggregate);
  }
  $('#startDate').datepicker({
    format: 'mm/dd/yyyy',
    forceParse: false,
    startDate: toDatepickerStr(start_date),
    endDate: toDatepickerStr(end_date)
  });
  $('#startDate').val(toDatepickerStr(start_date));
  $('#endDate').datepicker({
    format: 'mm/dd/yyyy',
    forceParse: false,
    startDate: toDatepickerStr(start_date),
    endDate: toDatepickerStr(end_date)
  });
  $('#endDate').val(toDatepickerStr(end_date));
}

function setQueryBoxForMode() {
  let count_var = $('#countVar').val();
  var prefix_str, has_countable;
  if (count_var == '{{ countables.mentions.value }}') {
    prefix_str = '{{ countables.mentions.value }} OF';
    has_countable = true;
  } else if (count_var == '{{ countables.facetime.value }}') {
    prefix_str = '{{ countables.facetime.value }} OF';
    has_countable = true;
  } else if (count_var == '{{ countables.videotime.value }}') {
    prefix_str = '{{ countables.videotime.value }} WHERE';
    has_countable = false;
  }
  $('#search-table .countable-only').each(function() {
    if (has_countable) {
      $(this).show();
    } else {
      $(this).hide();
    }
  });
  $('#search-table span[name="count-type-prefix"]').text(`COUNT ${prefix_str}`);
}
$('#countVar').change(setQueryBoxForMode);

function toggleQueryHelp() {
  if ($('#toggle-help').text().includes('show')) {
    $('#query-help').show();
    $('#toggle-help').text('hide help');
  } else {
    $('#query-help').hide();
    $('#toggle-help').text('show help');
  }
}

function hideQueryHelp() {
  if (!$('#toggle-help').text().includes('show')) {
    $('#query-help').hide();
    $('#toggle-help').text('show help');
  }
}

const EMBED_DIMS = {width: 1000, height: 400};

function getRandomSample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getColor() {
  for (var i in DEFAULT_COLORS) {
    if ($(`#search-table tr[data-color='${DEFAULT_COLORS[i]}']`).length == 0) {
      return DEFAULT_COLORS[i];
    }
  }
  throw Error('All colors used');
}

function setRemoveButtonsState() {
  let state = $('#search-table tr[name="query"]').length < 2;
  $('#search-table td').find('button.remove-row-btn').each(function() {
    this.disabled = state;
  });
}

function removeRow(element) {
  $(element).closest('tr[name="query"]').remove();
  $('#add-row-btn').prop('disabled', false);
  setRemoveButtonsState();
}

function toggleQueryBuilder(element) {
  let search_table_row = $(element).closest('tr[name="query"]');
  if (search_table_row.find('.query-builder').length > 0) {
    search_table_row.find('.query-builder').remove();
    search_table_row.find('.color-box').height('auto');
  } else {
    search_table_row.find('td:last').append(QUERY_BUILDER_HTML);

    let where_box = search_table_row.find('input[name="where"]');
    var current_query = new SearchableQuery(
      `${QUERY_KEYWORDS.where} ${where_box.val()}`,
      $('#countVar').val(), true);

    let query_builder = search_table_row.find('.query-builder');
    let setIfDefined = k => {
      let v = current_query.main_args[k];
      if (v) {
        query_builder.find(`[name="${k}"]`).val(v);
      }
    };

    var channel = current_query.main_args['{{ parameters.channel.value }}'];
    if (channel) {
      query_builder.find(`[name="{{ parameters.channel.value }}"]`).val(
        channel.toUpperCase() == 'FOXNEWS' ? 'FOX' : channel);
    }

    setIfDefined('{{ parameters.show.value }}');
    setIfDefined('{{ parameters.hour.value }}');
    setIfDefined('{{ parameters.day_of_week.value }}');
    setIfDefined('{{ parameters.caption_text.value }}');
    setIfDefined('{{ parameters.caption_window.value }}');
    setIfDefined('{{ parameters.is_commercial.value }}');

    let onscreen_face = current_query.main_args['{{ parameters.onscreen_face.value }}1'];
    if (onscreen_face) {
      let face_params = parseFaceFilterString(onscreen_face);
      if (face_params.gender) {
        query_builder.find(
          `[name="{{ parameters.onscreen_face.value }}1:gender"]`
        ).val(face_params.gender);
      }
      if (face_params.role) {
        query_builder.find(
          `[name="{{ parameters.onscreen_face.value }}1:role"]`
        ).val(face_params.role);
      }
      if (face_params.person) {
        query_builder.find(
          `[name="{{ parameters.onscreen_face.value }}1:person"]`
        ).val(face_params.person);
      }
    }

    if (current_query.normalize_args) {
      query_builder.find('[name="normalize"]').val('true');
    }

    $('.no-enter-submit').keypress(e => e.which != 13);

    // Set the color-box to be the height of the query box
    search_table_row.find('.color-box').height(
      search_table_row.find('td').height()
    );

    // Activate select boxes
    $(".chosen-select").chosen({width: 'auto'});
  }
}

function clearQueries() {
  $('tr[name="query"]').each(function() {
    $(this).find('input[name="countable"]').val('');
    $(this).find('input[name="where"]').val('');
  });
  window.history.pushState({}, document.title, '/');
}

function populateQueryBox(element) {
  let search_table_row = $(element).closest('tr[name="query"]');
  let builder = search_table_row.find('.query-builder');
  let filters = [];

  let channel = builder.find('[name="{{ parameters.channel.value }}"]').val();
  if (channel) {
    filters.push(`{{ parameters.channel.value }}=${channel}`);
  }
  let show = builder.find('[name="{{ parameters.show.value }}"]').val();
  if (show) {
    filters.push(`{{ parameters.show.value }}="${show}"`);
  }
  let hour = builder.find('[name="{{ parameters.hour.value }}"]').val();
  if (hour) {
    filters.push(`{{ parameters.hour.value }}=${hour}`);
  }
  let day_of_week = builder.find('[name="{{ parameters.day_of_week.value }}"]').val();
  if (day_of_week) {
    filters.push(`{{ parameters.day_of_week.value }}="${day_of_week}"`);
  }

  if ($('#countVar').val() != '{{ countables.mentions.value }}') {
    let caption_text = builder.find('[name="{{ parameters.caption_text.value }}"]').val();
    if (caption_text) {
      filters.push(`{{ parameters.caption_text.value }}="${caption_text}"`);
    }
    let caption_window = builder.find('[name="{{ parameters.caption_window.value }}"]').val();
    if (caption_window) {
      filters.push(`{{ parameters.caption_window.value }}=${caption_window}`);
    }
  }

  let face_gender = builder.find('[name="{{ parameters.onscreen_face.value }}1:gender"]').val();
  let face_role = builder.find('[name="{{ parameters.onscreen_face.value }}1:role"]').val();
  let face_person = builder.find('[name="{{ parameters.onscreen_face.value }}1:person"]').val();
  if (face_person || face_role || face_gender) {
    let face_params = [];
    if (face_person) {
      face_params.push('person:' + face_person);
    }
    if (face_gender) {
      face_params.push('gender:' + face_gender);
    }
    if (face_role) {
      face_params.push('role:' + face_role);
    }
    filters.push(`{{ parameters.onscreen_face.value }}1="${face_params.join(',')}"`);
  }
  let is_commercial = builder.find('[name="{{ parameters.is_commercial.value }}"]').val();
  if (is_commercial != 'false') {
    filters.push(`{{ parameters.is_commercial.value }}=${is_commercial}`);
  }

  let normalize = builder.find('[name="normalize"]').val() == 'true';

  // Construct the new query
  var new_where = filters.length > 0 ? filters.join(` ${QUERY_KEYWORDS.and} `) : '';
  if (normalize) {
    new_where += ` ${QUERY_KEYWORDS.normalize}`;
  }
  let where_input = search_table_row.find('input[name="where"]');
  where_input.val(new_where);
  onWhereUpdate(where_input);
  toggleQueryBuilder(element);
}

function getDefaultQuery() {
  if ($('#search-table tr[name="query"]').length > 0) {
    return 'WHERE ' + $('#search-table input[type="text"][name="where"]:last').val();
  } else {
    let count_var = $('#countVar').val();
    if (count_var == '{{ countables.mentions.value }}') {
      return DEFAULT_MENTIONS_QUERY;
    } else if (count_var == '{{ countables.facetime.value }}') {
      return DEFAULT_FACETIME_QUERY;
    } else if (count_var == '{{ countables.videotime.value }}') {
      return DEFAULT_VIDEOTIME_QUERY;
    }
  }
}

function onWhereUpdate(element) {
  // Rewrite query with default normalization if necessary
  let count_var = $('#countVar').val();
  let where_str = $.trim($(element).val());
  if (where_str.endsWith(QUERY_KEYWORDS.normalize)) {
    if (count_var == '{{ countables.videotime.value }}') {
      $(element).val(`${where_str} (${QUERY_KEYWORDS.all})`);
    } else {
      let no_normlize_where_str = $.trim(
        where_str.slice(0, where_str.indexOf(QUERY_KEYWORDS.normalize)));
      var norm_query = QUERY_KEYWORDS.all;
      if (count_var != '{{ countables.mentions.value }}' && no_normlize_where_str.length > 0) {
        norm_query += ` WHERE ${no_normlize_where_str}`;
      }
      $(element).val(`${where_str} (${norm_query})`);
    }
  }

  // Check the query
  let query = `COUNT "${count_var}" WHERE ${$(element).val()}`;
  var err = false;
  try {
    new SearchableQuery(query, count_var, false);
  } catch (e) {
    console.log(e);
    err = true;
  }
  $(element).css('background-color', err ? '#fee7e2' : '');
}

function addRow(query) {
  let color = _.get(query, 'color', getColor());
  let text = _.get(query, 'text', getDefaultQuery());
  let count_var = $('#countVar').val();
  let query_clauses = new SearchableQuery(text, count_var).clauses();

  let new_row = $('<tr name="query">');
  new_row.attr('data-color', color);
  new_row.append('<td><button type="button" class="btn btn-outline-secondary btn-sm remove-row-btn" onclick="removeRow(this);">-</button></td>')
  let color_box = $('<div class="color-box" onloadedmetadata=""onclick="toggleQueryBuilder(this);">');
  color_box.css('background-color', color);
  new_row.append($('<td>').append(color_box));
  new_row.append(`
    <td class="query-td">
      <div class="input-group">
        <div class="input-group-prepend">
          <span class="input-group-text" name="count-type-prefix"></span>
        </div>
        <div class="countable-only">
          <input type="text" class="form-control" name="countable"
                 placeholder="${QUERY_KEYWORDS.all}">
        </div>
        <div class="input-group-prepend countable-only">
          <span class="input-group-text">WHERE</span>
        </div>
        <input type="text" class="form-control" name="where" placeholder="no filters ..."
               onchange="onWhereUpdate(this);">
      </div>
    </td>`);
  new_row.find('input[name="where"]').val(query_clauses.where);
  new_row.find('input[name="countable"]').val(query_clauses.count);

  $('#search-table > tbody > tr').eq(
    $('#search-table tr[name="query"]').length
  ).after(new_row);
  setQueryBoxForMode();
  if ($('#search-table tr[name="query"]').length >= DEFAULT_COLORS.length + 1) {
    $('#add-row-btn').prop('disabled', true);
  }
  setRemoveButtonsState();

  onWhereUpdate(new_row.find('input[name="where"]'));
}
$('#add-row-btn').click(() => {addRow();});

function getDataString(chart_options, lines) {
  return encodeURIComponent(JSON.stringify({
    options: chart_options,
    queries: lines.map(l => ({color: l.color, text: l.query.query}))
  }));
}

function getEmbedUrl(data) {
  return `http://{{ host }}/embed?width=${EMBED_DIMS.width}&height=${EMBED_DIMS.height}&data=${data}`;
}

function getChartPath(data) {
  return `/?data=${data}`;
}

function alertAndThrow(msg) {
  alert(msg);
  throw Error(msg);
}

var setShareUrl, setEmbedUrl;

function displaySearchResults(chart_options, lines, search_results) {
  new Chart(chart_options, search_results, {
    width: $("#chart-area").width(), height: EMBED_DIMS.height
  }).load('#chart', '#vgrid');

  if (Object.keys(search_results).length == lines.length) {
    // Allow embedding if all queries are ok
    let data_str = getDataString(chart_options, lines);
    let chart_path = getChartPath(data_str);
    let embed_url = getEmbedUrl(data_str);

    setShareUrl = () => {
      var dummy = document.createElement('input');
      document.body.appendChild(dummy);
      dummy.setAttribute('value', 'http://{{ host }}' + chart_path);
      dummy.select();
      document.execCommand("copy");
      document.body.removeChild(dummy);
      alert('Copied link to clipboard!');
    };

    setEmbedUrl = () => {
      let x = $('#embed-area textarea[name="embed"]');
      x.val(`<iframe src="${embed_url}"></iframe>`);
      x.toggle();
    };

    $('#embed-area p[name="text"]').html(
      `<a href="#" onclick="setShareUrl(); return false;">Share</a> or
       <a href="#" onclick="setEmbedUrl(); return false;">embed</a> chart.`
    );
    window.history.pushState(null, '', chart_path);
  } else {
    // Allow embedding if all queries are ok
    $('#embed-area p[name="text"]').empty();
    window.history.pushState(null, '', '')
  }
}

function getRawQueries(count_var) {
  let queries = [];
  $('#search-table tr[name="query"]').each(function() {
    if ($(this).attr('name')) {
      let where_str = $.trim($(this).find('input[name="where"]').val());
      var text;
      if (count_var != '{{ countables.videotime.value }}') {
        let count_str = $.trim($(this).find('input[name="countable"]').val());
        text = `COUNT "${count_var}" OF "${count_str ? count_str : QUERY_KEYWORDS.all}" WHERE ${where_str}`;
      } else {
        text = `COUNT "${count_var}" WHERE ${where_str}`;
      }
      queries.push({color: $(this).attr('data-color'), text: text});
    }
  });
  return queries;
}

function search() {
  $('.query-builder').each(function() {populateQueryBox($(this));});
  $('#vgrid').empty();
  hideQueryHelp();

  let chart_options = getChartOptions();
  let lines = getRawQueries(chart_options.count).map(
    raw_query => {
      var parsed_query;
      try {
        parsed_query = new SearchableQuery(
          raw_query.text, chart_options.count, false);
      } catch (e) {
        alertAndThrow(e.message);
      }
      return {color: raw_query.color, query: parsed_query};
    });

  $('#shade').show();
  let search_results = {};
  function onDone() {
    $('#shade').hide();
    displaySearchResults(chart_options, lines, search_results);
  }

  Promise.all(lines.map(line => {
    console.log('Executing query:', line.query);

    function onError(xhr) {
      var msg;
      try {
        msg = JSON.parse(xhr.responseText).message;
      } catch {
        msg = 'Unknown server error';
      }
      alert(`[Query failed] ${line.query.query}\n\n${msg}\n\nThe chart may be incomplete.`);

      console.log('Failed:', line.query, xhr);
    }

    return line.query.search(
      chart_options,
      result => search_results[line.color] = result,
      onError);
  })).then(onDone).catch(onDone);
}

/* Load initial plot */
$(".chosen-select").chosen({width: 'auto'});
let params = (new URL(document.location)).searchParams;
if (params.get('data')) {
  let data = JSON.parse(decodeURIComponent(params.get('data')));
  try {
    initChartOptions(data.options);
    data.queries.forEach(query => addRow(query));
    search();
  } catch (e) {
    alert('Invalid data in url. Unable to load.');
    console.log('Unable to load:', e);
  }
} else {
  initChartOptions();
  addRow({text: 'WHERE onscreen.face1="person: hillary clinton"'});
  addRow({text: 'WHERE onscreen.face1="person: donald trump"'});
}
