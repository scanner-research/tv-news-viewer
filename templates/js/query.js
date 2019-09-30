const QUERY_KEYWORDS = {
  and: 'AND',
  normalize: 'NORMALIZE',
  subtract: 'SUBTRACT',
  where: 'WHERE',
  all: 'all'
}

/* FIXME: this grammar is weird due to disabled counting modes */
const QUERY_GRAMMAR = `
Start
  = Blank a:Query Blank "NORMALIZE"i Blank b:Query2 Blank {
    if (b.count_var == null) {
      b.count_var = a.count_var;
    }
    return {main: a, normalize: b};
  }
  / Blank a:Query Blank "SUBTRACT"i Blank b:Query2 Blank {
    if (b.count_var == null) {
      b.count_var = a.count_var;
    }
    return {main: a, subtract: b};
  }
  / Blank a:Query Blank { return {main: a}; }

Query
  = "COUNT"i Blank a:CountVarName Blank "OF"i Blank b:CountClause Blank c:WhereClause ? {
    return {count_var: a, count: b, where: c ? c : {}};
  }
  / "COUNT"i Blank a:CountVarName Blank b:WhereClause ? {
    return {count_var: a, count: null, where: b ? b : {}};
  }
  / a:WhereClause { return {count_var: null, count: null, where: a}; }
  / a:CountClause Blank b:WhereClause ? {
    return {count_var: null, count: a, where: b ? b : {}};
  }
  / Blank {
    return {count_var: null, count: null, where: {}};
  }

Query2
  = "(" Blank a:AndList Blank ")" { return {count_var: null, count: null, where: a}; }
  / a:AndList { return {count_var: null, count: null, where: a}; }
  / "(" Blank a:Query Blank ")" { return a; }
  / a:Query { return a; }

CountVarName
  = '"' s:TokenInclSpace '"' { return s; }
  / "'" s:TokenInclSpace "'" { return s; }
  / CountVarNameTokenList

CountVarNameTokenList
  = & (Blank ReservedWords) { return ''; }
  / a:(Blank TokenNoSpace) b:CountVarNameTokenList { return a.join('') + b; }
  / a:(Blank TokenNoSpace) { return a.join(''); }

CountClause
  = Printable

WhereClause
  = "WHERE"i Blank a:AndList { return a; }
  / "WHERE"i Blank { return {}; }

AndList
  = a:KeyValue Blank "AND"i Blank b:AndList {
      Object.keys(a).forEach(k => {
      if (b.hasOwnProperty(k)) {
        throw Error('Duplicate key in where-clause: ' + k);
      }
      b[k] = a[k];
    });
    return b;
  }
  / a:KeyValue { return a; }

KeyValue
  = k:TokenNoSpace Blank "=" Blank v:Printable {
  	let ret = {};
    ret[k] = v;
  	return ret;
  }

TokenNoSpace
  = s:[a-zA-Z0-9.]+ { return s.join(''); }

TokenInclSpace
  = s:[a-zA-Z0-9. ]+ { return s.join(''); }

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
  = "OF"i / "WHERE"i / "COUNT"i / "NORMALIZE"i / "SUBTRACT"i / "AND"i

Blank
  = [ \t]*
`

QUERY_CLAUSE_GRAMMAR = `
Start
  = Blank q:Query Blank { return q; }

Query
  = "COUNT"i Blank a:CountVarName Blank "OF"i Blank b:Printable Blank c:WhereClause {
  	return {count_var: a, count: b, where: c};
  }
  / "COUNT"i Blank a:CountVarName Blank b:WhereClause {
  	return {count_var: a, count: '', where: b};
  }
  / b:WhereClause {
    return {count_var: null, count: '', where: b};
  }
  / a:Printable Blank b:WhereClause {
    return {count_var: null, count: a, where: b};
  }
  / a:Printable { return {count_var: null, count: a, where: ""};}

WhereClause
  = "WHERE"i Blank a:Any { return a; }
  / a:(("NORMALIZE"i / "SUBTRACT"i) Blank Any) { return a.join(''); }

CountVarName
  = '"' s:TokenInclSpace '"' { return s; }
  / "'" s:TokenInclSpace "'" { return s; }
  / CountVarNameTokenList

CountVarNameTokenList
  = & (Blank ReservedWords) { return ''; }
  / a:(Blank TokenNoSpace) b:CountVarNameTokenList { return a.join('') + b; }
  / a:(Blank TokenNoSpace) { return a.join(''); }

TokenNoSpace
  = s:[a-zA-Z0-9.]+ { return s.join(''); }

TokenInclSpace
  = s:[a-zA-Z0-9. ]+ { return s.join(''); }

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
  = "OF"i / "WHERE"i / "COUNT"i / "NORMALIZE"i / "SUBTRACT"i / "AND"i

Any
  = s:[^]* { return s.join(''); }

Blank
  = s:[ \t]* { return s.join(''); }
`

const QUERY_PARSER = PEG.buildParser(QUERY_GRAMMAR);
const QUERY_CLAUSE_PARSER = PEG.buildParser(QUERY_CLAUSE_GRAMMAR);

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

function parseFaceFilterString(s) {
  let result = {};
  s = $.trim(s).toLowerCase();
  if (s == 'all') {
    result.all = true;
  } else {
    s.split(',').forEach(kv => {
      let [k, v] = $.trim(kv).split(':').map(s => $.trim(s));
      if (k == 'gender' || k == 'role' || k == 'person' || k == 'tag') {
        result[k] = v;
      } else {
        throw Error(`${k} is not a valid filter`);
      }
    });
    if (_.has(result, 'person') && _.has(result, 'tag')) {
      throw Error('Cannot use both "person" and "tag" together');
    }
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

function translateFilterDict(filters, no_err) {
  let result = {};
  Object.keys(filters).forEach(k => {
    let v = filters[k];
    let v_up = v.toUpperCase();
    if (k == '{{ parameters.caption_text }}') {
      result[k] = v;
    } else if (
        k == '{{ parameters.face }}'
        || k.match(/^{{ parameters.onscreen_face }}\d+/)) {
      result[k] = v;
    } else if (k == '{{ parameters.onscreen_numfaces }}') {
      result[k] = parseInt(v);
    } else if (k == '{{ parameters.caption_window }}') {
      let i = parseInt(v);
      if (Number.isNaN(i)) {
        if (!no_err) throw Error(`Invalid window value: ${i}`);
      } else {
        result[k] = i;
      }
    } else if (k == '{{ parameters.channel }}') {
      if (v_up == 'ALL') {
        // pass
      } else if (v_up == 'FOX') {
        result[k] = 'FOXNEWS';
      } else if (v_up == 'CNN' || v_up == 'MSNBC' ||  v_up == 'FOXNEWS') {
        result[k] = v_up;
      } else {
        if (!no_err) throw Error(`Unknown channel: ${v}`);
      }
    } else if (k == '{{ parameters.show }}') {
      if (v_up == 'ALL') {
        // pass
      } else {
        var show = findShow(v);
        if (show) {
          result[k] = show;
        } else {
          if (!no_err) throw Error(`Unknown show: ${v}`);
        }
      }
    } else if (k == '{{ parameters.day_of_week }}'
               || k == '{{ parameters.hour }}') {
      result[k] = v;
    } else if (k == '{{ parameters.is_commercial }}') {
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

function getSortedQueryString(obj) {
  return Object.keys(obj).sort().map(
    k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k])}`
  ).join('&');
}

class SearchableQuery {
  constructor(s, default_count_var, no_err) {

    function getArgs(obj) {
      let count_var = obj.count_var ? obj.count_var : default_count_var;
      var args = translateFilterDict(obj.where ? obj.where : {}, no_err);
      if (obj.count && obj.count.length > 0) {
        if (count_var == '{{ countables.mentions.value }}') {
          if (obj.count != QUERY_KEYWORDS.all) {
            args.text = obj.count;
          }
        } else if (count_var == '{{ countables.facetime.value }}') {
          if (obj.count != QUERY_KEYWORDS.all) {
            args.face = obj.count;
          }
        } else if (count_var == '{{ countables.videotime.value }}') {
          if (obj.count != QUERY_KEYWORDS.all) {
            if (obj.count.length > 0) {
              if (!no_err) throw Error(`Count {{ countables.videotime.value }} only supports WHERE filters. Try removing "${obj.count}"`);
            }
          }
        } else {
          throw Error(`Invalid count mode: ${count_var}`);
        }
      }
      args.count = count_var;
      return args;
    }

    this.default_count_var = default_count_var;
    this.query = s;
    this.normalize_args = null;
    this.subtract_args = null;

    var p;
    if (no_err) {
      try {
        p = QUERY_PARSER.parse(s);
      } catch {
        console.log('Failed to parse:', s);
        p = {main: {count_var: null, count: '', where: null}};
      }
    } else {
      p = QUERY_PARSER.parse(s);
    }
    if (p.normalize) {
      this.normalize_args = getArgs(p.normalize);
    }
    if (p.subtract) {
      this.subtract_args = getArgs(p.subtract);
    }
    this.main_args = getArgs(p.main);
  }

  clauses() {
    return QUERY_CLAUSE_PARSER.parse(this.query);
  }

  search(chart_options, onSuccess, onError) {
    if (this.default_count_var != chart_options.{{ parameters.count }}) {
      throw Error('Count variable changed');
    }

    function getParams(args, detailed) {
      let obj = Object.assign({detailed: detailed}, args);
      obj.{{ parameters.start_date }} = chart_options.start_date;
      obj.{{ parameters.end_date }} = chart_options.end_date;
      obj.{{ parameters.aggregate }} = chart_options.aggregate;
      return getSortedQueryString(obj);
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
      {{ parameters.count }}: this.count,
      {{ parameters.video_ids }}: JSON.stringify(video_ids)
    }, this.main_args);
    return $.ajax({
      url: '/search-videos', type: 'get', data: getSortedQueryString(args)
    }).then(onSuccess).catch(onError);
  }

}
