const READ_STATE = {notStarted: 1, inProgress: 2, done: 3};
const KEYWORD_REGEX_STR = 'AND|OR|NORMALIZE|SUBTRACT';
const KEYWORD_REGEX = new RegExp(KEYWORD_REGEX_STR, 'i');
const SPACE_KEYWORD_REGEX = new RegExp(`\\s+(?:${KEYWORD_REGEX_STR})`, 'i');
const VALID_KEYS = Object.values(SEARCH_KEY);

function generateCodeMirrorParser(options) {

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
        if (stream.peek() == ')' || stream.match(SPACE_KEYWORD_REGEX, false)) {
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
          return value.match(CHANNEL_REGEX) ? 'string' : 'error';
        case SEARCH_KEY.show:
          return findInArrayCaseInsensitive(ALL_SHOWS, value) ? 'string' : 'error';
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
            return 'string';
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
            return 'string';
          } else {
            return 'error';
          }
        }
        case SEARCH_KEY.face_tag:
          var err = false;
          value.split(/\s*(?:AND|,)\s*/i).forEach(t => {
            err |= !findInArrayCaseInsensitive(ALL_TAGS, t);
          })
          return err ? 'error' : 'tag';
        case SEARCH_KEY.face_name:
          return findInArrayCaseInsensitive(ALL_PEOPLE, value) ? 'name' : 'error';
        case SEARCH_KEY.face_count:
        case SEARCH_KEY.text_window:
          return value.match(/d+/) ? 'number' : 'error';
        case SEARCH_KEY.text:
          return 'string';
      }
    }
    return 'string';
  }

  return function() {
    function getStartState() {
      return {
        prefix: READ_STATE.notStarted, alias: READ_STATE.notStarted,
        match_next: null, paren_depth: 0, curr_key: null
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
          state.match_next = null;
          return stream.match(pattern) ? null : fail(stream);
        }

        // Prefix state
        if (!options.no_prefix) {
          if (state.prefix == READ_STATE.notStarted) {
            if (stream.match(/COUNT/i)) {
              state.prefix = READ_STATE.inProgress;
              return 'keyword';
            }
          } else if (state.prefix == READ_STATE.inProgress) {
            if (stream.match(/WHERE/i)) {
              state.prefix = READ_STATE.done;
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
        if (state.alias != READ_STATE.done) {
          if (stream.match(/\[([^\]])+\]/)) {
            state.prefix = READ_STATE.done;
            state.alias = READ_STATE.done;
            return null;
          }
        }

        // In key state
        if (state.curr_key) {
          let key = state.curr_key;
          state.curr_key = null;
          return readKey(stream, key);
        }

        // General state
        if (!state.curr_key) {
          if (stream.eatSpace()) {
            return null;
          } else if (stream.eat('(')) {
            state.prefix = READ_STATE.done;
            state.paren_depth += 1;
            return null;
          } else if (stream.eat(')')) {
            state.paren_depth -= 1;
            if (state.paren_depth < 0) {
              fail(stream);
            } else {
              return null;
            }
          } else if (stream.match(KEYWORD_REGEX)) {
            state.prefix = READ_STATE.done;
            return 'keyword';
          } else {
            var token;
            if (token = stream.match(/([^=\s]+)(\s*=)/)) {
              let key = token[1];
              stream.backUp(token[2].length);
              state.prefix = READ_STATE.done;
              state.match_next = /\s*=\s*/;
              state.curr_key = key;
              if (options.check_values) {
                if (VALID_KEYS.indexOf(key) < 0) {
                  return 'error';
                }
              }
              return 'key';
            } else if (options.allow_free_tokens && stream.match(/[^\s]+/)) {
              state.prefix = READ_STATE.done;
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

function addParsingMode(name, options) {
  CodeMirror.defineMode('tvquery', generateCodeMirrorParser(options));
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
