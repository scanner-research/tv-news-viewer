const DATA_VERSION_ID = {% if data_version is not none %}"{{ data_version }}"{% else %}null{% endif %};

const VIDEO_TIME = '{{ countables.videotime.value }}';

const DEFAULT_START_DATE = '{{ start_date }}';
const DEFAULT_END_DATE = '{{ end_date }}';
const DEFAULT_AGGREGATE_BY = '{{ default_agg_by }}';

const QUERY_BUILDER_HTML = `<div class="query-builder">
  <table>
    <tr>
      <th style="text-align: right;">Find video segments where:</th>
      <td>
        <i style="color: gray;">Warning! Your current query will be overwritten on changes.</i>
      </td>
    </tr>

    <tr><td colspan="2"><hr></td></tr>
    <tr>
      <td type="key-col">
        the screen has a face that:
      </td>
      <td type="value-col">
        <span title='A face is on screen if it is visible anywhere in the frame. This definition includes faces in the foreground or background; live or still; and big or small. Note: this will update onscreen.face="...". To filter on multiple faces, edit the search box manually.'>
          &#9432;
        </span>
      </td>
    </tr>
    <tr>
      <td type="key-col">
        is any face
      </td>
      <td>
        <input type="checkbox" name="face:all">
      </td>
    </tr>
    <tr class="toggle-face">
      <td type="key-col">
        is a person
      </td>
      <td>
        <span>
          <select multiple class="chosen-select chosen-basic-select"
                  data-placeholder="no names selected"
                  name="face:person" data-width="fit">
          </select>
        </span>
      </td>
    </tr>
    <tr class="toggle-face">
      <td type="key-col">
        has tag
      </td>
      <td>
        <span>
          <select multiple class="chosen-select chosen-basic-select"
                  data-placeholder="no tags selected"
                  name="face:tag" data-width="fit">
            {% for tag in global_face_tags %}
            <option value="{{ tag }}">{{ tag }}*</option>
            {% endfor %}
          </select>
          (combined by "and")
          <span title='Tags marked with an * are computed on all faces; otherwise, tags are applied to faces with identities.'>
            &#9432;
          </span>
        </span>
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

    <tr><td colspan="2"><hr></td></tr>
    <tr>
      <td type="key-col">
        the transcript contains
      </td>
      <td type="value-col">
        <textarea type="text" class="form-control no-enter-submit"
               name="{{ parameters.caption_text }}"
               value="" placeholder='one or more keywords or phrases, separated by "|"'
               rows="1"></textarea>
      </td>
    </tr>
    <tr>
      <td type="key-col">
      </td>
      <td type="value-col">
        (with a window of
          <input type="number" class="form-control"
                 name="{{ parameters.caption_window }}"
                 min="0" max="3600" placeholder="{{ default_text_window }}"
                 style="width:70px;">
          seconds around each mention)
      </td>
    </tr>

    <tr><td colspan="2"><hr></td></tr>
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

    <tr><td colspan="2"><hr></td></tr>
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
      <td type="key-col">is a commercial</td>
      <td type="value-col">
        <select class="chosen-select chosen-single-select" name="{{ parameters.is_commercial }}"
                data-width="fit">
          <option value="false" selected="selected">false</option>
          <option value="both">both</option>
          <option value="true">true</option>
        </select>
        <span title='Commcerials are excluded by default ("false"). Use "both" to include commercials and "true" for only commercials.'>
          &#9432;
        </span>
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
    <tr><td colspan="2"><hr></td></tr>
    <tr>
      <td type="key-col">
        Optionally, give this line a name
        <span title="This name will be used in the tooltip and any embedded chart legends.">
          &#9432;
        </span>
      </td>
      <td type="value-col">
        <input type="text" class="form-control no-enter-submit" style="width: 100%;"
               name="{{ parameters.alias }}" value="">
      </td>
    </tr>
  </table>
</div>`;

function fromDatepickerStr(s) {
  let d = new Date(Date.parse(s)).toISOString().substring(0, 10);
  if (d > DEFAULT_END_DATE) {
    throw Error(`Date is out of range: ${d} > ${DEFAULT_END_DATE}`);
  }
  if (d < DEFAULT_START_DATE) {
    throw Error(`Date is out of range: ${d} > ${DEFAULT_START_DATE}`);
  }
  return d;
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
    aggregate: $('#aggregateBy').val()
  }
}

function initChartOptions(chart_options) {
  var start_date = DEFAULT_START_DATE;
  var end_date = DEFAULT_END_DATE;
  var aggregate_by = DEFAULT_AGGREGATE_BY;
  if (chart_options) {
    start_date = chart_options.start_date;
    end_date = chart_options.end_date;
    aggregate_by = chart_options.aggregate;
  }
  $('#aggregateBy').val(aggregate_by);
  $('#startDate').datepicker({
    format: 'mm/dd/yyyy',
    changeYear: true,
    changeMonth: true,
    startDate: toDatepickerStr(DEFAULT_START_DATE),
    endDate: toDatepickerStr(DEFAULT_END_DATE)
  }).datepicker('setDate', toDatepickerStr(start_date));
  $('#endDate').datepicker({
    format: 'mm/dd/yyyy',
    changeYear: true,
    changeMonth: true,
    startDate: toDatepickerStr(DEFAULT_START_DATE),
    endDate: toDatepickerStr(DEFAULT_END_DATE)
  }).datepicker('setDate', toDatepickerStr(end_date));
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
    if ($(`#searchTable tr[data-color='${DEFAULT_COLORS[color_idx]}']`).length == 0) {
      return DEFAULT_COLORS[color_idx];
    }
  }
  throw Error('All colors used');
}

function setRemoveButtonsState() {
  let state = $('#searchTable > tbody > tr').length < 2;
  $('#searchTable td').find('button.remove-row-btn').each(function() {
    this.disabled = state;
  });
}

function removeRow(element) {
  let search_table_row = $(element).closest('tr');
  closeQueryBuilder(search_table_row);
  search_table_row.remove();
  $('#searchTable .add-row-btn').prop('disabled', false);
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
      'select[name="face:person"]'
    );
    ALL_PEOPLE.forEach(x => person_select.append($('<option>').val(x).text(x)));
    let person_tag_select = builder.find(
      'select[name="face:tag"]'
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
  builder.find('[name="face:person"]').val(null).parent();
  builder.find('[name="face:tag"]').val(null).parent();
  builder.find('[name="face:all"]').prop('checked', false);
  builder.find('[name="{{ parameters.onscreen_numfaces }}"]').val('');
  builder.find('[name="normalize"]').prop('checked', false);
  builder.find('[name="{{ parameters.alias }}"]').val('');
  builder.find('.toggle-face').show();
  return builder;
}

function loadQueryBuilder(search_table_row) {
  let where_box = search_table_row.find('input[name="where"]');

  search_table_row.find('.query-td').append(getQueryBuilder());
  var current_query = new SearchableQuery(
    `${QUERY_KEYWORDS.where} ${where_box.val()}`, true);

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

  let onscreen_face = current_query.main_args['{{ parameters.onscreen_face }}'];
  if (onscreen_face) {
    try {
      let face_params = parseFaceFilterString(onscreen_face);
      if (face_params.all) {
        query_builder.find(`input[name="face:all"]`).prop('checked', true);
        query_builder.find('.toggle-face').hide();
      } else {
        let tag_select = query_builder.find(`select[name="face:tag"]`);
        if (face_params.tag) {
          tag_select.val(face_params.tag.split('&').map(x => $.trim(x)));
        }
        let person_select = query_builder.find(`select[name="face:person"]`);
        if (face_params.person) {
          person_select.val(face_params.person.split('&').map(x => $.trim(x)));
        }
      }
    } catch (e) {
      console.log(e);
    }
  }

  let onscreen_numfaces = current_query.main_args['{{ parameters.onscreen_numfaces }}'];
  if (onscreen_numfaces) {
    query_builder.find(
      `[name="{{ parameters.onscreen_numfaces }}"]`
    ).val(onscreen_numfaces);
  }

  if (current_query.alias) {
    query_builder.find(
      '[name="{{ parameters.alias }}"]'
    ).val(current_query.alias);
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

  query_builder.find('[name="face:all"]').change(function() {
    if ($(this).is(':checked')) {
      query_builder.find('.toggle-face').hide();
    } else {
      query_builder.find('.toggle-face').show();
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

function toggleQueryBuilder() {
  let search_table_row = $(this).closest('tr');
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
  let vgrid_selector = $('#vgridArea');
  vgrid_selector.empty();
  vgrid_selector.hide()
  $('#embedArea').hide();
}

function updateQueryBox(search_table_row) {
  let builder = search_table_row.find('.query-builder');
  let filters = [];

  let getBuilderValue = e => builder.find(e).val().replace(/"/gi, '');

  let alias = builder.find('[name="{{ parameters.alias }}"]').val();
  if (alias) {
    filters.push(`{{ parameters.alias }}="${alias}"`);
  }

  let channel = getBuilderValue('select[name="{{ parameters.channel }}"]');
  if (channel) {
    filters.push(`{{ parameters.channel }}="${channel}"`);
  }
  let show = getBuilderValue('select[name="{{ parameters.show }}"]');
  if (show) {
    filters.push(`{{ parameters.show }}="${show}"`);
  }
  let hour = getBuilderValue('input[name="{{ parameters.hour }}"]');
  if (hour) {
    filters.push(`{{ parameters.hour }}="${hour}"`);
  }
  let day_of_week = getBuilderValue('input[name="{{ parameters.day_of_week }}"]');
  if (day_of_week) {
    filters.push(`{{ parameters.day_of_week }}="${day_of_week}"`);
  }

  let is_commercial = getBuilderValue('select[name="{{ parameters.is_commercial }}"]');
  if (is_commercial != 'false') {
    filters.push(`{{ parameters.is_commercial }}=${is_commercial}`);
  }

  let face_all = builder.find('input[name="face:all"]').is(':checked');
  if (face_all) {
    filters.push(`{{ parameters.onscreen_face }}="all"`);
  } else {
    let face_params = [];

    let face_person = builder.find('select[name="face:person"]').val();
    if (face_person && face_person.length > 0) {
      face_params.push('person: ' + face_person.join(' & '));
    }

    let face_tag = builder.find('select[name="face:tag"]').val();
    if (face_tag && face_tag.length > 0) {
      face_params.push('tag: ' + face_tag.join(` & `));
    }

    if (face_params.length > 0) {
      filters.push(`{{ parameters.onscreen_face }}="${face_params.join(', ')}"`);
    }
  }

  let num_faces = builder.find('input[name="{{ parameters.onscreen_numfaces }}"]').val();
  if (num_faces) {
    filters.push(`{{ parameters.onscreen_numfaces }}=${num_faces}`);
  }

  let caption_text = getBuilderValue('textarea[name="{{ parameters.caption_text }}"]');
  if (caption_text) {
    filters.push(`{{ parameters.caption_text }}="${caption_text}"`);
  }
  let caption_window = builder.find('input[name="{{ parameters.caption_window }}"]').val();
  if (caption_window && caption_window != 0) {
    filters.push(`{{ parameters.caption_window }}=${caption_window}`);
  }

  let normalize = getBuilderValue('[name="normalize"]') == 'true';

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
  if ($('#searchTable tr[name="query"]').length > 0) {
    return 'WHERE ' + $('#searchTable input[type="text"][name="where"]:last').val();
  } else {
    return 'WHERE';
  }
}

function onWhereUpdate(element) {
  // Rewrite query with default normalization if necessary
  function checkFaceFilters(filters) {
    Object.keys(filters).forEach(k => {
      if (k.match(/^{{ parameters.onscreen_face }}\d+/)) {
        face_filter = parseFaceFilterString(filters[k]);
      }
    });
  }

  // Check the query
  let query = `COUNT "${VIDEO_TIME}" WHERE ${$(element).val()}`;
  var err = false;
  try {
    let parsed_query = new SearchableQuery(query, false);
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

function changeRowColor() {
  let query_row = $(this).closest('tr[name="query"]');
  let old_color = query_row.attr('data-color');
  let old_color_idx = DEFAULT_COLORS.indexOf(old_color);
  let new_color = getColor(old_color_idx + 1);
  query_row.find('.color-box').css('background-color', new_color);
  query_row.attr('data-color', new_color);
}

function addRow(query) {
  let color = _.get(query, 'color', getColor());
  let text = _.get(query, 'text', getDefaultQuery());
  let query_clauses = new SearchableQuery(text).clauses();

  let new_row = $('<tr>').attr({name: 'query', 'data-color': color}).append(
    $('<td>').attr('valign', 'top').append(
      $('<button onclick="removeRow(this);" >').addClass(
        'btn btn-outline-secondary btn-sm remove-row-btn'
      ).attr({
        type: 'button', title: 'Remove this row.'
      }).text('-')
    ),
    $('<td>').attr('valign', 'top').append(
      $('<button>').addClass(
        'btn btn-outline-secondary btn-sm toggle-query-builder-btn'
      ).attr({
        title: 'Toggle the dropdown search editor.', type: 'button'
      }).click(
        toggleQueryBuilder
      ).html('&#x1F50D;')
    ),
    $('<td>').attr('valign', 'top').append(
      $('<div>').addClass('color-box').click(changeRowColor).attr(
        'title', 'Click to change the color.'
      ).css('background-color', color)
    ),
    $('<td>').addClass('query-td').append(
      $('<div>').addClass('input-group').append(
        $('<div>').addClass('input-group-prepend noselect').append(
          $('<span>').addClass('input-group-text query-text').attr({
            name: 'count-type-prefix'
          }).text(`COUNT ${VIDEO_TIME} WHERE`)
        ),
        $('<input>').addClass(
          'form-control query-text'
        ).attr({
          type: 'text', name: 'where',
          placeholder: 'enter search here (all the data, if blank)'
        }).change(onWhereUpdate).val(query_clauses.where)
      )
    ),
  );

  let tbody = $('#searchTable > tbody');
  tbody.append(new_row);

  if (tbody.find('tr').length >= DEFAULT_COLORS.length) {
    $('#searchTable .add-row-btn').prop('disabled', true);
  }
  setRemoveButtonsState();

  onWhereUpdate(new_row.find('input[name="where"]'));
}
$('#searchTable .add-row-btn').click(() => {addRow();});

function getDataString(chart_options, lines) {
  return encodeURIComponent(JSON.stringify({
    options: chart_options,
    queries: lines.map(l => ({color: l.color, text: l.query.query}))
  }));
}

function getEmbedUrl(data) {
  var prefix = 'https://{{ host }}/embed?';
  if (DATA_VERSION_ID) {
    prefix += 'dataVersion=' + encodeURIComponent(DATA_VERSION_ID) + '&';
  }
  return prefix + `width=${EMBED_DIMS.width}&height=${EMBED_DIMS.height}&data=${data}`;
}

function getChartPath(data) {
  var prefix = '/?';
  if (DATA_VERSION_ID) {
    prefix += 'dataVersion=' + encodeURIComponent(DATA_VERSION_ID) + '&';
  }
  return prefix + 'data=' + data;
}

function getDownloadUrl(search_results) {
  let json_data = search_results.flatMap(([color, result]) => {
    let times = new Set(Object.keys(result.main));
    if (result.normalize) {
      Object.keys(result.normalize).forEach(x => times.add(x));
    }
    if (result.subtract) {
      Object.keys(result.subtract).forEach(x => times.add(x));
    }
    var query_text = $.trim(result.query);
    if (!result.normalize && !result.subtract &&
        query_text.endsWith('WHERE')) {
      query_text += ' (i.e. all the videos)';
    }
    let unit = result.normalize ? 'ratio' : 'seconds';
    return Array.from(times).map(t => {
      var value = _.get(result.main, t, []).reduce((acc, x) => acc + x[1], 0);
      if (result.normalize) {
        value /=  _.get(result.normalize, t, 0);
      } else if (result.subtract) {
        value /=  _.get(result.subtract, t, 0);
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

var showTooltip;
var setCopyUrl, setEmbedUrl;

function displaySearchResults(chart_options, lines, search_results) {
  new Chart(chart_options, search_results, {
    width: $("#chartArea").width(), height: EMBED_DIMS.height
  }).load('#chart', {show_tooltip: showTooltip, video_div: '#vgridArea'});

  if (search_results.length == lines.length) {
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
      let x = $('#embedArea textarea[name="embed"]');
      x.val(`<iframe src="${embed_url}"></iframe>`);
      x.toggle();
    };

    $('#embedArea p[name="text"]').html(
      `<a href="#" onclick="setCopyUrl(); return false;">Copy</a> url,
       <a href="#" onclick="setEmbedUrl(); return false;">embed</a> chart, or
       <a href="${getDownloadUrl(search_results)}" download="data.csv" type="text/json">download</a> the data.`
    );
    window.history.pushState(null, '', chart_path);
  } else {
    // Allow embedding if all queries are ok
    $('#embedArea p[name="text"]').empty();
    window.history.pushState(null, '', '')
  }
  $('#embedArea').show();
}

function getRawQueries() {
  let queries = [];
  $('#searchTable > tbody > tr').each(function() {
    if ($(this).attr('name')) {
      let where_str = $.trim($(this).find('input[name="where"]').val());
      queries.push({
        color: $(this).attr('data-color'),
        text: `COUNT "${VIDEO_TIME}" WHERE ${where_str}`
      });
    }
  });
  return queries;
}

function search() {
  clearChart();

  let chart_options = getChartOptions();
  let lines = getRawQueries().map(
    raw_query => {
      var parsed_query;
      try {
        parsed_query = new SearchableQuery(raw_query.text, false);
      } catch (e) {
        alertAndThrow(e.message);
      }
      return {color: raw_query.color, query: parsed_query};
    });

  $('#shade').show();
  let indexed_search_results = [];
  function onDone() {
    $('#shade').hide();
    indexed_search_results.sort();
    displaySearchResults(
      chart_options, lines, indexed_search_results.map(([i, v]) => v)
    );
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
        msg = JSON.parse(xhr.responseText).message;
      } catch {
        msg = `Error: ${status}`;
      }
      alert(`[Query failed] ${line.query.query}\n\n${msg}\n\nThe chart may be incomplete.`);
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

function initialize() {
  let params = (new URL(document.location)).searchParams;
  showTooltip = params.get('tooltip') != 0;

  if (params.get('dataVersion')) {
    let version_id = decodeURIComponent(params.get('dataVersion'));
    if (DATA_VERSION_ID != version_id) {
      console.log(`data version mismatch ${DATA_VERSION_ID} != ${version_id}`);
      alert(`Warning: the data version has changed from ${version_id} to ${DATA_VERSION_ID}. Remove "dataVersion=${encodeURIComponent(version_id)}" from the shared link/URL to disable this warning.`);
    }
  }

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
    addRow({text: 'WHERE face="person: barack obama"'});
    addRow({text: 'WHERE face="person: donald trump"'});
    if (params.get('blank') != 1) {
      search();
    }
  }

  $(".chosen-select").chosen({width: 'auto'});
  $('#searchButton').click(search);
  $('#resetButton').click(function() {
    if (window.confirm('Warning! This will clear all of your current queries.')) {
      $('tr[name="query"]').each(function() {
        if ($(this).index() > 0) {
          removeRow($(this));
        } else {
          $(this).find('input[name="where"]').val('');
        }
      });

      // Reset to defaults
      $('#aggregateBy').val(DEFAULT_AGGREGATE_BY).trigger("chosen:updated");
      $('#startDate').val(toDatepickerStr(DEFAULT_START_DATE));
      $('#endDate').val(toDatepickerStr(DEFAULT_END_DATE));
      window.history.pushState({}, document.title, '/');
      clearChart();
    }
  });

  addHighlight('#plusMinusHover', ['.remove-row-btn', '.add-row-btn']);
  addHighlight('#dropdownEditorHover', ['.toggle-query-builder-btn']);
  addHighlight('#chartAreaHover', ['#chart']);
  addHighlight('#searchButtonHover', ['#searchButton']);

  $('#infoToggle').click(function() {
    let info_text = $('#infoSpanText');
    info_text.toggle();
    $(this).text(info_text.is(':visible') ? 'hide help' : 'show help');
  });
}

/* Load widget */
initialize();
