const PAGINATE = true;
const VIDEOS_PER_PAGE = 5;
var USE_ARCHIVE = true;
var PARAMS = null;
var QUERY = null;
var CURR_PAGE = null;

function getPhrasesToHighlight(query) {
  function token_filter(w) {
    return w.match(/^[0-9a-z\s]+$/i);
  }
  let phrases = new Set();
  Object.entries(query.main_args).forEach(([k, v]) => {
    if (k == '{{ parameters.caption_text }}') {
      v.split(/[&|\^]+/).map($.trim).filter(token_filter).forEach(w => { phrases.add(w.toLowerCase()); });
    } else if (k != '{{ parameters.onscreen_numfaces }}' &&
               k.startsWith('{{ parameters.onscreen_face }}')) {
      let f = parseFaceFilterString(v.toLowerCase());
      if (f.person) {
        f.person.split(' ').map($.trim).filter(token_filter).forEach(w => { phrases.add(w.toLowerCase()); });
      }
    }
  });
  return phrases;
}

function displayVideos(page_i) {
  let params = PARAMS;
  let query = QUERY;
  let count_var = params.count;

  var video_ids = params.video_ids;
  if (video_ids.length >= VIDEOS_PER_PAGE) {
    let base_idx = page_i * VIDEOS_PER_PAGE;
    video_ids = video_ids.slice(base_idx, base_idx + VIDEOS_PER_PAGE);
  }

  let n_pages = Math.ceil(params.video_ids.length / VIDEOS_PER_PAGE);

  let page_buttons_div = $("#page-buttons");
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
    `Page ${(page_i + 1).toLocaleString()} / ${n_pages.toLocaleString()}. (${params.video_count.toLocaleString()} videos)`
  );
  console.log('Executing query:', query);

  let caption_data = {};
  let face_data = {}
  Promise.all(
    video_ids.map(i =>
      $.get(`/captions/${i}`).then(
        resp => caption_data[i] = resp
      ).catch(e => `Failed to get captions: ${i}`)),
    video_ids.map(i =>
      $.get(`/static/faces/${i}.json`).then(
        resp => face_data[i] = resp
      ).catch(e => `Failed to get faces: ${i}`))
  ).then(() => {
    query.searchInVideos(
      video_ids,
      json_data => {
        try {
          $('#videos').empty().append(`<div id="videos-${page_i}" />`);

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
          if (USE_ARCHIVE) {
            vgrid_settings.video_endpoint = '{{ archive_video_endpoint }}';
            vgrid_settings.show_timeline_controls = false;
          } else {
            vgrid_settings.video_endpoint = '{{ video_endpoint }}';
            vgrid_settings.show_timeline_controls = true;

            {% if frameserver_endpoint is not none %}
            // FIXME: this reveals the frameserver
            vgrid_settings.frameserver_endpoint = '{{ frameserver_endpoint }}';
            vgrid_settings.use_frameserver = true;
            {% endif %}
          }
          highlight_phrases = getPhrasesToHighlight(query);
          renderVGrid(json_data, caption_data, face_data, vgrid_settings,
                      highlight_phrases, USE_ARCHIVE, `videos-${page_i}`);
        } catch (e) {
          alert('Failed to load videos.');
          throw e;
        }
      },
      error => {
        alert('Search failed.');
        console.log(error);
      }
    );
  });
}

function loadVideos(params, serve_from_internet_archive) {
  USE_ARCHIVE = serve_from_internet_archive;
  PARAMS = params;
  QUERY = new SearchableQuery(PARAMS.query, PARAMS.count, false);
  CURR_PAGE = 0;

  if (QUERY.alias) {
    $('#text-info').empty().append(
      $('<span />').css(
        'color', PARAMS.color
      ).text(QUERY.alias),
      '&nbsp;',
      $('<span />').html('&#9432;').attr('title', QUERY.query)
    );
  } else {
    $('#text-info').empty().append(
      $('<code />').css('color', PARAMS.color).text(QUERY.query),
      $.trim(QUERY.query).endsWith('WHERE') ?
        $('<code />').css('color', 'gray').text('all the data') : null
    );
  }
  if (PARAMS.video_count > 0) {
    $('body').css('min-height', '220px');
    displayVideos(CURR_PAGE);
  } else {
    $('#videos').empty().append($('<p />').css('text-align', 'center').text('No videos to display.'));
    $("#page-buttons").hide();
  }
}
