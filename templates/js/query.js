const QUERY_KEYWORDS = {
  and: 'AND',
  normalize: 'NORMALIZE',
  subtract: 'SUBTRACT',
  where: 'WHERE',
  all: 'all'
}

//
// Query grammar
// =============
// Build this using peg.js
//
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

Query2
  = "(" Blank a:Query Blank ")" { return a; }
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
  / a:(Blank PrintableNoSpace) b:PrintableTokenList { return a.join('') + b; }
  / a:(Blank PrintableNoSpace) { return a.join(''); }

PrintableNoSpace
  = a:[^ \t]+ { return a.join(''); }

ReservedWords
  = "OF"i / "WHERE"i / "COUNT"i / "NORMALIZE"i / "SUBTRACT"i

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
  / a:(Blank PrintableNoSpace) b:PrintableTokenList { return a.join('') + b; }
  / a:(Blank PrintableNoSpace) { return a.join(''); }

PrintableNoSpace
  = a:[^ \t]+ { return a.join(''); }

ReservedWords
  = "OF"i / "WHERE"i / "COUNT"i / "NORMALIZE"i / "SUBTRACT"i

Any
  = s:[^]* { return s.join(''); }

Blank
  = s:[ \t]* { return s.join(''); }
`

const QUERY_PARSER = PEG.buildParser(QUERY_GRAMMAR);
const QUERY_CLAUSE_PARSER = PEG.buildParser(QUERY_CLAUSE_GRAMMAR);

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
    } else if (k.match(/^{{ parameters.onscreen_face.value }}\d+/)) {
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
          let face_args = parseFaceTimeString(obj.count, no_err);
          if (face_args.gender) args.gender = face_args.gender;
          if (face_args.role) args.role = face_args.role;
          if (face_args.person) args.person = face_args.person;
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
    if (this.default_count_var != chart_options.{{ parameters.count.value }}) {
      throw Error('Count variable changed');
    }

    function getParams(args, detailed) {
      let obj = Object.assign({detailed: detailed}, args);
      obj.{{ parameters.start_date.value }} = chart_options.start_date;
      obj.{{ parameters.end_date.value }} = chart_options.end_date;
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
                name="{{ parameters.onscreen_face.value }}1:gender" data-width="fit">
          <option value="" selected="selected"></option>
          <option value="all">all; male or female</option>
          <option value="male">male</option>
          <option value="female">female</option>
        </select>
        <select class="selectpicker"
                name="{{ parameters.onscreen_face.value }}1:role" data-width="fit">
          <option value="" selected="selected"></option>
          <option value="host">host</option>
          <option value="non-host">non-host</option>
        </select>
        or person
        <select class="selectpicker"
                name="{{ parameters.onscreen_face.value }}1:person" data-width="fit">
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
