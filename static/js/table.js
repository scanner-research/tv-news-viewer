function toggleDataVis(e) {
  let cell = $(e).parent();
  cell.find('.long-data-value').toggle();
  cell.find('.toggle-data').text(
    cell.find('.long-data-value:visible').length > 0 ? 'hide' : 'show'
  );
}

function renderLongDataValue(x) {
  if (x.length > 250) {
    var html = $('<a class="toggle-data" href="javascript:void(0);" onclick="toggleDataVis(this);" />').text('show').prop('outerHTML');
    html += $('<span class="long-data-value" />').text(x).prop('outerHTML');
    return html;
  } else {
    return x;
  }
}

function renderArchiveLink(video_name) {
  let url = ARCHIVE_ENDPOINT + '/' + video_name;
  return $('<span>').addClass('archive-logo').append(
    $('<a>').attr({
      href: url, target: '_blank', title: 'View at the Internet Archive!'
    }).append($('<img>').attr('src', '/static/img/archive.svg'))
  );
}
