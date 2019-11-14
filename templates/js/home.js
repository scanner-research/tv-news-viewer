const CODE_EDITORS = {};

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
        <span title='A face is on screen if it is visible anywhere in the frame. This definition includes faces in the foreground or background; live or still; and big or small.'>
          &#9432;
        </span>
      </td>
    </tr>
    <tr>
      <td type="key-col">
        is a person
      </td>
      <td>
        <span>
          <select multiple class="chosen-select chosen-basic-select"
                  data-placeholder="no names selected"
                  name="{{ search_keys.face_name }}" data-width="fit">
          </select>
        </span>
      </td>
    </tr>
    <tr>
      <td type="key-col">
        has tag
      </td>
      <td>
        <span>
          <select multiple class="chosen-select chosen-basic-select"
                  data-placeholder="no tags selected"
                  name="{{ search_keys.face_tag }}" data-width="fit">
            {% for tag in global_face_tags %}
            <option value="{{ tag }}">{{ tag }}*</option>
            {% endfor %}
          </select>
          (on the same face)
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
               name="{{ search_keys.face_count }}"
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
               name="{{ search_keys.text }}"
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
                 name="{{ search_keys.text_window }}"
                 min="0" max="3600" placeholder="${DEFAULT_TEXT_WINDOW}"
                 style="width:70px;">
          seconds around each mention)
      </td>
    </tr>

    <tr><td colspan="2"><hr></td></tr>
    <tr>
      <td type="key-col">the channel is</td>
      <td type="value-col">
        <select class="chosen-select chosen-basic-select"
                name="{{ search_keys.channel }}" data-width="fit">
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
        <select class="chosen-select chosen-basic-select"
                name="{{ search_keys.show }}" data-width="fit">
          <option value="" selected="selected">All shows</option>
        </select>
      </td>
    </tr>

    <tr><td colspan="2"><hr></td></tr>
    <tr>
      <td type="key-col">the hour of day is between</td>
      <td type="value-col"><input type="text" class="form-control no-enter-submit"
          name="{{ search_keys.hour }}" value="" placeholder="0-23"> (in Eastern Time)
      </td>
    </tr>
    <tr>
      <td type="key-col">the day of week is</td>
      <td type="value-col"><input type="text" class="form-control no-enter-submit"
          name="{{ search_keys.day_of_week }}" value="" placeholder="mon-sun"></td>
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
        <span title="This name will be used in any embedded chart legends.">
          &#9432;
        </span>
      </td>
      <td type="value-col">
        <input type="text" class="form-control no-enter-submit alias-input"
               name="{{ params.alias }}" value="">
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

const DEFAULT_CHART_DIMS = {width: 1000, height: 400};

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
  let color = search_table_row.attr('data-color');
  search_table_row.remove();
  delete CODE_EDITORS[color];
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
    let show_select = builder.find('select[name="{{ search_keys.show }}"]');
    ALL_SHOWS.forEach(x => show_select.append($('<option>').val(x).text(x)));
    let person_select = builder.find('select[name="{{ search_keys.face_name }}"]');
    ALL_PEOPLE.forEach(x => person_select.append($('<option>').val(x).text(x)));
    let person_tag_select = builder.find('select[name="{{ search_keys.face_tag }}"]');
    ALL_PERSON_TAGS.forEach(x => person_tag_select.append($('<option>').val(x).text(x)));
    _QUERY_BUILDER = builder;
  }

  // Reset the builder defaults
  builder.find('[name="{{ search_keys.channel }}"]').val('');
  builder.find('[name="{{ search_keys.show }}"]').val('');
  builder.find('[name="{{ search_keys.hour }}"]').val('');
  builder.find('[name="{{ search_keys.day_of_week }}"]').val('');
  builder.find('[name="{{ search_keys.text }}"]').val('');
  builder.find('[name="{{ search_keys.text_window }}"]').val(DEFAULT_TEXT_WINDOW);
  builder.find('[name="{{ search_keys.face_name }}"]').val(null);
  builder.find('[name="{{ search_keys.face_tag }}"]').val(null);
  builder.find('[name="{{ search_keys.face_count }}"]').val('');
  builder.find('[name="normalize"]').prop('checked', false);
  builder.find('[name="{{ params.alias }}"]').val('');
  return builder;
}

function loadQueryBuilder(search_table_row) {
  search_table_row.find('.query-td').append(getQueryBuilder());
  let data_color = search_table_row.attr('data-color');
  let editor = CODE_EDITORS[data_color];
  let query_builder = search_table_row.find('.query-builder');

  try {
    let parsed_query = new SearchableQuery(editor.getValue(), true);
    let top_level_kv = {};
    if (parsed_query.main_query) {
      let [k, v] = parsed_query.main_query;
      if (k == 'and') {
        v.forEach(([a, b]) => {
          if (top_level_kv.hasOwnProperty(a)) {
            top_level_kv[a].push(b);
          } else {
            top_level_kv[a] = [b];
          }
        });
      } else {
        top_level_kv[k] = [v];
      }
    }

    let setOneIfDefined = k => {
      let v = top_level_kv[k];
      if (v) {
        query_builder.find(`[name="${k}"]`).val(v[0]);
      }
    };

    let channel = top_level_kv['{{ search_keys.channel }}'];
    if (channel) {
      query_builder.find(`select[name="{{ search_keys.channel }}"]`).val(
        channel.toUpperCase() == 'FOXNEWS' ? 'FOX' : channel);
    }

    setOneIfDefined('{{ search_keys.show }}');
    setOneIfDefined('{{ search_keys.hour }}');
    setOneIfDefined('{{ search_keys.day_of_week }}');
    setOneIfDefined('{{ search_keys.text }}');
    setOneIfDefined('{{ search_keys.text_window }}');

    let face_names = top_level_kv['{{ search_keys.face_name }}'];
    if (face_names) {
      query_builder.find('[name="{{ search_keys.face_name }}"]').val(face_names);
    }

    let face_tags = top_level_kv['{{ search_keys.face_tag }}'];
    if (face_tags && face_tags.length > 0) {
      query_builder.find('[name="{{ search_keys.face_tag }}"]').val(
        face_tags[0].split(',').map($.trim));
    }

    let face_count = top_level_kv['{{ search_keys.face_count }}'];
    if (face_count) {
      query_builder.find('[name="{{ search_keys.face_count }}"]').val(parseInt(face_count));
    }

    if (parsed_query.alias) {
      query_builder.find('[name="{{ params.alias }}"]').val(parsed_query.alias);
    }

    if (parsed_query.norm_query) {
      query_builder.find('[name="normalize"]').val('true');
    }
  } catch (e) {
    console.log('Failed to populate query builder', e);
  }

  query_builder.find('.no-enter-submit').keypress(e => e.which != 13);

  // Activate select boxes
  query_builder.find('.chosen-single-select').chosen({
    width: 'auto', max_selected_options: 1
  });
  query_builder.find('.chosen-basic-select').chosen({width: 'auto'});

  // Listen for change events
  query_builder.find('input, select, textarea').change(function() {
    updateQueryBox(search_table_row);
  });

  // Disable the text box
  search_table_row.find('.code-editor').attr('disable', '');
  CODE_EDITORS[data_color].setOption('readOnly', 'nocursor');
}

function closeQueryBuilder(search_table_row) {
  let query_builder = search_table_row.find('.query-builder');
  if (query_builder.length > 0) {
    query_builder.find('.chosen-select').chosen('destroy');
    query_builder.remove();

    // Reenable editing
    let data_color = search_table_row.attr('data-color');
    search_table_row.find('.code-editor').removeAttr('disable');
    CODE_EDITORS[data_color].setOption('readOnly', false);
  }
}

function toggleQueryBuilder() {
  let search_table_row = $(this).closest('tr');
  let query_input = search_table_row.find('input[name="query"]');
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

function setCodeEditorValue(editor, value) {
  editor.setValue(value);
  setTimeout(function() { editor.refresh(); }, 50);
}

function updateQueryBox(search_table_row) {
  let data_color = search_table_row.attr('data-color');
  let builder = search_table_row.find('.query-builder');
  let parts = [];

  let getBuilderValue = e => builder.find(e).val().replace(/"/gi, '');

  let channel = getBuilderValue('select[name="{{ search_keys.channel }}"]');
  if (channel) {
    parts.push(`{{ search_keys.channel }}="${channel}"`);
  }
  let show = getBuilderValue('select[name="{{ search_keys.show }}"]');
  if (show) {
    parts.push(`{{ search_keys.show }}="${show}"`);
  }
  let hour = getBuilderValue('input[name="{{ search_keys.hour }}"]');
  if (hour) {
    parts.push(`{{ search_keys.hour }}="${hour}"`);
  }
  let day_of_week = getBuilderValue('input[name="{{ search_keys.day_of_week }}"]');
  if (day_of_week) {
    parts.push(`{{ search_keys.day_of_week }}="${day_of_week}"`);
  }

  let face_names = builder.find('select[name="{{ search_keys.face_name }}"]').val();
  if (face_names && face_names.length > 0) {
    face_names.forEach(name => {
      parts.push(`{{ search_keys.face_name }}="${name}"`);
    });
  }

  let face_tag = builder.find('select[name="{{ search_keys.face_tag }}"]').val();
  if (face_tag && face_tag.length > 0) {
    parts.push(`{{ search_keys.face_tag }}="${face_tag.join(' AND ')}"`);
  }

  let face_count = builder.find('input[name="{{ search_keys.face_count }}"]').val();
  if (face_count) {
    parts.push(`{{ search_keys.face_count }}=${face_count}`);
  }

  let text = getBuilderValue('textarea[name="{{ search_keys.text }}"]');
  if (text) {
    parts.push(`{{ search_keys.text }}="${text}"`);
  }
  let text_window = builder.find('input[name="{{ search_keys.text_window }}"]').val();
  if (text_window && text_window != 0) {
    parts.push(`{{ search_keys.text_window }}=${text_window}`);
  }

  let normalize = getBuilderValue('[name="normalize"]') == 'true';

  // Construct the new query
  var new_query = parts.length > 0 ? parts.join(` ${QUERY_KEYWORDS.and} `) : '';
  if (normalize) {
    new_query += ` ${QUERY_KEYWORDS.normalize}`;
  }

  let alias = builder.find('[name="{{ params.alias }}"]').val();
  if (alias) {
    new_query = `[${alias}] ${new_query}`;
  }

  setCodeEditorValue(CODE_EDITORS[data_color], new_query);
}

function getDefaultQuery() {
  if ($('#searchTable tr[name="query"]').length > 0) {
    let last_row = $('#searchTable tr[name="query"]:last');
    let last_row_color = last_row.attr('data-color');
    return CODE_EDITORS[last_row_color].getValue();
  } else {
    return '';
  }
}

function changeRowColor() {
  let query_row = $(this).closest('tr[name="query"]');
  let old_color = query_row.attr('data-color');
  let old_color_idx = DEFAULT_COLORS.indexOf(old_color);
  let new_color = getColor(old_color_idx + 1);
  let editor = CODE_EDITORS[old_color];
  query_row.find('.color-box').css('background-color', new_color);
  query_row.attr('data-color', new_color);
  CODE_EDITORS[new_color] = editor;
  delete CODE_EDITORS[old_color];
}

function addRow(query) {
  let color = _.get(query, 'color', getColor());
  let text = _.get(query, 'text', getDefaultQuery());

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
      $('<div>').addClass('code-editor')
    ),
  );

  let editor = CodeMirror(new_row.find('.code-editor')[0], {
    mode:'tvquery', theme: 'tvnews', lineNumbers: false,
    autoCloseBrackets: true, matchBrackets: true,
    lineWrapping: true, noNewlines: true, scrollbarStyle: null,
    placeholder: 'enter search here (all the data, if blank)',
    extraKeys: { Enter: search }
  });
  setCodeEditorValue(editor, text);
  CODE_EDITORS[color] = editor;

  let tbody = $('#searchTable > tbody');
  tbody.append(new_row);

  if (tbody.find('tr').length >= DEFAULT_COLORS.length) {
    $('#searchTable .add-row-btn').prop('disabled', true);
  }
  setRemoveButtonsState();

  new_row.find('input[name="query"]').trigger('change');
}
$('#searchTable .add-row-btn').click(() => {addRow();});

function getDataString(chart_options, lines) {
  return encodeURIComponent(JSON.stringify({
    options: chart_options,
    queries: lines.map(l => ({color: l.color, text: l.query.query}))
  }));
}

function getEmbedUrl(data) {
  var prefix = `https://${SERVER_HOST}/embed?`;
  if (DATA_VERSION_ID) {
    prefix += 'dataVersion=' + encodeURIComponent(DATA_VERSION_ID) + '&';
  }
  return prefix + `width=${DEFAULT_CHART_DIMS.width}&height=${DEFAULT_CHART_DIMS.height}&data=${data}`;
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

var minimalMode, chartHeight;
var setCopyUrl, setEmbedUrl;

function displaySearchResults(
  chart_options, lines, search_results, push_state
) {
  new Chart(chart_options, search_results, {
    width: $("#chartArea").width(), height: chartHeight
  }).load('#chart', {
    video_div: '#vgridArea', show_tooltip: !minimalMode,
    vega_actions: minimalMode
  });

  if (search_results.length == lines.length) {
    // Allow embedding if all queries are ok
    let data_str = getDataString(chart_options, lines);
    let chart_path = getChartPath(data_str);
    let embed_url = getEmbedUrl(data_str);

    setCopyUrl = () => {
      var dummy = document.createElement('input');
      document.body.appendChild(dummy);
      dummy.setAttribute('value', 'https://' + SERVER_HOST + chart_path);
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
    if (push_state && !minimalMode) {
      window.history.pushState(null, '', chart_path);
    }
  } else {
    // Allow embedding if all queries are ok
    $('#embedArea p[name="text"]').empty();
    if (push_state && !minimalMode) {
      window.history.pushState(null, '', '');
    }
  }
  $('#embedArea').show();
}

function getRawQueries() {
  let queries = [];
  $('#searchTable > tbody > tr').each(function() {
    if ($(this).attr('name')) {
      let color = $(this).attr('data-color');
      let query_str = CODE_EDITORS[color].getValue();
      queries.push({color: color, text: $.trim(query_str)});
    }
  });
  return queries;
}

function search(event) {
  clearChart();

  var chart_options;
  try {
    chart_options = getChartOptions();
  } catch (e) {
    alertAndThrow(e.message);
  }

  let lines = getRawQueries().map(
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

  $('#shade').show();
  let indexed_search_results = [];
  function onDone() {
    $('#shade').hide();
    indexed_search_results.sort();
    displaySearchResults(
      chart_options, lines, indexed_search_results.map(([i, v]) => v),
      event != undefined
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

function setDataVersionWarning(version_id) {
  $('#dataVersionWarning').text(`Warning! The data version has changed from ${version_id} to ${DATA_VERSION_ID}. Remove "dataVersion=${encodeURIComponent(version_id)}" from the shared link/URL to disable this message.`).show();
}

function initialize() {
  addParsingMode('tvnews', {no_prefix: true, check_values: true});

  let params = (new URL(document.location)).searchParams;
  minimalMode = params.get('minimal') == 1;
  chartHeight = params.get('chartHeight') ? parseInt(params.get('chartHeight')) : DEFAULT_CHART_DIMS.height;

  if (params.get('dataVersion')) {
    let version_id = decodeURIComponent(params.get('dataVersion'));
    if (DATA_VERSION_ID != version_id) {
      console.log(`data version mismatch ${DATA_VERSION_ID} != ${version_id}`);
      setDataVersionWarning(version_id);
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
    if (params.get('blank') == 1) {
      addRow({text: ''});
    } else {
      addRow({text: 'name="barack obama"'});
      addRow({text: 'name="donald trump"'});
      search();
    }
  }

  // setInterval(() => {Object.values(CODE_EDITORS).forEach(e => e.refresh())}, 250);

  $(".chosen-select").chosen({width: 'auto'});
  $('#searchButton').click(search);
  $('#resetButton').click(function() {
    if (window.confirm('Warning! This will clear all of your current queries.')) {
      $('tr[name="query"]').each(function() {
        if ($(this).index() > 0) {
          removeRow($(this));
        } else {
          $(this).find('input[name="query"]').val('');
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
