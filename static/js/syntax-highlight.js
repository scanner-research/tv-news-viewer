const KEYWORDS = ['AND', 'OR', 'NORMALIZE', 'SUBTRACT']

function generateCodeMirrorParser(options) {

  let ReadState = {notStarted: 1, inProgress: 2, done: 3};
  let ValidKeys = Object.values(SEARCH_KEY);

  let keyword_regex = new RegExp('^(' + KEYWORDS.join('|') + ')', 'i');
  let space_keyword_regex = new RegExp(`^\\s+(?:${KEYWORDS.join('|')})`, 'i');

  function fail(stream) {
    if (!stream.skipTo('\n')) {
      stream.skipToEnd();
    }
    return 'error';
  };

  function readKey(stream, key) {
    var value;
    if (stream.peek() == '"') {
      var m;
      if (m = stream.match(/"([^\"]*?)"/)) {
        value = m[1];
      } else {
        return fail(stream);
      }
    } else if (stream.peek() == "'") {
      var m;
      if (m = stream.match(/'([^\']*?)'/)) {
        value = m[1];
      } else {
        return fail(stream);
      }
    } else {
      // Unquoted case
      let buf = [];
      while (!stream.eol()) {
        if (stream.peek() == ')' || stream.match(space_keyword_regex, false)) {
          break;
        }
        buf.push(stream.next());
      }
      if (buf.length == 0) {
        return fail(stream);
      } else {
        value = buf.join('');
      }

      // Push the trailing white space back onto the stream
      let m = value.match(/.+?(\s*)/);
      if (m && m[1]) {
        stream.backUp(m[1].length);
      }
    }

    value = $.trim(value);

    // Best effort highlighting of errors
    if (options.check_values) {
      switch (key) {
        case SEARCH_KEY.channel:
          return value.match(CHANNEL_REGEX) ? 'video' : 'error';
        case SEARCH_KEY.show:
          return findInArrayCaseInsensitive(ALL_SHOWS, value) ? 'video' : 'error';
        case SEARCH_KEY.hour: {
          let m = value.match(HOUR_REGEX);
          if (m) {
            let h0 = parseInt(m[1]);
            if (h0 >= 24) {
              return 'error';
            }
            if (m[2]) {
              let h1 = parseInt(m[2]);
              if (h1 <= h0 || h1 >= 24) {
                return 'error';
              }
            }
            return 'time';
          } else {
            return 'error';
          }
        }
        case SEARCH_KEY.day_of_week: {
          let m = value.match(DAY_OF_WEEK_REGEX);
          if (m) {
            let d0 = DAYS_OF_WEEK.indexOf(m[1]);
            if (d0 < 0) {
              return 'error';
            }
            if (m[2]) {
              let d1 = DAYS_OF_WEEK.indexOf(m[2]);
              if (d1 < 0 || d1 <= d0) {
                return 'error';
              }
            }
            return 'time';
          } else {
            return 'error';
          }
        }
        case SEARCH_KEY.face_tag:
          var err = false;
          value.split(/\s*(?:AND|,)\s*/i).forEach(t => {
            err |= !findInArrayCaseInsensitive(ALL_TAGS, t);
          })
          return err ? 'error' : 'face';
        case SEARCH_KEY.face_name:
          return findInArrayCaseInsensitive(ALL_PEOPLE, value) ? 'face' : 'error';
        case SEARCH_KEY.face_count:
          return value.match(/\d+/) ? 'face' : 'error';
        case SEARCH_KEY.text_window:
          return value.match(/\d+/) ? 'text' : 'error';
        case SEARCH_KEY.text:
          return 'text';
      }
    }
    return 'string';
  }

  function getKeyStyle(key) {
    switch (key) {
      case SEARCH_KEY.face_tag:
      case SEARCH_KEY.face_name:
      case SEARCH_KEY.face_count:
        return 'face-key';
      case SEARCH_KEY.text:
      case SEARCH_KEY.text_window:
        return 'text-key';
      case SEARCH_KEY.channel:
      case SEARCH_KEY.show:
        return 'video-key';
      case SEARCH_KEY.day_of_week:
      case SEARCH_KEY.hour:
        return 'time-key';
      default:
        return 'key';
    }
  }

  return function() {
    function getStartState() {
      return {
        prefix: ReadState.notStarted, alias: ReadState.notStarted,
        match_next: null, match_next_style: null, paren_depth: 0,
        curr_key: null, ready_for_key: true, ready_for_keyword: false
      };
    };
    return {
      startState: getStartState,
      token: function(stream, state) {
        if (options.multi_line && stream.sol()) {
          Object.assign(state, getStartState());
        }

        // Silently consume next
        if (state.match_next) {
          let pattern = state.match_next;
          let style = state.match_next_style;
          state.match_next = null;
          state.match_next_style = null;
          return stream.match(pattern) ? style : fail(stream);
        }

        // Prefix state
        if (!options.no_prefix) {
          if (state.prefix == ReadState.notStarted) {
            if (stream.match(/COUNT/i)) {
              state.prefix = ReadState.inProgress;
              return 'keyword';
            }
          } else if (state.prefix == ReadState.inProgress) {
            if (stream.match(/WHERE/i)) {
              state.prefix = ReadState.done;
              return 'keyword';
            } if (stream.eatSpace()) {
              return null;
            } else if(stream.match(/[^\s]+/)) {
              return null;
            } else {
              return fail(stream);
            }
          }
        }

        // Read user defined alias
        if (state.alias != ReadState.done) {
          if (stream.match(/\[([^\]])+\]/)) {
            state.prefix = ReadState.done;
            state.alias = ReadState.done;
            return null;
          }
        }

        // In key state
        if (state.curr_key) {
          let key = state.curr_key;
          state.curr_key = null;
          state.ready_for_keyword = true;
          return readKey(stream, key);
        }

        // General state
        if (!state.curr_key) {
          if (stream.eatSpace()) {
            return null;
          } else if (stream.eat('(')) {
            state.prefix = ReadState.done;
            state.paren_depth += 1;
            state.ready_for_key = true;
            state.ready_for_keyword = false;
            return null;
          } else if (stream.eat(')')) {
            state.prefix = ReadState.done;
            state.ready_for_key = true;
            state.ready_for_keyword = true;
            state.paren_depth -= 1;
            if (state.paren_depth < 0) {
              fail(stream);
            } else {
              return null;
            }
          } else if (stream.match(keyword_regex)) {
            if (!state.ready_for_keyword) {
              return fail(stream);
            }
            state.prefix = ReadState.done;
            state.ready_for_key = true;
            state.ready_for_keyword = false;
            return 'keyword';
          } else {
            var token;
            if (token = stream.match(/([^=\s]+)(\s*=)/)) {
              if (!state.ready_for_key) {
                return fail(stream);
              }
              let key = token[1].toLowerCase();
              let style = getKeyStyle(key);
              stream.backUp(token[2].length);
              state.prefix = ReadState.done;
              state.match_next = /\s*=\s*/;
              state.match_next_style = style;
              state.curr_key = key;
              state.ready_for_key = false;
              state.ready_for_keyword = false;
              if (options.check_values && !options.allow_free_tokens) {
                if (ValidKeys.indexOf(key) < 0) {
                  return 'error';
                }
              }
              return style;
            } else if (options.allow_free_tokens && stream.match(/[^\s]+/)) {
              state.prefix = ReadState.done;
              state.ready_for_key = false;
              state.ready_for_keyword = true;
              return null;
            } else {
              return fail(stream);
            }
          }
        }
        return fail(stream);
      }
    };
  }
}

function reverseString(str) {
  return str.split('').reverse().join('');
}

function addParsingMode(name, options) {
  CodeMirror.defineMode(name, generateCodeMirrorParser(options));
}

function addCodeHintHelper(name) {
  let token_chars_regex = /[\w\-|&$]/;

  let keywords_regex_str = KEYWORDS.join('|');
  let keywords_regex = new RegExp('^(' + keywords_regex_str + ')$', 'i');
  let inv_keywords_regex_str = reverseString(keywords_regex_str);

  let unit_suffix_regex = new RegExp(`^(.*?)(?:["')(?:$=]|\s*(${keywords_regex_str}))`, 'i');
  let unit_inv_prefix_regex_1 = new RegExp(`^\\s*(?:${inv_keywords_regex_str})`, 'i');
  let unit_inv_prefix_regex_2 = new RegExp(`^(.*?)[="')($]`);

  let search_keys = Object.values(SEARCH_KEY).filter(x => x != SEARCH_KEY.video);
  let searck_keys_regex_str = search_keys.join('|');
  let search_keys_regex = new RegExp('^(' + searck_keys_regex_str + ')$', 'i');

  let unquoted_value_suffix_regex = new RegExp(`^(.*?)\\s*(?:[()$]|${keywords_regex_str})`, 'i');
  let should_propose_key_regex = new RegExp(`(?:[()]|${keywords_regex_str})(\\s*)$`, 'i');

  let hours = [];
  for (var i = 0; i < 24; i++) {
    hours.push(`${i}`);
  }

  function getValuesForKey(key, prefix) {
    var values = [];
    switch (key) {
      case SEARCH_KEY.channel:
        values = CHANNELS;
        break;
      case SEARCH_KEY.show:
        values = ALL_SHOWS;
        break;
      case SEARCH_KEY.face_name:
        values = ALL_PEOPLE;
        break;
      case SEARCH_KEY.face_tag:
        values = ALL_TAGS;
        break;
      case SEARCH_KEY.day_of_week:
        values = DAYS_OF_WEEK;
        break;
      case SEARCH_KEY.hour:
        values = hours;
        break;
      default:
        break;
    }
    if (prefix) {
      let prefix_regex = new RegExp('^' + prefix, 'i');
      let partial_matches = values.filter(x => x.match(prefix_regex));
      if (partial_matches.length > 0) {
        values = partial_matches;
      }
    }
    return values.filter(x => x.length > 0);
  }

  CodeMirror.registerHelper('hint', name, function(editor) {
    let cursor = editor.getCursor();
    let line = editor.getLine(cursor.line);
    var start = cursor.ch;
    var end = start;

    if ($.trim(line).length == 0) {
      return {
        list: search_keys.map(x => `${x}=`),
        from: CodeMirror.Pos(cursor.line, end),
        to: CodeMirror.Pos(cursor.line, end)
      }
    }

    // Find the extent of the current token that we are in
    while (end < line.length && token_chars_regex.test(line.charAt(end))) {
      ++end;
    }
    while (start && token_chars_regex.test(line.charAt(start - 1))) {
      --start;
    }
    var curr_unit = line.slice(start, end);

    var suffix = line.substring(end);
    var inv_prefix = reverseString(line.substring(0, start));

    if (inv_prefix.match(/^.*?\[/) && prefix.match(/^.*?\]/)) {
      // Inside the alias
      return null;
    }

    console.log(0, curr_unit);
    if (curr_unit.match(keywords_regex)) {
      return $.trim(suffix).length > 0 ? null : {
        list: search_keys.map(x => ` ${x}=`),
        from: CodeMirror.Pos(cursor.line, end),
        to: CodeMirror.Pos(cursor.line, end)
      };
    }
    console.log(1, curr_unit);

    // Extend current unit
    if (match = suffix.match(unit_suffix_regex)) {
      end += match[1].length;
    }
    if (match = inv_prefix.match(unit_inv_prefix_regex_1)) {
      // hit a keyword
    } else if (match = inv_prefix.match(unit_inv_prefix_regex_2)) {
      // hit a special token
      start -= match[1].length;
    }

    curr_unit = line.slice(start, end);
    suffix = line.substring(end);
    inv_prefix = reverseString(line.substring(0, start));

    console.log(2, curr_unit);
    if ($.trim(curr_unit).match(search_keys_regex)) {
      // cursor is in a key
      let key = curr_unit;
      var values = getValuesForKey(key).map(x => `"${x}"`);
      if (match = suffix.match(/^\s*=/)) {
        end += match[0].length;
        curr_unit = line.slice(start, end);
      } else {
        values = values.map(x => '=' + x);
      }
      suffix = line.substring(end);

      if (match = suffix.match(/^\s*(?:".*?"|'.*?'|["'].*?$)/)) {
        // Overwrite existing quoted value
        return {
          list: values,
          from: CodeMirror.Pos(cursor.line, end),
          to: CodeMirror.Pos(cursor.line, end + match[0].length)
        }
      } else if (match = suffix.match(unquoted_value_suffix_regex)) {
        // Overwrite existing unquoted value
        return {
          list: values,
          from: CodeMirror.Pos(cursor.line, end),
          to: CodeMirror.Pos(cursor.line, end + match[1].length)
        }
      } else {
        // No existing value
        return {
          list: values,
          from: CodeMirror.Pos(cursor.line, end),
          to: CodeMirror.Pos(cursor.line, end)
        }
      }
    }

    console.log(3, curr_unit);
    // Find the extent of the current value string
    if (match = inv_prefix.match(/^(.*?)(["'=])/)) {
      var quote_char = match[2] == '=' ? null : match[2];
      if (quote_char && inv_prefix.split(quote_char).length % 2 == 0) {
        // Dilate until quote
        start -= match[1].length;
      } else {
        quote_char = null;
        if (match = inv_prefix.match(new RegExp(`^(.*?)\\w*([=()$]|${inv_keywords_regex_str})`))) {
          // Do not dilate past keywords or special characters
          start -= match[1].length;
        }
      }
      if (quote_char) {
        match = suffix.match(new RegExp(`^(.*?)(?:\\w+=|${quote_char})`));
      } else {
        match = suffix.match(unquoted_value_suffix_regex);
      }
      if (match) {
        end += match[1].length;
      }
    }

    curr_unit = line.slice(start, end);
    suffix = line.substring(end);
    inv_prefix = reverseString(line.substring(0, start));

    console.log(4, curr_unit);
    if (match = inv_prefix.match(/^(["'])?\s*=/)) {
      // cursor is in a value
      let key = reverseString(inv_prefix.match(/\s*=\s*(\w+)/)[1]);
      var values = [];
      if (key.match(search_keys_regex)) {
        values = getValuesForKey(key, curr_unit).map(v => `"${v}"`);
      }
      if (match[1]) {
        start--;
      }
      if (suffix.match(/^["']/)) {
        end++;
      }
      return {
        list: values,
        from: CodeMirror.Pos(cursor.line, start),
        to: CodeMirror.Pos(cursor.line, end)
      }
    } else {
      if ($.trim(suffix).length == 0 &&
          (match = curr_unit.match(should_propose_key_regex))) {
        // Propose a new key filter
        let padding = match[1] ? '' : ' ';
        let values = search_keys.map(x => `${padding}${x}=`);
        return {
          list: values,
          from: CodeMirror.Pos(cursor.line, end),
          to: CodeMirror.Pos(cursor.line, end)
        }
      }

      let curr_unit_re = new RegExp('^' + $.trim(curr_unit));
      let candidate_keys = search_keys.filter(x => x.match(curr_unit_re));
      if (candidate_keys.length > 0) {
        match = curr_unit.match(/(\s*).*?(\s*)/);
        return {
          list: candidate_keys,
          from: CodeMirror.Pos(
            cursor.line, end - curr_unit.length + match[1].length),
          to: CodeMirror.Pos(cursor.line, end - match[2].length)
        }
      }

      if (match = inv_prefix.match(/^(\s*)[)"']/)) {
        // Propose a new conjunction
        let padding = match[1] ? '' : ' ';
        return {
          list: ['AND ', 'OR '].map(x => padding + x),
          from: CodeMirror.Pos(cursor.line, end),
          to: CodeMirror.Pos(cursor.line, end)
        }
      }
    }
  });
}

// Copyright 2017 Isaac Evavold
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal in
// the Software without restriction, including without limitation the rights to
// use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
// the Software, and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
// FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
// IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

(function(mod) {
  if (typeof exports === 'object' && typeof module === 'object') {
    // CommonJS
    mod(require('codemirror'))
  } else if (typeof define === 'function' && define.amd) {
    // AMD
    define(['codemirror'], mod)
  } else {
    // Plain browser
    mod(CodeMirror)
  }
})(function(CodeMirror) {
  function beforeChange (cm, event) {
    // Identify typing events that add a newline to the buffer.
    var hasTypedNewline = (
      event.origin ==='+input' &&
      typeof event.text === 'object' &&
      event.text.join('') === '')

    // Prevent newline characters from being added to the buffer.
    if (hasTypedNewline) {
      return event.cancel()
    }

    // Identify paste events.
    var hasPastedNewline = (
      event.origin === 'paste' &&
      typeof event.text === 'object' &&
      event.text.length > 1)

    // Format pasted text to replace newlines with spaces.
    if (hasPastedNewline) {
      var newText = event.text.join(' ')
      return event.update(null, null, [newText])
    }

    return null
  }

  CodeMirror.defineOption('noNewlines', false, function (cm, val, old) {
    // Handle attaching/detaching event listners as necessary.
    if (val === true && old !== true) {
      cm.on('beforeChange', beforeChange)
    } else if (val === false && old === true) {
      cm.off('beforeChange', beforeChange)
    }
  })
})
