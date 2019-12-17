const PARSING_MODE = 'tvnews';

function initSynaxHighlighting() {
  addParsingMode(PARSING_MODE, {
    allow_free_tokens: true, check_values: true, multi_line: true
  });
}

function setCodeArea(area, queries) {
  CodeMirror($(area)[0], {
    mode: PARSING_MODE, lineNumbers: true, readOnly: 'nocursor',
    theme: 'tvnews', value: queries.map(x => QUERY_PREFIX + ' ' + x).join('\n')
  });
}

function setIframeSource(iframe, queries, editable, chart_options) {
  let data = {
    options: chart_options ? chart_options : {
      aggregate: DEFAULT_AGGREGATE_BY,
      start_date: DEFAULT_START_DATE,
      end_date: DEFAULT_END_DATE
    },
    queries: queries.map((x, i) => ({
      color:DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      text: x
    }))
  };
  let data_str = urlSafeBase64Encode(JSON.stringify(data));
  var embed_url = `//${SERVER_HOST}/embed?`;
  if (editable) {
    embed_url += 'edit=1&';
  }
  embed_url += `data=${data_str}`;
  $(iframe).attr('src', embed_url);
}
