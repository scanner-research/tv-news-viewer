const PAGINATE = true;
const VIDEOS_PER_PAGE = 5;
var USE_ARCHIVE = true;
var QUERY_PARAMS = null;
var CURR_PAGE = null;

function displayVideos(page_i) {
  let count_var = QUERY_PARAMS.count;

  var video_ids = QUERY_PARAMS.video_ids;
  if (video_ids.length >= VIDEOS_PER_PAGE) {
    let base_idx = page_i * VIDEOS_PER_PAGE;
    video_ids = video_ids.slice(base_idx, base_idx + VIDEOS_PER_PAGE);
  }

  let n_pages = Math.ceil(QUERY_PARAMS.video_ids.length / VIDEOS_PER_PAGE);
  $("#text-info").empty().append(
    $(`<code style="color:${QUERY_PARAMS.color}"/>`).text(QUERY_PARAMS.query)
  );

  $("#page-buttons").empty().append(
    page_i > 0 ? $(`<button type="button" class="btn btn-outline-secondary btn-sm" onclick="displayVideos(${page_i - 1});" />`).text('previous') : null,
    page_i + 1 < n_pages ? $(`<button type="button" class="btn btn-outline-secondary btn-sm" onclick="displayVideos(${page_i + 1});" />`).text('next') : null,
    $('<button type="button" class="btn btn-secondary btn-sm" disabled />').text(`Page ${page_i + 1} / ${n_pages}`)
  );

  let query = new SearchableQuery(QUERY_PARAMS.query, QUERY_PARAMS.count, false);
  console.log('Executing query:', query);

  $('#videos').empty();
  let caption_data = {};
  Promise.all(
    video_ids.map(i =>
      $.get(`/captions/${i}`).then(
        resp => caption_data[i] = resp
      ).catch(
        e => `Failed to get captions: ${i}`
      ))
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
          renderVGrid(json_data, caption_data, vgrid_settings,
                      USE_ARCHIVE, `videos-${page_i}`);
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
  QUERY_PARAMS = params;
  CURR_PAGE = 0;
  displayVideos(CURR_PAGE);
}
