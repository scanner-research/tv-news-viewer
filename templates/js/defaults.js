/* Constant definitions */

const DATA_VERSION_ID = {% if data_version is not none %}"{{ data_version }}"{% else %}null{% endif %};

const SERVER_HOST = '{{ host }}';

const DEFAULT_COLORS = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'
];

const DEFAULT_MALE_COLOR = '#AED6F1';
const DEFAULT_FEMALE_COLOR = '#F5B7B1';

const DEFAULT_START_DATE = '{{ start_date }}';
const DEFAULT_END_DATE = '{{ end_date }}';
const DEFAULT_AGGREGATE_BY = '{{ default_agg_by }}';

const DEFAULT_TEXT_WINDOW = '{{ default_text_window }}';

const QUERY_PREFIX = '';

const RESERVED_KEYWORDS = {
  and: 'AND',
  or: 'OR',
  normalize: 'NORMALIZE',
  subtract: 'SUBTRACT'
};

const SEARCH_KEY = {
  {% for kv in search_keys %}{{ kv.0 }}: '{{ kv.1 }}', {% endfor %}
};

const SEARCH_PARAM = {
  {% for kv in search_params %}{{ kv.0 }}: '{{ kv.1 }}', {% endfor %}
};

const VIDEO_ENDPOINT = {% if video_endpoint is not none %}'{{ video_endpoint }}'{% else %}null{% endif %};
const FRAMESERVER_ENDPOINT = {% if frameserver_endpoint is not none %}'{{ frameserver_endpoint }}'{% else %}null{% endif %};

const ARCHIVE_ENDPOINT = 'https://archive.org/details';
const ARCHIVE_VIDEO_ENDPOINT = 'https://archive.org/download';

const CLIENT_IS_CHROME = (
  !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime)
);
const CLIENT_IS_MAC = navigator.platform.indexOf('Mac') > -1;

var SERVE_FROM_INTERNET_ARCHIVE = true;

function testVideoAuth() {
  {% if video_endpoint is not none %}
  let img = new Image();
  img.onload = () => { SERVE_FROM_INTERNET_ARCHIVE = false; };
  img.src = '{{ video_endpoint }}/do_not_delete.jpg';
  {% endif %}
}

function alertAndThrow(msg) {
  alert(msg);
  throw Error(msg);
}

function findInArrayCaseInsensitive(arr, v) {
  let v_regex = new RegExp('^' + v + '$', 'i');
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].match(v_regex)) {
      return arr[i];
    }
  }
  return null;
}
