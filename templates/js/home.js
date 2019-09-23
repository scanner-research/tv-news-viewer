
const QUERY_BUILDER_HTML = `<div class="query-builder">
  <div style="position:absolute;">
    <button type="button" class="btn btn-outline-danger btn-sm"
            onclick="closeQueryBuilder(this);">&times;</button>
  </div>
  <table>
    <tr>
      <th style="text-align: right;">Include results where:</th>
      <td>
        <i style="color: gray;">Warning! Your current query will be overwritten on changes.</i>
      </td>
    </tr>
    <tr>
      <td type="key-col">the channel is</td>
      <td type="value-col">
        <select class="chosen-select chosen-basic-select" name="{{ parameters.channel }}" data-width="fit">
          <option value="" selected="selected">All - CNN, FOX, or MSNBC</option>
          <option value="CNN">CNN</option>
          <option value="FOX">FOX</option>
          <option value="MSNBC">MSNBC</option>
        </select>
      </td>
    </tr>
    <tr>
      <td type="key-col">the show is</td>
      <td type="value-col">
        <select class="chosen-select chosen-basic-select" name="{{ parameters.show }}" data-width="fit">
          <option value="" selected="selected">All shows</option>
        </select>
      </td>
    </tr>
    <tr>
      <td type="key-col">the hour of day is between</td>
      <td type="value-col"><input type="text" class="form-control no-enter-submit"
          name="{{ parameters.hour }}" value="" placeholder="0-23"></td>
    </tr>
    <tr>
      <td type="key-col">the day of week is</td>
      <td type="value-col"><input type="text" class="form-control no-enter-submit"
          name="{{ parameters.day_of_week }}" value="" placeholder="mon-sun"></td>
    </tr>
    <tr disabled="true">
      <td type="key-col">is in commercial</td>
      <td type="value-col">
        <select class="chosen-select" name="{{ parameters.is_commercial }}"
                data-width="fit">
          <option value="false" selected="selected">false</option>
          <option value="true">true</option>
          <option value="both">both</option>
        </select>
      </td>
    </tr>

    <tr>
      <td colspan="2" type="info-header">
        The following (optional) filter implement text search on time-aligned transcripts.
      </td>
    </tr>
    <tr>
      <td type="key-col">
        the transcript contains
      </td>
      <td type="value-col">
        <input type="text" class="form-control no-enter-submit"
               name="{{ parameters.caption_text }}"
               value="" placeholder="keyword or phrase"
               style="width:400px;">
        <span class="nowrap">
          within
          <input type="number" class="form-control no-enter-submit"
                 name="{{ parameters.caption_window }}"
                 min="0" max="3600" placeholder="{{ default_text_window }}"
                 style="width:70px;"> seconds
        </span>
      </td>
    </tr>

    <tr>
      <td colspan="2" type="info-header">
        The following (optional) on-screen face filters apply to faces with bounding
        box heights &ge; 20% of frame height. <br>
        Note: this will update <code>onscreen.face1="..."</code>.
        You can filter on multiple faces by editing the querybox manually.
      </td>
    </tr>
    <tr>
      <td type="key-col">
        gender
      </td>
      <td type="value-col">
        <select multiple class="chosen-select chosen-single-select"
                data-placeholder="no filter selected"
                name="{{ parameters.onscreen_face }}1:gender" data-width="fit">
          <option value="male">male</option>
          <option value="female">female</option>
        </select>
      </td>
    </tr>
    <tr>
      <td type="key-col">
        is TV host
      </td>
      <td type="value-col">
        <select multiple class="chosen-select chosen-single-select"
                data-placeholder="no filter selected"
                name="{{ parameters.onscreen_face }}1:role" data-width="fit">
          <option value="host">host</option>
          <option value="nonhost">nonhost</option>
        </select>
      </td>
    </tr>
    <tr>
      <td type="key-col">
        a person, by name
      </td>
      <td>
        <select multiple class="chosen-select chosen-single-select"
                data-placeholder="no filter selected"
                name="{{ parameters.onscreen_face }}1:person" data-width="fit">
        </select>
      </td>
    </tr>
    <tr>
      <td type="key-col">
        a person, with attributes
      </td>
      <td type="value-col">
        <select multiple class="chosen-select chosen-basic-select"
                data-placeholder="no attribute filters selected"
                name="{{ parameters.onscreen_face }}1:attr" data-width="fit">
        </select>
      </td>
    </tr>
    <tr>
      <td type="key-col">there are</td>
      <td type="value-col">
        <input type="number" class="form-control no-enter-submit num-faces-input"
               name="{{ parameters.onscreen_numfaces }}"
               min="1" max="25" placeholder="enter a number">
        faces on-screen or any face
        <input type="checkbox"
               name="{{ parameters.onscreen_face }}1:all">
        is on-screen
      </td>
    </tr>
    <tr disabled="true">
      <td type="key-col">*normalize the query</td>
      <td type="value-col">
        <select class="chosen-select" name="normalize" data-width="fit">
          <option value="false" selected="selected">no</option>
          <option value="true">yes</option>
        </select>
      </td>
    </tr>
  </table>
</div>`;

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

const EMBED_DIMS = {width: 1000, height: 400};

function getRandomSample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getColor(start_idx) {
  if (!start_idx) {
    start_idx = 0;
  }
  for (var i = 0; i < DEFAULT_COLORS.length; i++) {
    let color_idx = (i + start_idx) %  DEFAULT_COLORS.length;
    if ($(`#search-table tr[data-color='${DEFAULT_COLORS[color_idx]}']`).length == 0) {
      return DEFAULT_COLORS[color_idx];
    }
  }
  throw Error('All colors used');
}

function setRemoveButtonsState() {
  let state = $('#search-table > tbody > tr').length < 2;
  $('#search-table td').find('button.remove-row-btn').each(function() {
    this.disabled = state;
  });
}

function removeRow(element) {
  $(element).closest('tr').remove();
  $('#add-row-btn').prop('disabled', false);
  setRemoveButtonsState();
}

function getQueryBuilder() {
  let builder = $(QUERY_BUILDER_HTML);
  let show_select = builder.find('select[name="{{ parameters.show }}"]');
  ALL_SHOWS.forEach(x => show_select.append($('<option>').val(x).text(x)));
  let person_select = builder.find(
    'select[name="{{ parameters.onscreen_face }}1:person"]'
  );
  ALL_PEOPLE.forEach(x => person_select.append($('<option>').val(x).text(x)));
  let person_attr_select = builder.find(
    'select[name="{{ parameters.onscreen_face }}1:attr"]'
  );
  ALL_PERSON_ATTRIBUTES.forEach(
    x => person_attr_select.append($('<option>').val(x).text(x))
  );
  return builder;
}

function loadQueryBuilder(element) {
  let search_table_row = $(element).closest('tr');
  let where_box = search_table_row.find('input[name="where"]');

  search_table_row.find('td:last').append(getQueryBuilder());
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

  var channel = current_query.main_args['{{ parameters.channel }}'];
  if (channel) {
    query_builder.find(`[name="{{ parameters.channel }}"]`).val(
      channel.toUpperCase() == 'FOXNEWS' ? 'FOX' : channel);
  }

  setIfDefined('{{ parameters.show }}');
  setIfDefined('{{ parameters.hour }}');
  setIfDefined('{{ parameters.day_of_week }}');
  setIfDefined('{{ parameters.caption_text }}');
  setIfDefined('{{ parameters.caption_window }}');
  setIfDefined('{{ parameters.is_commercial }}');

  let onscreen_face = current_query.main_args['{{ parameters.onscreen_face }}1'];
  if (onscreen_face) {
    let face_params = parseFaceFilterString(onscreen_face);
    if (face_params.all) {
      query_builder.find(
        `[name="{{ parameters.onscreen_face }}1:all"]`
      ).prop('checked', true);
    } else {
      if (face_params.gender) {
        query_builder.find(
          `[name="{{ parameters.onscreen_face }}1:gender"]`
        ).val(face_params.gender);
      }
      if (face_params.role) {
        query_builder.find(
          `[name="{{ parameters.onscreen_face }}1:role"]`
        ).val(face_params.role);
      }
      if (face_params.person) {
        query_builder.find(
          `[name="{{ parameters.onscreen_face }}1:person"]`
        ).val(face_params.person);
      } else if (face_params.attr) {
        query_builder.find(
          `[name="{{ parameters.onscreen_face }}1:attr"]`
        ).val(face_params.attr.split('&').map(x => $.trim(x)));
      }
    }
  }

  let onscreen_numfaces = current_query.main_args['{{ parameters.onscreen_numfaces }}'];
  if (onscreen_numfaces) {
    query_builder.find(
      `[name="{{ parameters.onscreen_numfaces }}"]`
    ).val(onscreen_numfaces);
  }

  if (current_query.normalize_args) {
    query_builder.find('[name="normalize"]').val('true');
  }

  query_builder.find('.no-enter-submit').keypress(e => e.which != 13);

  // Activate select boxes
  query_builder.find('.chosen-single-select').chosen({
    width: 'auto', max_selected_options: 1
  });
  query_builder.find('.chosen-basic-select').chosen({width: 'auto'});

  // Listen for change events
  query_builder.find('input, select').change(function() {
    updateQueryBox(element);
  });

  // Disable where input
  where_box.attr('disabled', true);
}

function closeQueryBuilder(element) {
  let search_table_row = $(element).closest('tr');
  let where_box = search_table_row.find('input[name="where"]');
  if (search_table_row.find('.query-builder').length > 0) {
    search_table_row.find('.query-builder').remove();
    search_table_row.find('.color-box').height('auto');
    where_box.attr('disabled', false);
  }
}

function toggleQueryBuilder(element) {
  let search_table_row = $(element).closest('tr');
  let where_box = search_table_row.find('input[name="where"]');
  if (search_table_row.find('.query-builder').length > 0) {
    closeQueryBuilder(element);
  } else {
    // Close other query builders
    $('.query-builder').each(function() {closeQueryBuilder($(this));});

    // Load new query builder
    loadQueryBuilder(element);
  }
}

function clearChart() {
  $('.query-builder').each(function() {closeQueryBuilder($(this));});
  $('#chart').empty();
  let vgrid_selector = $('#vgrid-area');
  vgrid_selector.empty();
  vgrid_selector.hide()
  $('#embed-area').hide();
}

function clearQueries() {
  if (window.confirm('Warning! This will clear your current query(s).')) {
    $('tr[name="query"]').each(function() {
      if ($(this).index() > 0) {
        removeRow($(this));
      } else {
        $(this).find('input[name="countable"]').val('');
        $(this).find('input[name="where"]').val('');
      }
    });
    window.history.pushState({}, document.title, '/');
    clearChart();
  }
}

function updateQueryBox(element) {
  let search_table_row = $(element).closest('tr[name="query"]');
  let builder = search_table_row.find('.query-builder');
  let filters = [];

  let channel = builder.find('[name="{{ parameters.channel }}"]').val();
  if (channel) {
    filters.push(`{{ parameters.channel }}=${channel}`);
  }
  let show = builder.find('[name="{{ parameters.show }}"]').val();
  if (show) {
    filters.push(`{{ parameters.show }}="${show}"`);
  }
  let hour = builder.find('[name="{{ parameters.hour }}"]').val();
  if (hour) {
    filters.push(`{{ parameters.hour }}=${hour}`);
  }
  let day_of_week = builder.find('[name="{{ parameters.day_of_week }}"]').val();
  if (day_of_week) {
    filters.push(`{{ parameters.day_of_week }}="${day_of_week}"`);
  }

  if ($('#countVar').val() != '{{ countables.mentions.value }}') {
    let caption_text = builder.find('[name="{{ parameters.caption_text }}"]').val();
    if (caption_text) {
      filters.push(`{{ parameters.caption_text }}="${caption_text}"`);
    }
    let caption_window = builder.find('[name="{{ parameters.caption_window }}"]').val();
    if (caption_window) {
      filters.push(`{{ parameters.caption_window }}=${caption_window}`);
    }
  }

  let face_all = builder.find('[name="{{ parameters.onscreen_face }}1:all"]').is(':checked');
  let face_gender = builder.find('[name="{{ parameters.onscreen_face }}1:gender"]').val();
  let face_role = builder.find('[name="{{ parameters.onscreen_face }}1:role"]').val();
  let face_attr = builder.find('[name="{{ parameters.onscreen_face }}1:attr"]').val();
  let face_person = builder.find('[name="{{ parameters.onscreen_face }}1:person"]').val();
  if (face_all) {
    filters.push(`{{ parameters.onscreen_face }}1="all"`);
  } else if (face_person || face_role || face_gender || face_attr) {
    let face_params = [];
    if (face_gender && face_gender.length > 0) {
      face_params.push('gender: ' + face_gender[0]);
    }
    if (face_role && face_role.length > 0) {
      face_params.push('role: ' + face_role[0]);
    }
    if (face_person && face_person.length > 0) {
      face_params.push('person: ' + face_person[0]);
    } else if (face_attr && face_attr.length > 0) {
      face_params.push('attr: ' + face_attr.join(' & '));
    }
    if (face_params.length > 0) {
      filters.push(`{{ parameters.onscreen_face }}1="${face_params.join(', ')}"`);
    }
  }

  let num_faces = builder.find('[name="{{ parameters.onscreen_numfaces }}"]').val();
  if (num_faces) {
    filters.push(`{{ parameters.onscreen_numfaces }}=${num_faces}`);
  }

  let is_commercial = builder.find('[name="{{ parameters.is_commercial }}"]').val();
  if (is_commercial != 'false') {
    filters.push(`{{ parameters.is_commercial }}=${is_commercial}`);
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

  // let where_str = $.trim($(element).val());
  // if (where_str.endsWith(QUERY_KEYWORDS.normalize)) {
  //   if (count_var == '{{ countables.videotime.value }}') {
  //     $(element).val(`${where_str} ${QUERY_KEYWORDS.all}`);
  //   } else {
  //     let no_normlize_where_str = $.trim(
  //       where_str.slice(0, where_str.indexOf(QUERY_KEYWORDS.normalize)));
  //     var norm_query = QUERY_KEYWORDS.all;
  //     if (count_var != '{{ countables.mentions.value }}' && no_normlize_where_str.length > 0) {
  //       norm_query += ` WHERE ${no_normlize_where_str}`;
  //     }
  //     $(element).val(`${where_str} ${norm_query}`);
  //   }
  // }


  function checkFaceFilters(filters) {
    Object.keys(filters).forEach(k => {
      if (k.match(/^{{ parameters.onscreen_face }}\d+/)) {
        face_filter = parseFaceFilterString(filters[k]);
      }
    });
  }

  // Check the query
  let query = `COUNT "${count_var}" WHERE ${$(element).val()}`;
  var err = false;
  try {
    let parsed_query = new SearchableQuery(query, count_var, false);
    checkFaceFilters(parsed_query.main_args);
    if (parsed_query.normalize_args) {
      checkFaceFilters(parsed_query.normalize_args);
    }
    if (parsed_query.subtract_args) {
      checkFaceFilters(parsed_query.subtract_args);
    }
  } catch (e) {
    console.log(e);
    err = true;
  }
  $(element).css('background-color', err ? '#fee7e2' : '');
}

function changeRowColor(element) {
  let query_row = $(element).closest('tr[name="query"]');
  let old_color = query_row.attr('data-color');
  let old_color_idx = DEFAULT_COLORS.indexOf(old_color);
  let new_color = getColor(old_color_idx + 1);
  query_row.find('.color-box').css('background-color', new_color);
  query_row.attr('data-color', new_color);
}

function addRow(query) {
  let color = _.get(query, 'color', getColor());
  let text = _.get(query, 'text', getDefaultQuery());
  let count_var = $('#countVar').val();
  let query_clauses = new SearchableQuery(text, count_var).clauses();

  let new_row = $('<tr name="query">').attr('data-color', color).append(
    $('<td valign="top"/>').append(
      $('<button type="button" class="btn btn-outline-secondary btn-sm remove-row-btn" onclick="removeRow(this);" />').text('-')
    ),
    $('<td valign="top">').append(
      $('<div class="color-box" onclick="changeRowColor(this);" />').css('background-color', color)
    ),
    $('<td class="query-td" />').append(
      $('<div class="input-group" />').append(
        $('<div class="input-group-prepend noselect" onclick="toggleQueryBuilder(this);" />').css('cursor', 'pointer').append(
          $('<span class="input-group-text query-text" name="count-type-prefix" />')),
        $('<div class="countable-only" />').append(
            `<input type="text" class="form-control query-text" name="countable" placeholder="${QUERY_KEYWORDS.all}" />`
          ).val(query_clauses.count),
        $('<div class="input-group-prepend countable-only noselect" />').append(
          $('<span class="input-group-text query-text" />').text('WHERE')),
        $('<input type="text" class="form-control query-text" name="where" placeholder="no filters" onchange="onWhereUpdate(this);"/>').val(query_clauses.where)
      )
    )
  );

  let tbody = $('#search-table > tbody');
  tbody.append(new_row);
  setQueryBoxForMode();

  if (tbody.find('tr').length >= DEFAULT_COLORS.length) {
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
  return `https://{{ host }}/embed?width=${EMBED_DIMS.width}&height=${EMBED_DIMS.height}&data=${data}`;
}

function getChartPath(data) {
  return `/?data=${data}`;
}

function alertAndThrow(msg) {
  alert(msg);
  throw Error(msg);
}

function getDownloadUrl(search_results) {
  let json_obj = Object.values(search_results).map(search_result => {
    let times = new Set(Object.keys(search_result.main));
    if (search_result.normalize) {
      Object.keys(search_result.normalize).forEach(x => times.add(x));
    }
    if (search_result.subtract) {
      Object.keys(search_result.subtract).forEach(x => times.add(x));
    }
    return {
      query: search_result.query,
      unit: search_result.normalize ? 'ratio' : 'seconds',
      data: Array.from(times).map(t => {
        var value = _.get(search_result.main, t, []).reduce((acc, x) => acc + x[1], 0);
        if (search_result.normalize) {
          value /=  _.get(search_result.normalize, t, 0);
        }
        if (search_result.subtract) {
          value /=  _.get(search_result.subtract, t, 0);
        }
        return [t, value];
      })
    };
  });
  let data_blob = new Blob(
    [JSON.stringify(json_obj)],
    {type: "text/json"}
  );
  return URL.createObjectURL(data_blob);
}

var setCopyUrl, setEmbedUrl;

function displaySearchResults(chart_options, lines, search_results) {
  new Chart(chart_options, search_results, {
    width: $("#chart-area").width(), height: EMBED_DIMS.height
  }).load('#chart', '#vgrid-area');

  if (Object.keys(search_results).length == lines.length) {
    // Allow embedding if all queries are ok
    let data_str = getDataString(chart_options, lines);
    let chart_path = getChartPath(data_str);
    let embed_url = getEmbedUrl(data_str);

    setCopyUrl = () => {
      var dummy = document.createElement('input');
      document.body.appendChild(dummy);
      dummy.setAttribute('value', 'https://{{ host }}' + chart_path);
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
      `<a href="#" onclick="setCopyUrl(); return false;">Copy</a> url,
       <a href="#" onclick="setEmbedUrl(); return false;">embed</a> chart, or
       <a href="${getDownloadUrl(search_results)}" download="data.json" type="text/json">download</a> the data.`
    );
    window.history.pushState(null, '', chart_path);
  } else {
    // Allow embedding if all queries are ok
    $('#embed-area p[name="text"]').empty();
    window.history.pushState(null, '', '')
  }
  $('#embed-area').show();
}

function getRawQueries(count_var) {
  let queries = [];
  $('#search-table > tbody > tr').each(function() {
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
  clearChart();

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
  search();
}
$(".chosen-select").chosen({width: 'auto'});
$('#countVar').change(setQueryBoxForMode);
