var ENABLE_QUERY_BUILDER = false;

const CODE_EDITORS = {};

const QUERY_BUILDER_HTML = `<div class="query-builder">
  <table>
    <tr>
      <th style="text-align: right;">Find video segments where:</th>
      <td>
        <i style="color: gray;">Warning! Your current query will be overwritten on changes.</i>
      </td>
    </tr>

    <tr class="face-div">
      <td type="key-col">
        the screen has a face that:
      </td>
      <td type="value-col">
        <span title='A face is on screen if it is visible anywhere in the frame. This definition includes faces in the foreground or background; live or still; and big or small.'>
          &#9432;
        </span>
      </td>
    </tr>
    <tr class="face-div">
      <td type="key-col">
        is a person
      </td>
      <td>
        <span>
          <select multiple class="chosen-select chosen-basic-select"
                  data-placeholder="no names selected"
                  name="${SEARCH_KEY.face_name}" data-width="fit">
          </select>
        </span>
      </td>
    </tr>
    <tr class="face-div">
      <td type="key-col">
        has tag
      </td>
      <td>
        <span>
          <select multiple class="chosen-select chosen-basic-select"
                  data-placeholder="no tags selected"
                  name="${SEARCH_KEY.face_tag}" data-width="fit">
          </select>
          (on the same face)
          <span title='Tags marked with an * are computed on all faces; otherwise, tags are applied to faces with identities.'>
            &#9432;
          </span>
        </span>
      </td>
    </tr>
    <tr class="face-div">
      <td type="key-col">
        there are
      </td>
      <td type="value-col">
        <input type="number" class="form-control no-enter-submit num-faces-input"
               name="${SEARCH_KEY.face_count}"
               min="1" max="25" placeholder="enter a number">
        faces on-screen
      </td>
    </tr>

    <tr class="text-div">
      <td type="key-col">
        the transcript contains
      </td>
      <td type="value-col">
        <textarea type="text" class="form-control no-enter-submit"
               name="${SEARCH_KEY.text}"
               value="" placeholder='one or more keywords or phrases, separated by "|"'
               rows="1"></textarea>
      </td>
    </tr>
    <tr class="text-div">
      <td type="key-col">
      </td>
      <td type="value-col">
        (with a window of
          <input type="number" class="form-control"
                 name="${SEARCH_KEY.text_window}"
                 min="0" max="3600" placeholder="${DEFAULT_TEXT_WINDOW}"
                 style="width:70px;">
          seconds around each mention)
      </td>
    </tr>

    <tr class="video-div">
      <td type="key-col">the channel is</td>
      <td type="value-col">
        <select class="chosen-select chosen-basic-select"
                name="${SEARCH_KEY.channel}" data-width="fit">
          <option value="" selected="selected">All - CNN, FOX, or MSNBC</option>
          <option value="CNN">CNN</option>
          <option value="FOX">FOX</option>
          <option value="MSNBC">MSNBC</option>
        </select>
      </td>
    </tr>
    <tr class="video-div">
      <td type="key-col">the show is</td>
      <td type="value-col">
        <select class="chosen-select chosen-basic-select"
                name="${SEARCH_KEY.show}" data-width="fit">
          <option value="" selected="selected">All shows</option>
        </select>
      </td>
    </tr>

    <tr class="time-div">
      <td type="key-col">the hour of day is between</td>
      <td type="value-col"><input type="text" class="form-control no-enter-submit"
          name="${SEARCH_KEY.hour}" value="" placeholder="0-23"> (in Eastern Time)
      </td>
    </tr>
    <tr class="time-div">
      <td type="key-col">the day of week is</td>
      <td type="value-col"><input type="text" class="form-control no-enter-submit"
          name="${SEARCH_KEY.day_of_week}" value="" placeholder="mon-sun"></td>
    </tr>

    <tr disabled>
      <td type="key-col">*normalize the query</td>
      <td type="value-col">
        <select class="chosen-select" name="normalize" data-width="fit">
          <option value="false" selected="selected">no</option>
          <option value="true">yes</option>
        </select>
      </td>
    </tr>
    <tr>
      <td type="key-col">
        Optionally, give this line a name
        <span title="This name will be used in any embedded chart legends.">
          &#9432;
        </span>
      </td>
      <td type="value-col">
        <input type="text" class="form-control no-enter-submit alias-input"
               name="alias" value="">
      </td>
    </tr>
  </table>
</div>`;

var CACHED_QUERY_BUILDER = null;

function getQueryBuilder() {
  var builder = null;
  if (CACHED_QUERY_BUILDER) {
    builder = CACHED_QUERY_BUILDER;
  } else {
    builder = $(QUERY_BUILDER_HTML);
    let show_select = builder.find(`[name="${SEARCH_KEY.show}"]`);
    ALL_SHOWS.forEach(x => show_select.append($('<option>').val(x).text(x)));
    let name_select = builder.find(`[name="${SEARCH_KEY.face_name}"]`);
    ALL_PEOPLE.forEach(x => name_select.append($('<option>').val(x).text(x)));
    let tag_select = builder.find(`[name="${SEARCH_KEY.face_tag}"]`);
    ALL_GLOBAL_TAGS.forEach(x => tag_select.append($('<option>').val(x).text(x + '*')));
    ALL_PERSON_TAGS.forEach(x => tag_select.append($('<option>').val(x).text(x)));
    CACHED_QUERY_BUILDER = builder;
  }

  // Reset the builder defaults
  builder.find(`[name="${SEARCH_KEY.channel}"]`).val('');
  builder.find(`[name="${SEARCH_KEY.show}"]`).val('');
  builder.find(`[name="${SEARCH_KEY.hour}"]`).val('');
  builder.find(`[name="${SEARCH_KEY.day_of_week}"]`).val('');
  builder.find(`[name="${SEARCH_KEY.text}"]`).val('');
  builder.find(`[name="${SEARCH_KEY.text_window}"]`).val(DEFAULT_TEXT_WINDOW);
  builder.find(`[name="${SEARCH_KEY.face_name}"]`).val(null);
  builder.find(`[name="${SEARCH_KEY.face_tag}"]`).val(null);
  builder.find(`[name="${SEARCH_KEY.face_count}"]`).val('');
  builder.find(`[name="normalize"]`).prop('checked', false);
  builder.find(`[name="alias"]`).val('');
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

    let channel = top_level_kv[SEARCH_KEY.channel];
    if (channel) {
      query_builder.find(`select[name="${SEARCH_KEY.channel}"]`).val(
        channel.toUpperCase() == 'FOXNEWS' ? 'FOX' : channel);
    }

    setOneIfDefined(SEARCH_KEY.show);
    setOneIfDefined(SEARCH_KEY.hour);
    setOneIfDefined(SEARCH_KEY.day_of_week);
    setOneIfDefined(SEARCH_KEY.text);
    setOneIfDefined(SEARCH_KEY.text_window);

    let face_names = top_level_kv[SEARCH_KEY.face_name];
    if (face_names) {
      query_builder.find(`[name="${SEARCH_KEY.face_name}"]`).val(face_names);
    }

    let face_tags = top_level_kv[SEARCH_KEY.face_tag];
    if (face_tags && face_tags.length > 0) {
      query_builder.find(`[name="${SEARCH_KEY.face_tag}"]`).val(
        face_tags[0].split(',').map($.trim));
    }

    let face_count = top_level_kv[SEARCH_KEY.face_count];
    if (face_count) {
      query_builder.find(`[name="${SEARCH_KEY.face_count}"]`).val(parseInt(face_count));
    }

    if (parsed_query.alias) {
      query_builder.find('[name="alias"]').val(parsed_query.alias);
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
    onQueryBuilderUpdate(search_table_row);
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

function onQueryBuilderUpdate(search_table_row) {
  let data_color = search_table_row.attr('data-color');
  let builder = search_table_row.find('.query-builder');
  let parts = [];

  let getBuilderValue = e => builder.find(e).val().replace(/"/gi, '');

  let channel = getBuilderValue(`[name="${SEARCH_KEY.channel}"]`);
  if (channel) {
    parts.push(`${SEARCH_KEY.channel}="${channel}"`);
  }
  let show = getBuilderValue(`[name="${SEARCH_KEY.show}"]`);
  if (show) {
    parts.push(`${SEARCH_KEY.show}="${show}"`);
  }
  let hour = getBuilderValue(`[name="${SEARCH_KEY.hour}"]`);
  if (hour) {
    parts.push(`${SEARCH_KEY.hour}="${hour}"`);
  }
  let day_of_week = getBuilderValue(`[name="${SEARCH_KEY.day_of_week}"]`);
  if (day_of_week) {
    parts.push(`${SEARCH_KEY.day_of_week}="${day_of_week}"`);
  }

  let face_names = builder.find(`[name="${SEARCH_KEY.face_name}"]`).val();
  if (face_names && face_names.length > 0) {
    face_names.forEach(name => {
      parts.push(`${SEARCH_KEY.face_name}="${name}"`);
    });
  }

  let face_tag = builder.find(`[name="${SEARCH_KEY.face_tag}"]`).val();
  if (face_tag && face_tag.length > 0) {
    parts.push(`${SEARCH_KEY.face_tag}="${face_tag.join(' AND ')}"`);
  }

  let face_count = builder.find(`[name="${SEARCH_KEY.face_count}"]`).val();
  if (face_count) {
    parts.push(`${SEARCH_KEY.face_count}=${face_count}`);
  }

  let text = getBuilderValue(`[name="${SEARCH_KEY.text}"]`);
  if (text) {
    parts.push(`${SEARCH_KEY.text}="${text}"`);
  }
  let text_window = builder.find(`[name="${SEARCH_KEY.text_window}"]`).val();
  if (text_window && text_window != 0) {
    parts.push(`${SEARCH_KEY.text_window}=${text_window}`);
  }

  let normalize = getBuilderValue('[name="normalize"]') == 'true';

  // Construct the new query
  var new_query = parts.length > 0 ? parts.join(` ${RESERVED_KEYWORDS.and} `) : '';
  if (normalize) {
    new_query += ` ${RESERVED_KEYWORDS.normalize}`;
  }

  let alias = builder.find(`[name="alias"]`).val();
  if (alias) {
    new_query = `[${alias}] ${new_query}`;
  }

  setCodeEditorValue(CODE_EDITORS[data_color], new_query);
}

/* Editor code */

function fromDatepickerStr(s) {
  let m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) {
    throw Error(`Invalid date: ${s}. Please use MM/DD/YYYY format.`);
  }
  let d = new Date(
    Date.UTC(parseInt(m[3]), parseInt(m[1]) - 1, parseInt(m[2]))
  ).toISOString().substring(0, 10);
  if (d > DEFAULT_END_DATE) {
    throw Error(`Date is out of range: ${d} > ${DEFAULT_END_DATE}`);
  }
  if (d < DEFAULT_START_DATE) {
    throw Error(`Date is out of range: ${d} < ${DEFAULT_START_DATE}`);
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

function setCodeEditorValue(editor, value) {
  editor.setValue(value);
  setTimeout(function() { editor.refresh(); }, 50);
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

function removeRow(element) {
  let search_table_row = $(element).closest('tr');
  if (ENABLE_QUERY_BUILDER) {
    closeQueryBuilder(search_table_row);
  }
  let color = search_table_row.attr('data-color');
  search_table_row.remove();
  delete CODE_EDITORS[color];
  $('#searchTable .add-row-btn').prop('disabled', false);
  setRemoveButtonsState();
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
    ENABLE_QUERY_BUILDER ?
      $('<td>').attr('valign', 'top').append(
        $('<button>').addClass(
          'btn btn-outline-secondary btn-sm toggle-query-builder-btn'
        ).attr({
          title: 'Toggle the dropdown search editor.', type: 'button'
        }).click(
          toggleQueryBuilder
        ).html('&#x1F50D;')
      ) : null,
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
    mode: 'tvnews', theme: 'tvnews', lineNumbers: false,
    autoCloseBrackets: true, matchBrackets: true,
    lineWrapping: true, noNewlines: true, scrollbarStyle: null,
    placeholder: 'enter search here (all the data, if blank)',
    hintOptions: {hint: CodeMirror.hint.tvnews, completeSingle: false},
    extraKeys: {Enter: search}
  });
  setCodeEditorValue(editor, text);
  editor.on('cursorActivity', (cm) => {
    if (!cm.state.completeActive) {
      // Only show hint if the query builder is closed
      let tmp = Object.entries(CODE_EDITORS).filter(
        ([c, e]) => e == editor && e.hasFocus()
      );
      if (tmp.length > 0) {
        let data_color = tmp[0][0];
        let search_table_row = $(`#searchTable tr[data-color="${data_color}"]`);
        if (search_table_row.find('.query-builder').length == 0) {
          cm.showHint();
        }
      }
    }
  });
  editor.on('change', onCodeUpdate);
  CODE_EDITORS[color] = editor;

  let tbody = $('#searchTable > tbody');
  tbody.append(new_row);

  if (tbody.find('tr').length >= DEFAULT_COLORS.length) {
    $('#searchTable .add-row-btn').prop('disabled', true);
  }
  setRemoveButtonsState();

  new_row.find('input[name="query"]').trigger('change');
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

function isValidQuery(s) {
  try {
    new SearchableQuery(s, false);
  } catch (e) {
    console.log(e);
    return false;
  }
  return true;
}

function onCodeUpdate() {
  Object.entries(CODE_EDITORS).forEach(([data_color, editor]) => {
    var err = !isValidQuery(editor.getValue());
    let editor_div = $(`#searchTable tr[data-color="${data_color}"]`).find('.code-editor');
    if (err) {
      editor_div.attr('invalid', '');
    } else {
      editor_div.removeAttr('invalid');
    }
  });
}
