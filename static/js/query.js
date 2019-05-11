const QUERY_DELIM = 'AND';
const QUERY_ASSIGN = '=';
const QUERY_NORMALIZE = 'NORMALIZE';
const QUERY_MINUS = 'SUBTRACT';

function parseBool(s) {
  s = s.toUpperCase();
  if (s == 'TRUE') {
    return true;
  } else if (s == 'FALSE') {
    return false;
  } else {
    throw Error(`${s} is neither true or false`);
  }
}

function translateFilterDict(filters) {
  let result = {};
  Object.keys(filters).forEach(k => {
    let v = filters[k];
    let v_up = v.toUpperCase();
    if (k == 'text' || k == 'caption.text'
        || k == 'role' || k == 'gender' || k == 'onscreen.face'
        || k == 'person' || k == 'onscreen.person') {
      result[k] = v;
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
    } else if (k == 'commercials') {
      result[k] = parseBool(v);
    } else {
      throw Error(`Unknown filter: ${k}`);
    }
  });
  return result;
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
        var v = $.trim(line.substr(i + 1));
        if ((v[0] == '"' && v[v.length - 1] == '"') ||
            (v[0] == '\'' && v[v.length - 1] == '\'')) {
          v = v.substr(1, v.length - 2);
        }
        filters[k] = v;
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
      return translateFilterDict(parseFilterDict($.trim(s)));
    }

    this.count = count;
    this.query = s;
    this.normalize_args = null;
    this.subtract_args = null;

    var main_str;
    if (s.includes(QUERY_NORMALIZE)) {
      let parts = s.split(QUERY_NORMALIZE);
      main_str = parts[0];
      this.normalize_args = parse(parts[1]);
    } else if (s.includes(QUERY_MINUS)) {
      let parts = s.split(QUERY_MINUS);
      main_str = parts[0];
      this.subtract_args = parse(parts[1]);
    } else {
      main_str = s;
    }
    this.main_args = parse(main_str);
  }

  search(chart_options, onSuccess, onError) {
    if (this.count != chart_options.count) {
      throw 'count type changed';
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
