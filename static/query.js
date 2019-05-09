const QUERY_DELIM = 'AND';
const QUERY_ASSIGN = '=';
const QUERY_NORMALIZE = 'NORMALIZE';
const QUERY_MINUS = 'MINUS';

function getQueryOptions(chart_options, query_filters) {
  let options = query_filters;
  options.start_date = chart_options.start_date;
  options.end_date = chart_options.end_date;
  options.count = chart_options.count;
  options.aggregate = chart_options.aggregate;
  return options;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

function standardizeFilters(filters) {
  let result = {};
  Object.keys(filters).forEach(k => {
    let v = filters[k];
    let v_up = v.toUpperCase();
    if (k == 'text' || k == 'captions.text'
        || k == 'role' || k == 'gender' || k == 'onscreen.face'
        || k == 'person' || k == 'onscreen.person') {
      result[k] = v;
    } else if (k == 'captions.window') {
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

function parseFilters(filters_str) {
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

function parseSingleQuery(s) {
  return standardizeFilters(parseFilters($.trim(s)))
}

// TODO: this needs a real parser
function parseQueryString(s) {
  let result = {}
  if (s.includes(QUERY_NORMALIZE)) {
    subqueries = s.split(QUERY_NORMALIZE);
    result.norm_query = parseSingleQuery(subqueries[1]);
  } else if (s.includes(QUERY_MINUS)) {
    subqueries = s.split(QUERY_MINUS);
    result.minus_query = parseSingleQuery(subqueries[1]);
  } else {
    subqueries = [s];
  }
  result.main_query = parseSingleQuery(subqueries[0]);
  return result
}
