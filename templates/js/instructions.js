function initialize() {
  $('.try-it-btn').click(function() {
    window.open('/?blank=1', '_blank');
  });

  function resizeIFrames() {
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
    setTimeout(resizeIFrames, 100);
  }
  resizeIFrames();
}

function setCodeArea(area, queries) {
  CodeMirror($(area)[0], {
    value: queries.map(x => QUERY_PREFIX + ' ' + x).join('\n'),
    lineNumbers: true, readOnly: 'nocursor', theme: 'elegant'
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
