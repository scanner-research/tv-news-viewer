const QUERY_KEYWORDS = {
  and: 'AND',
  or: 'OR',
  normalize: 'NORMALIZE',
  subtract: 'SUBTRACT',
  all: 'all'
}

const QUERY_GRAMMAR = `
Start
  = Blank "[" Blank a:Alias Blank "]" Blank b:Query Blank {
    b.alias = a;
    return b;
  }
  / Blank a:Query Blank { return a; }

Alias
  = a:[^\\]]+ { return a.join(''); }

Query
  = a:SingleQuery Blank "NORMALIZE"i Blank b:SingleQuery {
    return {main: a, normalize: b, has_normalize: true};
  }
  / a:SingleQuery Blank "SUBTRACT"i Blank b:SingleQuery {
    return {main: a, subtract: b, has_subtract: true};
  }
  / a:SingleQuery { return {main: a}; }

SingleQuery
  = a:Node { return a; }
  / "(" Blank a:Node Blank ")" { return a; }
  / "" { return null; }

Node
  = a:NodeOrKeyValue Blank "AND"i Blank b:AndList {
  	return ['and', [a].concat(b)];
  }
  / a:NodeOrKeyValue Blank "OR"i Blank b:OrList {
  	return ['or', [a].concat(b)];
  }
  / a:NodeOrKeyValue { return a; }

AndList
  = a:NodeOrKeyValue Blank "AND"i Blank b:AndList {
	return [a].concat(b);
  }
  / a:NodeOrKeyValue { return [a]; }

OrList
  = a:NodeOrKeyValue Blank "OR"i Blank b:OrList {
	return [a].concat(b);
  }
  / a:NodeOrKeyValue { return [a]; }

NodeOrKeyValue
  = a:KeyValue { return a; }
  / "(" Blank a:Node Blank ")" { return a; }

KeyValue
  = k:TokenNoSpace Blank "=" Blank v:Printable { return [k, v]; }

TokenNoSpace
  = s:[a-zA-Z0-9.]+ { return s.join(''); }

Printable
  = "'" s:[^']* "'" { return s.join(''); }
  / '"' s:[^"]* '"' { return s.join(''); }
  / PrintableTokenList

PrintableTokenList
  = & (Blank ReservedWords) { return ''; }
  / a:(Blank PrintableNoDelim) b:PrintableTokenList { return a.join('') + b; }
  / a:(Blank PrintableNoDelim) { return a.join(''); }

PrintableNoDelim
  = a:[^ \t)]+ { return a.join(''); }

ReservedWords
  = "NORMALIZE"i / "SUBTRACT"i / "AND"i / "OR"i

Blank
  = [ \t]*
`

const QUERY_PARSER = PEG.buildParser(QUERY_GRAMMAR);

class QueryParseError extends Error {}

class SearchResult {

  constructor(query, alias, results) {
    this.query = query;
    this.alias = alias;
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

function findCaseInsInArr(arr, v) {
  let v_up = v.toUpperCase();
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].toUpperCase() == v_up) {
      return arr[i];
    }
  }
  return null;
}


function parseTernary(s) {
  if (s.match(/^true$/i)) {
    return 'true';
  } else if (s.match(/^false$/i)) {
    return 'false';
  } else if (s.match(/^both$/i)) {
    return 'both';
  } else {
    throw new QueryParseError(`${s} is neither true, false, nor both`);
  }
}

function validateKeyValue(key, value, no_err) {
  key = key.toLowerCase();
  let getKVError = () => new QueryParseError(`Unknown ${key}: ${value}`);
  switch (key) {
    case '{{ search_keys.text }}':
      break;
    case '{{ search_keys.text_window }}': {
      if (value.match(/^[0-9]+$/)) {
        value = parseInt(value);
      } else {
        throw new QueryParseError(`${key} must be an integer`);
      }
      break;
    }
    case '{{ search_keys.face_name }}': {
      let name = findCaseInsInArr(ALL_PEOPLE, value);
      if (name) {
        value = name;
      } else {
        throw getKVError();
      }
      break;
    }
    case '{{ search_keys.face_tag }}': {
      value = value.split(',').map(t => {
        let tt = findCaseInsInArr(ALL_TAGS, $.trim(t));
        if (!tt) {
          throw new QueryParseError(`Unknown ${key}: ${t}`)
        }
        return tt;
      }).join(',');
      break;
    }
    case '{{ search_keys.face_count }}': {
      if (value.match(/^[0-9]+$/)) {
        value = parseInt(value);
        if (value == 0) {
          throw new QueryParseError(`${key} must be greater than 0`);
        }
      } else {
        throw new QueryParseError(`${key} must be an integer`);
      }
      break;
    }
    case '{{ search_keys.channel }}': {
      let v_up = value.toUpperCase();
      switch (v_up) {
        case 'CNN':
        case 'MSNBC':
        case 'FOXNEWS':
          value = v_up;
          break;
        case 'FOX':
          value = 'FOXNEWS';
          break;
        default:
          throw getKVError();
      }
      break;
    }
    case '{{ search_keys.show }}': {
      let show = findCaseInsInArr(ALL_SHOWS, value);
      if (show) {
        value = show;
      } else {
        throw getKVError();
      }
      break;
    }
    case '{{ search_keys.video }}':
    case '{{ search_keys.hour }}':
    case '{{ search_keys.day_of_week }}':
      break;
    case '{{ params.is_commercial }}': {
      value = parseTernary(value);
      break;
    }
    default:
      throw new QueryParseError('Unknown key: ' + key);
  }
  return [key, value];
}

function validateQuery(query, no_err) {
  if (query == null) {
    return null;
  }
  let [k, v] = query;
  switch (k) {
    case 'and':
    case 'or':
      // Flatten one layer of nesting
      return [k, v.map(
        x => _.flatMap(validateQuery(x, no_err), c => c[0] == k ? c : [c]))];
    default:
      return validateKeyValue(k, v, no_err);
  }
}

function getSortedQueryString(obj) {
  return Object.keys(obj).sort().map(
    k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`
  ).join('&');
}

class SearchableQuery {
  constructor(s, no_err) {
    this.query = s;
    this.has_norm = false;
    this.norm_query = null;
    this.has_sub = false;
    this.sub_query = null;
    this.main_query = null;
    this.alias = null;

    var p;
    if (no_err) {
      try {
        p = QUERY_PARSER.parse(s);
      } catch {
        console.log('Failed to parse:', s);
        p = {main: null};
      }
    } else {
      p = QUERY_PARSER.parse(s);
    }
    if (p.has_normalize) {
      this.has_norm = true;
      this.norm_query = validateQuery(p.normalize, no_err);
    }
    if (p.has_sub) {
      this.has_sub = true;
      this.sub_query = validateQuery(p.subtract, no_err);
    }
    if (p.alias) {
      this.alias = p.alias;
    }
    this.main_query = validateQuery(p.main, no_err);
  }

  search(chart_options, onSuccess, onError) {
    function getParams(query, detailed) {
      let obj = {
        detailed: detailed,
        {{ params.start_date }}: chart_options.start_date,
        {{ params.end_date }}: chart_options.end_date,
        {{ params.aggregate }}: chart_options.aggregate
      }
      if (query) {
        obj.query = JSON.stringify(query);
      }
      return getSortedQueryString(obj);
    }

    let result = {};

    let promises = [
      $.ajax({
        url: '/search', type: 'get', data: getParams(this.main_query, true),
        error: onError
      }).then(resp => result.main = resp)
    ];

    if (this.has_norm) {
      promises.push(
        $.ajax({
          url: '/search', type: 'get', data: getParams(this.norm_query, false),
          error: onError
        }).then(resp => result.normalize = resp)
      );
    }

    if (this.has_sub) {
      promises.push(
        $.ajax({
          url: '/search', type: 'get', data: getParams(this.sub_query, false),
          error: onError
        }).then(resp => result.subtract = resp)
      );
    }

    let query_str = this.query;
    let query_alias = this.alias;
    return Promise.all(promises).then(
      () => onSuccess(new SearchResult(query_str, query_alias, result))
    ).catch(function() {
      Console.log('Uh oh. Something went wrong.');
    });
  }

  searchInVideos(video_ids, onSuccess, onError) {
    let args = {
      {{ params.video_ids }}: JSON.stringify(video_ids),
    };
    if (this.main_query) {
      args.query = JSON.stringify(this.main_query);
    }
    return $.ajax({
      url: '/search-videos', type: 'get', data: getSortedQueryString(args)
    }).then(onSuccess).catch(onError);
  }

}
