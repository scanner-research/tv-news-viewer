var INIT_CODE_EDITORS = false;

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

function setCodeEditorValue(editor, value) {
  editor.setValue(value);
  setTimeout(function() { editor.refresh(); }, 50);
}

function getRandomSample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function isValidQuery(s, macros) {
  try {
    new SearchableQuery(s, macros, false);
  } catch (e) {
    console.log(e);
    return false;
  }
  return true;
}

class Editor {

  constructor(div_id, options) {
    if (!INIT_CODE_EDITORS) {
      addParsingMode('tvnews', {
        no_prefix: true, check_values: true,
        allow_macros: options.enable_query_macros
      });
      addCodeHintHelper('tvnews');
      INIT_CODE_EDITORS = true;
    }

    if (!options) {
      options = {};
    }

    this.div_id = div_id;
    this.enable_query_builder = options.enable_query_builder;
    this.cached_query_builder = null;
    this.code_editors = {};

    $(div_id).find('.add-row-btn').click(() => {this.addRow();});

    let that = this;
    if (options.enable_query_macros) {
      $(div_id).find('.macro-div').each(function() {
        that.macro_editor = CodeMirror($(this)[0], {
          mode: 'text/plain', lineNumbers: true, lineWrapping: true, tabSize: 2,
          autoCloseBrackets:  true, matchBrackets: true, styleActiveLine: true,
          value: '', placeholder: '@old_string new_string'
        });
        that.macro_editor.on('change', function() {
          that._onCodeEditorUpdate();
        });
      });
    }
  }

  _getQueryBuilder() {
    var builder = null;
    if (this.cached_query_builder) {
      builder = this.cached_query_builder;
    } else {
      builder = $(QUERY_BUILDER_HTML);
      let show_select = builder.find(`[name="${SEARCH_KEY.show}"]`);
      ALL_SHOWS.forEach(x => show_select.append($('<option>').val(x).text(x)));
      let name_select = builder.find(`[name="${SEARCH_KEY.face_name}"]`);
      ALL_PEOPLE.forEach(x => name_select.append($('<option>').val(x).text(x)));
      let tag_select = builder.find(`[name="${SEARCH_KEY.face_tag}"]`);
      ALL_GLOBAL_TAGS.forEach(x => tag_select.append($('<option>').val(x).text(x + '*')));
      ALL_PERSON_TAGS.forEach(x => tag_select.append($('<option>').val(x).text(x)));
      this.cached_query_builder = builder;
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

  _loadQueryBuilder(search_table_row) {
    search_table_row.find('.query-td').append(this._getQueryBuilder());
    let data_color = search_table_row.attr('data-color');
    let editor = this.code_editors[data_color];
    let query_builder = search_table_row.find('.query-builder');

    try {
      let parsed_query = new SearchableQuery(editor.getValue(), {}, true);
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
    let that = this;
    query_builder.find('input, select, textarea').change(function() {
      that._onQueryBuilderUpdate(search_table_row);
    });

    // Disable the text box
    search_table_row.find('.code-editor').attr('disable', '');
    this.code_editors[data_color].setOption('readOnly', 'nocursor');
  }

  _closeQueryBuilder(search_table_row) {
    let query_builder = search_table_row.find('.query-builder');
    if (query_builder.length > 0) {
      query_builder.find('.chosen-select').chosen('destroy');
      query_builder.remove();

      // Reenable editing
      let data_color = search_table_row.attr('data-color');
      search_table_row.find('.code-editor').removeAttr('disable');
      this.code_editors[data_color].setOption('readOnly', false);
    }
  }

  _toggleQueryBuilder(search_table_row) {
    if (search_table_row.find('.query-builder').length > 0) {
      this._closeQueryBuilder(search_table_row);
    } else {
      // Close other query builders
      let that = this;
      $(this.div_id).find('.query-builder').each(function() {
        let row = $(this).closest('.query-row');
        that._closeQueryBuilder(row);
      });

      // Load new query builder
      this._loadQueryBuilder(search_table_row);
    }
  }

  _onQueryBuilderUpdate(search_table_row) {
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

    setCodeEditorValue(this.code_editors[data_color], new_query);
  }

  _getColor(start_idx) {
    if (!start_idx) {
      start_idx = 0;
    }
    for (var i = 0; i < DEFAULT_COLORS.length; i++) {
      let color_idx = (i + start_idx) % DEFAULT_COLORS.length;
      if ($(`.search-table tr[data-color='${DEFAULT_COLORS[color_idx]}']`).length == 0) {
        return DEFAULT_COLORS[color_idx];
      }
    }
    throw Error('All colors used');
  }

  _setRemoveButtonsState() {
    let editor = $(this.div_id);
    let state = editor.find('.search-table > tbody > tr').length < 2;
    editor.find('.search-table td').find('button.remove-row-btn').each(function() {
      this.disabled = state;
    });
  }

  _getDefaultQuery() {
    let editor = $(this.div_id);
    if (editor.find('.search-table .query-row').length > 0) {
      let last_row = editor.find('.search-table .query-row:last');
      let last_row_color = last_row.attr('data-color');
      return this.code_editors[last_row_color].getValue();
    } else {
      return '';
    }
  }

  _changeRowColor(search_table_row) {
    let old_color = search_table_row.attr('data-color');
    let old_color_idx = DEFAULT_COLORS.indexOf(old_color);
    let new_color = this._getColor(old_color_idx + 1);
    let code_editor = this.code_editors[old_color];
    search_table_row.find('.color-box').css('background-color', new_color);
    search_table_row.attr('data-color', new_color);
    this.code_editors[new_color] = code_editor;
    delete this.code_editors[old_color];
  }

  _onCodeEditorUpdate() {
    let editor = $(this.div_id);
    var macros = null;
    if (this.macro_editor) {
      try {
        macros = this._parseMacros();
      } catch (e) {
        console.log('Invalid macros:', e);
      }
    }
    Object.entries(this.code_editors).forEach(([data_color, code_editor]) => {
      var err = !isValidQuery(code_editor.getValue(), macros);
      let code_editor_div = editor.find(`tr[data-color="${data_color}"] .code-editor`);
      if (err) {
        code_editor_div.attr('invalid', '');
      } else {
        code_editor_div.removeAttr('invalid');
      }
    });
  }

  _parseMacros() {
    let macros = {};
    this.macro_editor.getValue().split('\n').map($.trim).filter(
      x => x.length > 0
    ).forEach(line => {
      let m = line.match(/^(@[a-zA-Z0-9_]+)\s+(.+)$/);
      if (m) {
        macros[m[1]] = m[2];
      }
    });
    return Object.keys(macros).length > 0 ? macros : null;
  }

  closeQueryBuilders() {
    let that = this;
    $(this.div_id).find('.search-table .query-builder').each(function() {
      let row = $(this).closest('.query-row');
      that._closeQueryBuilder(row);
    });
  }

  reset() {
    let editor = $(this.div_id);
    let that = this;
    this.closeQueryBuilders();

    // Remove all rows except one
    editor.find('.search-table .query-row').each(function() {
      if ($(this).index() > 0) {
        that.removeRow($(this));
      }
    });

    // Reset the last code editor
    Object.values(this.code_editors).forEach(e => e.setValue(''));

    // Reset to defaults
    editor.find('[name="aggregateBy"]').val(DEFAULT_AGGREGATE_BY).trigger("chosen:updated");
    editor.find('[name="startDate"]').val(toDatepickerStr(DEFAULT_START_DATE));
    editor.find('[name="endDate"]').val(toDatepickerStr(DEFAULT_END_DATE));
  }

  getChartOptions() {
    let editor = $(this.div_id);
    let start_date = fromDatepickerStr(editor.find('[name="startDate"]').val());
    let end_date = fromDatepickerStr(editor.find('[name="endDate"]').val());
    if (start_date > end_date) {
      alertAndThrow('Start date cannot exceed end date.');
    }
    return {
      start_date: start_date,
      end_date: end_date,
      aggregate: editor.find('[name="aggregateBy"]').val()
    }
  }

  initChartOptions(chart_options) {
    let editor = $(this.div_id);
    var start_date = DEFAULT_START_DATE;
    var end_date = DEFAULT_END_DATE;
    var aggregate_by = DEFAULT_AGGREGATE_BY;
    if (chart_options) {
      start_date = chart_options.start_date;
      end_date = chart_options.end_date;
      aggregate_by = chart_options.aggregate;
    }
    editor.find('[name="aggregateBy"]').val(aggregate_by);
    editor.find('[name="startDate"]').datepicker({
      format: 'mm/dd/yyyy',
      changeYear: true,
      changeMonth: true,
      startDate: toDatepickerStr(DEFAULT_START_DATE),
      endDate: toDatepickerStr(DEFAULT_END_DATE)
    }).datepicker('setDate', toDatepickerStr(start_date));
    editor.find('[name="endDate"]').datepicker({
      format: 'mm/dd/yyyy',
      changeYear: true,
      changeMonth: true,
      startDate: toDatepickerStr(DEFAULT_START_DATE),
      endDate: toDatepickerStr(DEFAULT_END_DATE)
    }).datepicker('setDate', toDatepickerStr(end_date));
  }

  removeRow(search_table_row) {
    let editor = $(this.div_id);
    if (this.enable_query_builder) {
      this._closeQueryBuilder(search_table_row);
    }
    let color = search_table_row.attr('data-color');
    search_table_row.remove();
    delete this.code_editors[color];
    editor.find('.search-table .add-row-btn').prop('disabled', false);
    this._setRemoveButtonsState();
  }

  addRow(query) {
    let color = _.get(query, 'color', this._getColor());
    let text = _.get(query, 'text', this._getDefaultQuery());

    let that = this;
    let new_row = $('<tr>').addClass('query-row').attr(
      {'data-color': color}
    ).append(
      $('<td>').attr('valign', 'top').append(
        $('<button>').addClass(
          'btn btn-outline-secondary btn-sm remove-row-btn'
        ).attr({
          type: 'button', title: 'Remove this row.'
        }).click(function() {
          let row = $(this).closest('.query-row');
          that.removeRow(row);
        }).text('-')
      ),
      this.enable_query_builder ?
        $('<td>').attr('valign', 'top').append(
          $('<button>').addClass(
            'btn btn-outline-secondary btn-sm toggle-query-builder-btn'
          ).attr({
            title: 'Toggle the dropdown search editor.', type: 'button'
          }).click(function() {
            let row = $(this).closest('.query-row');
            that._toggleQueryBuilder(row);
          }).html('&#x1F50D;')
        ) : null,
      $('<td>').attr('valign', 'top').append(
        $('<div>').addClass('color-box').click(function() {
          let row = $(this).closest('.query-row');
          that._changeRowColor(row);
        }).attr(
          'title', 'Click to change the color.'
        ).css('background-color', color)
      ),
      $('<td>').addClass('query-td').append(
        $('<div>').addClass('code-editor')
      ),
    );

    let code_editor = CodeMirror(new_row.find('.code-editor')[0], {
      mode: 'tvnews', theme: 'tvnews', lineNumbers: false,
      autoCloseBrackets: true, matchBrackets: true,
      lineWrapping: true, noNewlines: true, scrollbarStyle: null,
      placeholder: 'enter search here (all the data, if blank)',
      hintOptions: {hint: CodeMirror.hint.tvnews, completeSingle: false},
      extraKeys: {Enter: search}
    });
    setCodeEditorValue(code_editor, text);
    code_editor.on('cursorActivity', (cm) => {
      let editor = $(this.div_id);
      if (!cm.state.completeActive) {
        // Only show hint if the query builder is closed
        let tmp = Object.entries(that.code_editors).filter(
          ([c, e]) => e == code_editor && e.hasFocus()
        );
        if (tmp.length > 0) {
          let data_color = tmp[0][0];
          let search_table_row = editor.find(`tr[data-color="${data_color}"]`);
          if (search_table_row.find('.query-builder').length == 0) {
            cm.showHint();
          }
        }
      }
    });
    code_editor.on('change', function() {
      that._onCodeEditorUpdate();
    });
    this.code_editors[color] = code_editor;

    let tbody = $(this.div_id).find('.search-table > tbody');
    tbody.append(new_row);

    if (tbody.find('tr').length >= DEFAULT_COLORS.length) {
      $(this.div_id).find('.search-table .add-row-btn').prop('disabled', true);
    }
    this._setRemoveButtonsState();

    new_row.find('.query-row').trigger('change');
  }

  getLines() {
    var macros = null;
    if (this.macro_editor) {
      try {
        macros = this._parseMacros();
      } catch (e) {
        alertAndThrow(`Failed to parse macros: ${e}`);
      }
    }
    let editor = $(this.div_id);
    let queries = [];
    let that = this;
    editor.find('.search-table .query-row').each(function() {
      let color = $(this).attr('data-color');
      var query_str = $.trim(that.code_editors[color].getValue());
      queries.push({
        color: color,
        query: new SearchableQuery(query_str, macros, false)
      });
    });
    return queries;
  }

  getMacros() {
    if (this.macro_editor) {
      try {
        return this._parseMacros();
      } catch (e) {
        alertAndThrow(`Failed to parse macros: ${e}`);
      }
    }
    return null;
  }

  setMacros(macros) {
    if (this.macro_editor) {
      $(this.div_id).find('.macro-div').show();
      let s = Object.entries(macros).map(([k, v]) => k + '\t' + v).join('\n');
      setCodeEditorValue(this.macro_editor, s);
    }
  }
}
