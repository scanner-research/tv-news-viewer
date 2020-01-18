const PAGINATE = true;
const VIDEOS_PER_PAGE = 5;
var SERVE_FROM_INTERNET_ARCHIVE = true;

/* State variables */
var PARAMS = null;
var QUERY = null;
var CURR_PAGE = null;

function getPhrasesToHighlight(query) {
  function token_filter(w) {
    return w.match(/^[0-9a-z\s']+$/i);
  }
  let phrases = new Set();
  if (query.main_query) {
    let visit_queue = [query.main_query];
    while (visit_queue.length > 0) {
      let [k, v] = visit_queue.pop();
      switch (k) {
        case 'and':
        case 'or':
          v.forEach(x => visit_queue.push(x));
          break;
        case SEARCH_KEY.text: {
          v.split(/[&|\^]+/).map($.trim).filter(token_filter).forEach(
            w => { phrases.add(w.toLowerCase()); }
          );
          break;
        }
        case SEARCH_KEY.face_name: {
          v.split(' ').map($.trim).filter(token_filter).forEach(
            w => { phrases.add(w.toLowerCase()); }
          );
          break;
        }
      }
    }
  }
  return phrases;
}

function displayVideos(page_i) {
  // Kill any pending requests
  window.stop();

  let params = PARAMS;
  let query = QUERY;

  var video_ids = params.video_ids;
  if (video_ids.length >= VIDEOS_PER_PAGE) {
    let base_idx = page_i * VIDEOS_PER_PAGE;
    video_ids = video_ids.slice(base_idx, base_idx + VIDEOS_PER_PAGE);
  }

  let n_pages = Math.ceil(params.video_ids.length / VIDEOS_PER_PAGE);

  let page_buttons_div = $('#pageButtons');
  page_buttons_div.show();
  let prev_button = page_buttons_div.find('button[name="previous"]');
  if (page_i > 0) {
    prev_button.click(function() { displayVideos(page_i - 1); }).prop('disabled', false);
  } else {
    prev_button.prop('disabled', true);
  }
  let next_button = page_buttons_div.find('button[name="next"]');
  if (page_i + 1 < n_pages) {
    next_button.click(function() { displayVideos(page_i + 1); }).prop('disabled', false);
  } else {
    next_button.prop('disabled', true);
  }
  page_buttons_div.find('button[name="info"]').text(
    `Page ${(page_i + 1).toLocaleString()} / ${n_pages.toLocaleString()} (${params.video_count.toLocaleString()} videos)`
  );

  let caption_data = {};
  let face_data = {}
  Promise.all(
    video_ids.map(i =>
      $.get(`${CAPTION_ENDPOINT}/${i}`).then(
        resp => caption_data[i] = resp
      ).catch(e => `Failed to get captions: ${i}`)),
    video_ids.map(i =>
      $.get(`${BBOX_ENDPOINT}/${i}.json`).then(
        resp => face_data[i] = resp
      ).catch(e => `Failed to get faces: ${i}`))
  ).then(() => {
    query.searchInVideos(
      video_ids,
      json_data => {
        try {
          $('#videos').empty().append($('<div>').attr('id', `videos-${page_i}`));

          let vgrid_settings = {
            show_timeline: true,
            show_captions: false,
            show_metadata: false,
            paginate: false,
            colors: ['gray', DEFAULT_MALE_COLOR, DEFAULT_FEMALE_COLOR],
            // FIXME: vgrid not using these constants properly
            vblock_constants: {
              timeline_height: 50,
              timeline_height_expanded: 100
            }
          }
          if (SERVE_FROM_INTERNET_ARCHIVE) {
            vgrid_settings.video_endpoint = ARCHIVE_VIDEO_ENDPOINT;
            vgrid_settings.show_timeline_controls = false;
          } else {
            if (VIDEO_ENDPOINT) {
              vgrid_settings.video_endpoint = VIDEO_ENDPOINT;
              vgrid_settings.show_timeline_controls = true;
            }
          }
          highlight_phrases = getPhrasesToHighlight(query);
          renderVGrid(
            `videos-${page_i}`,
            json_data, caption_data, face_data, vgrid_settings,
            SERVE_FROM_INTERNET_ARCHIVE, {
              highlight_phrases: highlight_phrases,
              video_source_link: {
                url: ARCHIVE_ENDPOINT,
                img_url: '/static/img/archive.svg',
                title: 'View at the Internet Archive!'
              }
            }
          );
        } catch (e) {
          alert('Failed to load videos.');
          throw e;
        }
      },
      error => {
        console.log(error);
      }
    );
  });
}

function convertHex(hex, a){
    hex = hex.replace('#', '');
    r = parseInt(hex.substring(0,2), 16);
    g = parseInt(hex.substring(2,4), 16);
    b = parseInt(hex.substring(4,6), 16);
    return `rgba(${r},${g},${b},${a})`;
}

function loadVideos(params, serve_from_internet_archive) {
  // normally chart.js makes this check, this saves an auth check
  SERVE_FROM_INTERNET_ARCHIVE = serve_from_internet_archive;

  PARAMS = params;
  QUERY = new SearchableQuery(PARAMS.query, PARAMS.macros, false);
  CURR_PAGE = 0;

  $('#textInfo').append(
    $('<div>').addClass('query-title').css({
      'border-color': PARAMS.color,
      'background-color': convertHex(PARAMS.color, 0.5)
    }).append(
      QUERY.alias ? [
        $('<span>').text(QUERY.alias), '&nbsp;',
        $('<span>').html('&#9432;').attr('title', QUERY.query)
      ] : $('<code>').text(
        $.trim(QUERY.query) ? QUERY.query : '<blank query: i.e. all the data>'
      )
    )
  );

  if (PARAMS.video_count > 0) {
    $('body').css('min-height', '220px');
    displayVideos(CURR_PAGE);
  } else {
    $('#videos').empty().append(
      $('<p>').css('text-align', 'center').text('No videos to display.')
    );
    $('#pageButtons').hide();
  }
}
