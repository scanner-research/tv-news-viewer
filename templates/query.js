const QUERY_AND = 'AND';
const QUERY_ASSIGN = '=';
const QUERY_NORMALIZE = 'NORMALIZE';
const QUERY_MINUS = 'SUBTRACT';
const QUERY_WHERE = 'WHERE';

const QUERY_ALL_VIDEO = 'all video';
const QUERY_ALL_WORDS = 'all words';
const QUERY_ALL_FACES = 'all faces';

const ALL_SHOWS = [
  {% for show in shows %}"{{ show }}",{% endfor %}
];

const ALL_PEOPLE = [
  {% for person in people %}"{{ person }}",{% endfor %}
];

function parseTernary(s) {
  if (s.match(/^true$/i)) {
    return 'true';
  } else if (s.match(/^false$/i)) {
    return 'false';
  } else if (s.match(/^both$/i)) {
    return 'both';
  } else {
    throw Error(`${s} is neither true, false, nor both`);
  }
}

function parseFaceTimeString(s) {
  let result = {};
  var m;
  if (s == '') {
    // do nothing
  } else if (m = s.match(/^all( ?faces?)?$/i)) {
    result.all = true;
  } else if (m = s.match(/^(wo)?m(e|a)n$/i)) {
    result.gender = m[1] ? 'female' : 'male';
  } else if (m = s.match(/^(fe)?males?$/i)) {
    result.gender = m[1] ? 'female' : 'male';
  } else if (m = s.match(/^((fe)?male)? ?(non-?)?hosts?$/i)) {
    if (m[1]) {
      if (m[2]) {
        result.gender = 'female';
      } else {
        result.gender = 'male';
      }
    }
    if (m[3]) {
      result.role = 'nonhost';
    } else {
      result.role = 'host';
    }
  } else {
    result.person = s;
  }
  return result;
}

function findShow(v) {
  let v_up = v.toUpperCase();
  var show = null;
  for (var i in ALL_SHOWS) {
    if (ALL_SHOWS[i].toUpperCase() == v_up) {
      show = ALL_SHOWS[i];
      break;
    }
  }
  return show;
}

function findPerson(v) {
  let v_up = v.toUpperCase();
  var person = null;
  for (var i in ALL_PEOPLE) {
    if (ALL_PEOPLE[i].toUpperCase() == v_up) {
      person = ALL_PEOPLE[i];
      break;
    }
  }
  return person;
}

function translateFilterDict(filters, no_err) {
  let result = {};
  Object.keys(filters).forEach(k => {
    let v = filters[k];
    let v_up = v.toUpperCase();
    if (k == '{{ parameters.caption_text.value }}') {
      result[k] = v;
    } else if (k.match(/^{{ parameters.onscreen_face.value }}(\d+)?/)) {
      let face_params = parseFaceTimeString(v);
      if (face_params.all) {
        result[k] = 'all';
      } else if (face_params.gender && face_params.role) {
        result[k] = `${face_params.gender}:${face_params.role}`;
      } else if (face_params.gender) {
        result[k] = face_params.gender;
      } else if (face_params.role) {
        result[k] = face_params.role;
      } else {
        var person = findPerson(v);
        if (person) {
          result[k] = `person:${person}`;
        } else {
          if (!no_err) throw Error(`Unknown person: ${v}`);
        }
      }
    } else if (k == '{{ parameters.caption_window.value }}') {
      let i = parseInt(v);
      if (Number.isNaN(i)) {
        if (!no_err) throw Error(`Invalid window value: ${i}`);
      } else {
        result[k] = i;
      }
    } else if (k == '{{ parameters.channel.value }}') {
      if (v_up == 'ALL') {
        // pass
      } else if (v_up == 'FOX') {
        result[k] = 'FOXNEWS';
      } else if (v_up == 'CNN' || v_up == 'MSNBC' ||  v_up == 'FOXNEWS') {
        result[k] = v_up;
      } else {
        if (!no_err) throw Error(`Unknown channel: ${v}`);
      }
    } else if (k == '{{ parameters.show.value }}') {
      if (v_up == 'ALL') {
        // pass
      } else {
        var show = findShow(v);
        if (show) {
          result[k] = show;
        } else {
          throw Error(`Unknown show: ${v}`);
        }
      }
    } else if (k == '{{ parameters.day_of_week.value }}'
               || k == '{{ parameters.hour.value }}') {
      result[k] = v;
    } else if (k == '{{ parameters.is_commercial.value }}') {
      try {
        result[k] = parseTernary(v);
      } catch (e) {
        if (!no_err) throw e;
      }
    } else {
      if (!no_err) throw Error(`Unknown filter: ${k}`);
    }
  });
  return result;
}

function unquoteString(s) {
  if (s.length >= 2) {
    if ((s[0] == '"' && s[s.length - 1] == '"') ||
        (s[0] == '\'' && s[s.length - 1] == '\'')) {
      s = s.substr(1, s.length - 2);
    }
  }
  return s;
}

function parseFilterDict(filters_str, no_err) {
  let filters = {};
  if (filters_str) {
    filters_str.split(QUERY_AND).forEach(line => {
      line = $.trim(line);
      if (line.length > 0) {
        let i = line.indexOf(QUERY_ASSIGN);
        if (i == -1) {
          if (no_err) return;
          throw Error(`Invalid filter: ${line}`);
        }
        let k = $.trim(line.substr(0, i));
        if (filters.hasOwnProperty(k) && !no_err) {
          throw Error(`"${k}" is specified multiple times`)
        } else {
          filters[k] = $.trim(unquoteString($.trim(line.substr(i + 1))));
        }
      }
    });
  }
  return filters;
}

class SearchResult {

  constructor(query, results) {
    this.query = query;
    this.main = results.main;
    this.normalize = _.get(results, 'normalize', null);
    this.subtract = _.get(results, 'subtract', null);
  }

  has_normalization() {
    return this.normalize != null;
  }

  has_subtraction() {
    return this.subtraction != null;
  }

}

class SearchableQuery {
  constructor(s, count, no_err) {

    function parse(s) {
      var params, countable_str;
      var has_where = false;
      if (s.includes(QUERY_WHERE)) {
        let [a, b] = s.split(QUERY_WHERE);
        countable_str = a;
        params = translateFilterDict(parseFilterDict($.trim(b), no_err), no_err);
        has_where = true;
      } else {
        countable_str = s;
        params = {};
      }
      countable_str = $.trim(unquoteString($.trim(countable_str)));
      if (countable_str.length > 0) {
        if (count == '{{ countables.mentions.name }}') {
          if (!countable_str.match(/^all ?words?$/i)) {
            params.text = countable_str;
          }
        } else if (count == '{{ countables.facetime.name }}') {
          let face_params = parseFaceTimeString(countable_str, no_err);
          if (face_params.gender) params.gender = face_params.gender;
          if (face_params.role) params.role = face_params.role;
          if (face_params.person) params.person = face_params.person;
        } else if (count == '{{ countables.videotime.name }}') {
          if (!countable_str.match(/^all ?videos?$/i)) {
            if (!has_where) {
              params = translateFilterDict(
                parseFilterDict($.trim(countable_str), no_err), no_err);
            } else {
              if (countable_str.length > 0) {
                if (!no_err) throw Error(`Count {{ countables.videotime.value }} only supports WHERE filters. Try removing "${countable_str}"`);
              }
            }
          }
        }
      }
      return params;
    }

    this.count = count;
    this.query = s;
    this.normalize_args = null;
    this.subtract_args = null;

    var main_str;
    if (s.includes(QUERY_NORMALIZE)) {
      let [a, b] = s.split(QUERY_NORMALIZE);
      main_str = a;
      this.normalize_args = parse(b);
    } else if (s.includes(QUERY_MINUS)) {
      let [a, b] = s.split(QUERY_MINUS);
      main_str = a;
      this.subtract_args = parse(b);
    } else {
      main_str = s;
    }
    this.main_args = parse(main_str);
  }

  search(chart_options, onSuccess, onError) {
    if (this.count != chart_options.count) {
      throw Error('count type changed');
    }

    function getParams(args, detailed) {
      let obj = Object.assign({detailed: detailed}, args);
      obj.{{ parameters.start_date.value }} = chart_options.start_date;
      obj.{{ parameters.end_date.value }} = chart_options.end_date;
      obj.{{ parameters.count.value }} = chart_options.count;
      obj.{{ parameters.aggregate.value }} = chart_options.aggregate;
      return obj;
    }

    let result = {};

    let promises = [
      $.ajax({
        url: '/search', type: 'get',
        data: getParams(this.main_args, true)
      }).then(resp => result.main = resp)
    ];

    if (this.normalize_args) {
      promises.push(
        $.ajax({
          url: '/search', type: 'get',
          data: getParams(this.normalize_args, false)
        }).then(resp => result.normalize = resp)
      );
    }

    if (this.subtract_args) {
      promises.push(
        $.ajax({
          url: '/search', type: 'get',
          data: getParams(this.subtract_args, false)
        }).then(resp => result.subtract = resp)
      );
    }

    let query_str = this.query;
    return Promise.all(promises).then(
      () => onSuccess(new SearchResult(query_str, result))
    ).catch(onError);
  }

  searchInVideos(video_ids, onSuccess, onError) {
    let args = Object.assign({
      {{ parameters.count.value }}: this.count,
      {{ parameters.video_ids.value }}: JSON.stringify(video_ids)
    }, this.main_args);
    return $.ajax({
      url: '/search-videos',
      type: 'get',
      data: args
    }).then(onSuccess).catch(onError);
  }

}

const QUERY_BUILDER_HTML = `<div class="query-builder">
  <table>
    <tr>
      <th style="text-align: right;">Include results where:</th>
      <th></th>
    </tr>
    <tr>
      <td type="key-col">the channel is</td>
      <td type="value-col">
        <select class="selectpicker" name="{{ parameters.channel.value }}" data-width="fit">
          <option value="" selected="selected">CNN, FOX, or MSNBC</option>
          <option value="CNN">CNN</option>
          <option value="FOX">FOX</option>
          <option value="MSNBC">MSNBC</option>
        </select>
      </td>
    </tr>
    <tr>
      <td type="key-col">the show is</td>
      <td type="value-col">
        <select class="selectpicker" name="{{ parameters.show.value }}" data-width="fit">
          <option value="" selected="selected">All shows</option>
          {% for show in shows %}
          <option value="{{ show }}">{{ show }}</option>
          {% endfor %}
        </select>
      </td>
    </tr>
    <tr>
      <td type="key-col">the hour of day is between</td>
      <td type="value-col"><input type="text" class="form-control no-enter-submit"
          name="{{ parameters.hour.value }}" value="" placeholder="0-23"></td>
    </tr>
    <tr>
      <td type="key-col">the day of week is</td>
      <td type="value-col"><input type="text" class="form-control no-enter-submit"
          name="{{ parameters.day_of_week.value }}" value="" placeholder="mon-sun"></td>
    </tr>
    <tr>
      <td type="key-col">is in commercial</td>
      <td type="value-col">
        <select class="selectpicker" name="{{ parameters.is_commercial.value }}"
                data-width="fit">
          <option value="false" selected="selected">false</option>
          <option value="true">true</option>
          <option value="both">both</option>
        </select>
      </td>
    </tr>
    <tr>
      <td type="key-col">
        (optional) the captions contain
      </td>
      <td type="value-col">
        <input type="text" class="form-control no-enter-submit"
               name="{{ parameters.caption_text.value }}"
               value="" placeholder="keyword or phrase">
        within
        <input type="number" class="form-control no-enter-submit"
               name="{{ parameters.caption_window.value }}"
               min="0" max="3600" placeholder="{{ default_text_window }}"> seconds
      </td>
    </tr>
    <tr>
      <td type="key-col">(optional) an on-screen face matches</td>
      <td type="value-col">
        <select class="selectpicker"
                name="{{ parameters.onscreen_face.value }}:gender" data-width="fit">
          <option value="" selected="selected"></option>
          <option value="all">all; male or female</option>
          <option value="male">male</option>
          <option value="female">female</option>
        </select>
        <select class="selectpicker"
                name="{{ parameters.onscreen_face.value }}:role" data-width="fit">
          <option value="" selected="selected"></option>
          <option value="host">host</option>
          <option value="non-host">non-host</option>
        </select>
        or person
        <select class="selectpicker"
                name="{{ parameters.onscreen_face.value }}:person" data-width="fit">
          <option value="" selected="selected"></option>
          {% for person in people %}
          <option value="{{ person }}">{{ person }}</option>
          {% endfor %}
        </select>
      </td>
    </tr>
    <tr>
      <td type="key-col">(optional) apply default normalization</td>
      <td type="value-col">
        <select class="selectpicker" name="normalize" data-width="fit">
          <option value="false" selected="selected">no</option>
          <option value="true">yes</option>
        </select>
      </td>
    </tr>
    <tr>
      <td></td>
      <td>
        <button type="button" class="btn btn-outline-danger btn-sm"
                onclick="populateQueryBox(this);">populate query</button>
        <button type="button" class="btn btn-outline-secondary btn-sm"
                onclick="toggleQueryBuilder(this);">cancel</button>
      </td>
    </tr>
  </table>
</div>`;
