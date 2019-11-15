const PARSING_MODE = 'tvnews';

function initialize() {
  addParsingMode(PARSING_MODE, {
    allow_free_tokens: true, check_values: false, multi_line: true
  });

  $('.try-it-btn').click(function() {
    window.open('/?blank=1', '_blank');
  });

  setInterval(() => {
    $('iframe').each(function() {
      let iframe = $(this)[0];
      if (iframe && document.contains(iframe)) {
        $(iframe).ready(function() {
          if (iframe.contentWindow.document.body) {
            iframe.height = iframe.contentWindow.document.body.scrollHeight + 1;
          }
        });
      }
    });
  }, 100);
}

function setCodeArea(area, queries) {
  CodeMirror($(area)[0], {
    mode: PARSING_MODE, lineNumbers: true, readOnly: 'nocursor', theme: 'tvnews'
    value: queries.map(x => QUERY_PREFIX + ' ' + x).join('\n'),

  });
}

function setIframeSource(iframe, queries, width, height, chart_options) {
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
  let data_str = encodeURIComponent(JSON.stringify(data));
  let embed_url = `//${SERVER_HOST}/embed?width=${width}&height=${height}&data=${data_str}`;
  $(iframe).attr('src', embed_url);
}
