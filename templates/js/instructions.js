
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

function setIframeSource(iframe, queries, width, height, chart_options) {
  let data = {
    options: chart_options ? chart_options : {
      aggregate: '{{ default_agg_by }}',
      start_date: '{{ start_date }}',
      end_date: '{{ end_date }}'
    },
    queries: queries.map((x, i) => ({
      color:DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      text: x
    }))
  };
  let data_str = encodeURIComponent(JSON.stringify(data));
  let embed_url = `//{{ host }}/embed?width=${width}&height=${height}&data=${data_str}`;
  $(iframe).attr('src', embed_url);
}
