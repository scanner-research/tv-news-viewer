
const QUERY_BUILDER_HTML = `<div class="query-builder">
  <table>
    <tr>
      <th style="text-align: right;">Find video segments where:</th>
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
          name="{{ parameters.hour }}" value="" placeholder="0-23"> (in Eastern Time)
      </td>
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
        Use the following filters to perform <b>text search of the transcripts</b>.
      </td>
    </tr>
    <tr>
      <td type="key-col">
        the transcript contains
      </td>
      <td type="value-col">
        <textarea type="text" class="form-control no-enter-submit"
               name="{{ parameters.caption_text }}"
               value="" placeholder="keyword or phrase"
               rows="1"></textarea>
      </td>
    </tr>
    <tr>
      <td type="key-col">
        within
      </td>
      <td type="value-col">
        <input type="number" class="form-control"
               name="{{ parameters.caption_window }}"
               min="0" max="3600" placeholder="{{ default_text_window }}"
               style="width:70px;">
        seconds of the word or phrase being said
      </td>
    </tr>

    <tr>
      <td colspan="2" type="info-header">
        Use the following filters to find <b>on-screen faces</b>. <br>
        Note: this will update <code>onscreen.face1="..."</code>.
        To filter on multiple faces, edit the search box manually.
      </td>
    </tr>
    <tr>
      <td type="key-col">
        the screen has a face that:
      </td>
      <td type="value-col"></td>
    </tr>
    <tr>
      <td type="key-col">
        is any face
      </td>
      <td>
        <input type="checkbox" name="face1:all">
      </td>
    </tr>
    <tr class="toggle-face1">
      <td type="key-col">
        is gender
      </td>
      <td type="value-col">
        <select multiple class="chosen-select chosen-single-select"
                data-placeholder="no gender selected"
                name="face1:gender" data-width="fit">
          <option value="male">male</option>
          <option value="female">female</option>
        </select>
      </td>
    </tr>
    <tr class="toggle-face1">
      <td type="key-col">
        is a TV host
      </td>
      <td type="value-col">
        <select multiple class="chosen-select chosen-single-select"
                data-placeholder="no role selected"
                name="face1:role" data-width="fit">
          <option value="host">host</option>
          <option value="nonhost">nonhost</option>
        </select>
      </td>
    </tr>
    <tr class="toggle-face1">
      <td type="key-col">
        is a person
      </td>
      <td>
        <select class="chosen-select chosen-single-select"
                name="face1:person-or-tag">
          <option selected value="person">with name</option>
          <option value="tag">with tag</option>
        </select>
        <span>
          <select multiple class="chosen-select chosen-single-select"
                  data-placeholder="no names selected"
                  name="face1:person" data-width="fit">
          </select>
        </span>
        <span style="display: none;">
          <select multiple class="chosen-select chosen-basic-select"
                  data-placeholder="no tags selected"
                  name="face1:tag" data-width="fit">
          </select>
        </span>
      </td>
    </tr>

    <tr>
      <td colspan="2" type="info-header">
        Some other useful filters.
      </td>
    </tr>
    <tr>
      <td type="key-col">
        there are
      </td>
      <td type="value-col">
        <input type="number" class="form-control no-enter-submit num-faces-input"
               name="{{ parameters.onscreen_numfaces }}"
               min="1" max="25" placeholder="enter a number">
        faces on-screen
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
  var aggregate_by = '{{ default_agg_by }}';
  if (chart_options) {
    start_date = chart_options.start_date;
    end_date = chart_options.end_date;
    aggregate_by = chart_options.aggregate;
    $('#countVar').val(chart_options.count);
  }
  $('#aggregateBy').val(aggregate_by);
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
  let search_table_row = $(element).closest('tr');
  closeQueryBuilder(search_table_row);
  search_table_row.remove();
  $('#search-table .add-row-btn').prop('disabled', false);
  setRemoveButtonsState();
}

var _QUERY_BUILDER = null;
function getQueryBuilder() {
  var builder = null;
  if (_QUERY_BUILDER) {
    builder = _QUERY_BUILDER;
  } else {
    builder = $(QUERY_BUILDER_HTML);
    let show_select = builder.find('select[name="{{ parameters.show }}"]');
    ALL_SHOWS.forEach(x => show_select.append($('<option>').val(x).text(x)));
    let person_select = builder.find(
      'select[name="face1:person"]'
    );
    ALL_PEOPLE.forEach(x => person_select.append($('<option>').val(x).text(x)));
    let person_tag_select = builder.find(
      'select[name="face1:tag"]'
    );
    ALL_PERSON_TAGS.forEach(
      x => person_tag_select.append($('<option>').val(x).text(x))
    );
    _QUERY_BUILDER = builder;
  }

  // Reset the builder defaults
  builder.find('[name="{{ parameters.channel }}"]').val('');
  builder.find('[name="{{ parameters.show }}"]').val('');
  builder.find('[name="{{ parameters.hour }}"]').val('');
  builder.find('[name="{{ parameters.day_of_week }}"]').val('');
  builder.find('[name="{{ parameters.is_commercial }}"]').val('false');
  builder.find('[name="{{ parameters.caption_text }}"]').val('');
  builder.find('[name="{{ parameters.caption_window }}"]').val('{{ default_text_window }}');
  builder.find('[name="face1:gender"]').val(null);
  builder.find('[name="face1:role"]').val(null);
  builder.find('[name="face1:person-or-tag"]').val('person');
  builder.find('[name="face1:person"]').val(null).parent().show();
  builder.find('[name="face1:tag"]').val(null).parent().hide();
  builder.find('[name="face1:all"]').prop('checked', false);
  builder.find('[name="{{ parameters.onscreen_numfaces }}"]').val('');
  builder.find('[name="normalize"]').prop('checked', false);
  builder.find('.toggle-face1').show();
  return builder;
}

function loadQueryBuilder(search_table_row) {
  let where_box = search_table_row.find('input[name="where"]');

  search_table_row.find('.query-td').append(getQueryBuilder());
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
    query_builder.find(`select[name="{{ parameters.channel }}"]`).val(
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
      query_builder.find(`input[name="face1:all"]`).prop('checked', true);
      query_builder.find('.toggle-face1').hide();
    } else {
      if (face_params.gender) {
        query_builder.find(
          `select[name="face1:gender"]`).val(face_params.gender);
      }
      if (face_params.role) {
        query_builder.find(`select[name="face1:role"]`).val(face_params.role);
      }

      let tag_select = query_builder.find(`select[name="face1:tag"]`);
      let person_select = query_builder.find(`select[name="face1:person"]`);
      let person_or_tag_select = query_builder.find(
        `select[name="face1:person-or-tag"]`
      );
      if (face_params.tag) {
        tag_select.val(face_params.tag.split('&').map(x => $.trim(x)));
        tag_select.parent().show();
        person_select.parent().hide();
        person_or_tag_select.val('tag');
      } else {
        if (face_params.person) {
          person_select.val(face_params.person);
        }
        person_select.parent().show();
        tag_select.parent().hide();
        person_or_tag_select.val('person');
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

  query_builder.find('[name="face1:person-or-tag"]').change(function() {
    let tag_select = $('select[name="face1:tag"]');
    let person_select = $('select[name="face1:person"]');
    if ($(this).val() == 'tag') {
      tag_select.parent().show();
      person_select.val(null).trigger("chosen:updated");
      person_select.parent().hide();
    } else {
      person_select.parent().show();
      tag_select.val(null).trigger("chosen:updated");
      tag_select.parent().hide();
    }
    updateQueryBox(search_table_row);
  });

  query_builder.find('[name="face1:all"]').change(function() {
    if ($(this).is(':checked')) {
      query_builder.find('.toggle-face1').hide();
    } else {
      query_builder.find('.toggle-face1').show();
    }
  });

  // Listen for change events
  query_builder.find('input, select, textarea').change(function() {
    updateQueryBox(search_table_row);
  });

  // Disable where input
  where_box.attr('disabled', true);
}

function closeQueryBuilder(search_table_row) {
  let where_box = search_table_row.find('input[name="where"]');
  let query_builder = search_table_row.find('.query-builder');
  if (query_builder.length > 0) {
    query_builder.find('.chosen-select').chosen('destroy');
    query_builder.remove();
    where_box.attr('disabled', false);
  }
}

function toggleQueryBuilder(element) {
  hideTooltips();

  let search_table_row = $(element).closest('tr');
  let where_box = search_table_row.find('input[name="where"]');
  if (search_table_row.find('.query-builder').length > 0) {
    closeQueryBuilder(search_table_row);
  } else {
    // Close other query builders
    $('.query-builder').each(function() {
      closeQueryBuilder($(this).closest('tr'));
    });

    // Load new query builder
    loadQueryBuilder(search_table_row);
  }
}

function clearChart() {
  $('.query-builder').each(function() {
    closeQueryBuilder($(this).closest('tr'));
  });
  $('#chart').empty();
  let vgrid_selector = $('#vgrid-area');
  vgrid_selector.empty();
  vgrid_selector.hide()
  $('#embed-area').hide();
}

function updateQueryBox(search_table_row) {
  let builder = search_table_row.find('.query-builder');
  let filters = [];

  let channel = builder.find('select[name="{{ parameters.channel }}"]').val();
  if (channel) {
    filters.push(`{{ parameters.channel }}=${channel}`);
  }
  let show = builder.find('select[name="{{ parameters.show }}"]').val();
  if (show) {
    filters.push(`{{ parameters.show }}="${show}"`);
  }
  let hour = builder.find('input[name="{{ parameters.hour }}"]').val();
  if (hour) {
    filters.push(`{{ parameters.hour }}=${hour}`);
  }
  let day_of_week = builder.find('input[name="{{ parameters.day_of_week }}"]').val();
  if (day_of_week) {
    filters.push(`{{ parameters.day_of_week }}="${day_of_week}"`);
  }

  let is_commercial = builder.find('select[name="{{ parameters.is_commercial }}"]').val();
  if (is_commercial != 'false') {
    filters.push(`{{ parameters.is_commercial }}=${is_commercial}`);
  }

  let face_all = builder.find('input[name="face1:all"]').is(':checked');
  if (face_all) {
    filters.push(`{{ parameters.onscreen_face }}1="all"`);
  } else {
    let face_params = [];

    let face_gender = builder.find('select[name="face1:gender"]').val();
    if (face_gender && face_gender.length > 0) {
      face_params.push('gender: ' + face_gender[0]);
    }

    let face_role = builder.find('select[name="face1:role"]').val();
    if (face_role && face_role.length > 0) {
      face_params.push('role: ' + face_role[0]);
    }

    let face_person_or_tag = builder.find('select[name="face1:person-or-tag"]').val();
    if (face_person_or_tag == 'person') {
      let face_person = builder.find('select[name="face1:person"]').val();
      if (face_person && face_person.length > 0) {
        face_params.push('person: ' + face_person[0]);
      }
    } else if (face_person_or_tag == 'tag') {
      let face_tag = builder.find('select[name="face1:tag"]').val();
      if (face_tag && face_tag.length > 0) {
        face_params.push('tag: ' + face_tag.join(' & '));
      }
    }

    if (face_params.length > 0) {
      filters.push(`{{ parameters.onscreen_face }}1="${face_params.join(', ')}"`);
    }
  }

  let num_faces = builder.find('input[name="{{ parameters.onscreen_numfaces }}"]').val();
  if (num_faces) {
    filters.push(`{{ parameters.onscreen_numfaces }}=${num_faces}`);
  }

  if ($('#countVar').val() != '{{ countables.mentions.value }}') {
    let caption_text = builder.find('textarea[name="{{ parameters.caption_text }}"]').val();
    if (caption_text) {
      filters.push(`{{ parameters.caption_text }}="${caption_text}"`);
    }
    let caption_window = builder.find('input[name="{{ parameters.caption_window }}"]').val();
    if (caption_window && caption_window != 0) {
      filters.push(`{{ parameters.caption_window }}=${caption_window}`);
    }
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
    return 'WHERE';
  }
}

function onWhereUpdate(element) {
  // Rewrite query with default normalization if necessary
  let count_var = $('#countVar').val();

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
    $('<td valign="top"/>').append(
      $('<button type="button" class="btn btn-outline-secondary btn-sm toggle-query-builder-btn" onclick="toggleQueryBuilder(this);" />').html('&#x1F4DD;')
    ),
    $('<td valign="top">').append(
      $('<div class="color-box" onclick="changeRowColor(this);" />').css('background-color', color)
    ),
    $('<td class="query-td" />').append(
      $('<div class="input-group" />').append(
        $('<div class="input-group-prepend noselect" />').append(
          $('<span class="input-group-text query-text" name="count-type-prefix" />')),
        $('<div class="countable-only" />').append(
            `<input type="text" class="form-control query-text" name="countable" placeholder="${QUERY_KEYWORDS.all}" />`
          ).val(query_clauses.count),
        $('<div class="input-group-prepend countable-only noselect" />').append(
          $('<span class="input-group-text query-text" />').text('WHERE')),
        $('<input type="text" class="form-control query-text" name="where" placeholder="enter search here (all the data, if blank)" onchange="onWhereUpdate(this);"/>').val(query_clauses.where)
      )
    ),
  );

  let tbody = $('#search-table > tbody');
  tbody.append(new_row);
  setQueryBoxForMode();

  if (tbody.find('tr').length >= DEFAULT_COLORS.length) {
    $('#search-table .add-row-btn').prop('disabled', true);
  }
  setRemoveButtonsState();

  onWhereUpdate(new_row.find('input[name="where"]'));
}
$('#search-table .add-row-btn').click(() => {addRow();});

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

function getDownloadUrl(search_results) {
  let json_obj = Object.values(search_results).map(search_result => {
    let times = new Set(Object.keys(search_result.main));
    if (search_result.normalize) {
      Object.keys(search_result.normalize).forEach(x => times.add(x));
    }
    if (search_result.subtract) {
      Object.keys(search_result.subtract).forEach(x => times.add(x));
    }
    var query_text = $.trim(search_result.query);
    if (!search_result.normalize && !search_result.subtract &&
        query_text.endsWith('WHERE')) {
      query_text += ' (i.e. all the videos)';
    }
    return {
      query: query_text,
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
  }).load('#chart', {video_div: '#vgrid-area'});

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
  addRow();
  search();
}
$(".chosen-select").chosen({width: 'auto'});
$('#countVar').change(setQueryBoxForMode);
$('#searchButton').click(search);

$('#resetButton').click(function() {
  if (window.confirm('Warning! This will clear all of your current queries.')) {
    $('tr[name="query"]').each(function() {
      if ($(this).index() > 0) {
        removeRow($(this));
      } else {
        $(this).find('input[name="countable"]').val('');
        $(this).find('input[name="where"]').val('');
      }
    });

    // Reset to defaults
    $('#aggregateBy').val('{{ default_agg_by }}').trigger("chosen:updated");
    $('#startDate').val(toDatepickerStr('{{ start_date }}'));
    $('#endDate').val(toDatepickerStr('{{ end_date }}'));
    window.history.pushState({}, document.title, '/');
    clearChart();
  }
});
