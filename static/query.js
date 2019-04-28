function getQueryOptions(chart_options, query_filters) {
  let options = query_filters;
  options.start_date = chart_options.start_date;
  options.end_date = chart_options.end_date;
  options.aggregate = chart_options.aggregate;
  options.window = chart_options.window;
  return options;
}

function parseFilters(filter_str) {
  let filters = {};
  if (filter_str) {
    filter_str.split(';').forEach(line => {
      line = $.trim(line);
      if (line.length > 0) {
        let i = line.indexOf('=');
        if (i == -1) {
          throw Error(`Invalid filter: ${line}`);
        }
        let k = $.trim(line.substr(0, i));
        var v = $.trim(line.substr(i + 1));
        if (v[0] == '"' && v[v.length - 1] == '"') {
          v = v.substr(1, v.length - 2);
        }
        filters[k] = v;
      }
    });
  }
  return filters;
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

function normalizeFilters(filters) {
  let result = {};
  Object.keys(filters).forEach(k => {
    let v = filters[k];
    let v_up = v.toUpperCase();
    if (k == 'text') {
      result[k] = v;
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
    } else if (k == 'onscreen.face' || k == 'onscreen.id') {
      result[k] = v;
    } else if (k == 'nocomms') {
      result[k] = parseBool(v);
    } else {
      throw Error(`Unknown filter: ${k}`);
    }
  });
  return result;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
