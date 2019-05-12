const QUERY_DELIM = 'AND';
const QUERY_ASSIGN = '=';
const QUERY_NORMALIZE = 'NORMALIZE';
const QUERY_MINUS = 'SUBTRACT';
const QUERY_WHERE = 'WHERE';

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

function parseIsCommercialString(s) {

}

function parseFaceTimeString(s) {
  let result = {};
  var m;
  if (s == '') {
    // do nothing
  } else if (m = s.match(/^all$/i)) {
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

function translateFilterDict(filters) {
  let result = {};
  Object.keys(filters).forEach(k => {
    let v = filters[k];
    let v_up = v.toUpperCase();
    if (k == 'caption.text') {
      result[k] = v;
    } else if (k == 'onscreen.face') {
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
        result['onsreen.person'] = face_params.person;
      }
    } else if (k == 'caption.window') {
      result[k] = parseInt(v);
    } else if (k == 'channel') {
      if (v_up == 'ALL') {
        // pass
      } else if (v_up == 'FOX') {
        result.channel = 'FOXNEWS';
      } else if (v_up == 'CNN' || v_up == 'MSNBC' ||  v_up == 'FOXNEWS') {
        result.channel = v_up;
      } else {
        throw Error(`Unknown channel: ${v}`);
      }
    } else if (k == 'show') {
      if (v_up == 'ALL') {
        // pass
      } else {
        var show = null;
        for (var i in ALL_SHOWS) {
          if (ALL_SHOWS[i].toUpperCase() == v_up) {
            show = ALL_SHOWS[i];
            break;
          }
        }
        if (show) {
          result.show = show;
        } else {
          throw Error(`Unknown show: ${v}`);
        }
      }
    } else if (k == 'dayofweek' || k == 'hour') {
      if (v_up == 'ALL') {
        // pass
      } else {
        result[k] = v;
      }
    } else if (k == 'iscommercial') {
      result[k] = parseTernary(v);
    } else {
      throw Error(`Unknown filter: ${k}`);
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

function parseFilterDict(filters_str) {
  let filters = {};
  if (filters_str) {
    filters_str.split(QUERY_DELIM).forEach(line => {
      line = $.trim(line);
      if (line.length > 0) {
        let i = line.indexOf(QUERY_ASSIGN);
        if (i == -1) {
          throw Error(`Invalid filter: ${line}`);
        }
        let k = $.trim(line.substr(0, i));
        if (filters.hasOwnProperty(k)) {
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
  constructor(s, count) {

    function parse(s) {
      var params, countable_str;
      var has_where = false;
      if (s.includes(QUERY_WHERE)) {
        let [a, b] = s.split(QUERY_WHERE);
        countable_str = a;
        params = translateFilterDict(parseFilterDict($.trim(b)));
        has_where = true;
      } else {
        countable_str = s;
        params = {};
      }
      countable_str = $.trim(unquoteString($.trim(countable_str)));
      if (countable_str.length > 0) {
        if (count == 'mentions') {
          params.text = countable_str;
        } else if (count == 'facetime') {
          let face_params = parseFaceTimeString(countable_str);
          if (face_params.gender) params.gender = face_params.gender;
          if (face_params.role) params.role = face_params.role;
          if (face_params.person) params.person = face_params.person;
        } else if (count == 'videotime') {
          if (!has_where) {
            params = translateFilterDict(parseFilterDict($.trim(countable_str)));
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
      obj.start_date = chart_options.start_date;
      obj.end_date = chart_options.end_date;
      obj.count = chart_options.count;
      obj.aggregate = chart_options.aggregate;
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
    let args = Object.assign(
      {count: this.count, ids: JSON.stringify(video_ids)}, this.main_args);
    return $.ajax({
      url: '/search-videos',
      type: 'get',
      data: args
    }).then(onSuccess).catch(onError);
  }

}
