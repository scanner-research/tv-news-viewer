/* Constant definitions */

const DATA_VERSION_ID = {% if data_version is not none %}"{{ data_version }}"{% else %}null{% endif %};

const SERVER_HOST = '{{ host }}';

const BBOX_ENDPOINT = '{{ bbox_endpoint }}';
const CAPTION_ENDPOINT = '{{ caption_endpoint }}';

const DEFAULT_COLORS = [
  '#4E79A7', '#E15759', '#F28E2B', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'
];

const DEFAULT_COLOR_GENDER_BBOXES = {% if color_gender_bboxes %}true{% else %}false{% endif %};
const DEFAULT_NEUTRAL_COLOR = '#FFFF00';
const DEFAULT_MALE_COLOR = '#AED6F1';
const DEFAULT_FEMALE_COLOR = '#F5B7B1';

const CAPTION_HIGHLIGHT_COLOR = '#BAFFFF';

const DEFAULT_START_DATE = '{{ start_date }}';
const DEFAULT_END_DATE = '{{ end_date }}';
const DEFAULT_AGGREGATE_BY = '{{ default_agg_by }}';

const DEFAULT_TEXT_WINDOW = '{{ default_text_window }}';

const QUERY_PREFIX = '';

const RESERVED_KEYWORDS = {
  and: 'AND',
  or: 'OR',
  normalize: 'NORMALIZE',
  add: 'ADD',
  subtract: 'SUBTRACT'
};

const SEARCH_KEY = {
  {% for kv in search_keys %}{{ kv.0 }}: '{{ kv.1 }}', {% endfor %}
};

const SEARCH_PARAM = {
  {% for kv in search_params %}{{ kv.0 }}: '{{ kv.1 }}', {% endfor %}
};

const VIDEO_ENDPOINT = {% if video_endpoint is not none %}'{{ video_endpoint }}'{% else %}null{% endif %};

const ARCHIVE_ENDPOINT = 'https://archive.org/details';
const ARCHIVE_VIDEO_ENDPOINT = 'https://archive.org/download';

const CLIENT_IS_CHROME = (
  !!window.chrome && (!!window.chrome.webstore || !!window.chrome.runtime)
);

var SERVE_FROM_INTERNET_ARCHIVE = {% if fallback_to_archive %}true{% else %}false{% endif %};

function testVideoAuth() {
  {% if fallback_to_archive and video_auth_endpoint is not none %}
  let img = new Image();
  img.onload = () => { SERVE_FROM_INTERNET_ARCHIVE = false; };
  img.src = '{{ video_auth_endpoint }}';
  {% endif %}
}

const ALL_SHOWS = [
  {% for show in shows %}'{{ show }}',{% endfor %}
];

const ALL_PEOPLE = [
  {% for person in people %}'{{ person }}',{% endfor %}
];
const ALL_PEOPLE_LOWER_CASE_SET = new Set(ALL_PEOPLE.map(x => x.toLowerCase()));
const ALL_AUTOCOMPLETE_PEOPLE = [
  {% for person in autocomplete_people %}'{{ person }}',{% endfor %}
]

const PERSON_TAG_TO_PEOPLE = {
  {% for tag, people in person_tags_dict.items() %}'{{ tag }}':[{% for person in people %}'{{ person }}',{% endfor %}],{% endfor %}
};
const ALL_PERSON_TAGS = Object.keys(PERSON_TAG_TO_PEOPLE).sort();

const ALL_GLOBAL_TAGS = [
  {% for tag in global_face_tags %}'{{ tag }}',{% endfor %}
];

const ALL_TAGS = ALL_GLOBAL_TAGS.concat(ALL_PERSON_TAGS);
const ALL_TAGS_LOWER_CASE_SET = new Set(ALL_TAGS.map(x => x.toLowerCase()));
const ALL_AUTOCOMPLETE_TAGS = {% if not hide_person_tags %}ALL_TAGS{% else %}ALL_GLOBAL_TAGS{% endif %};

const CHANNELS = ['CNN', 'FOX', 'MSNBC'];
const CHANNEL_REGEX = /CNN|FOX(?:NEWS)?|MSNBC/i;
const HOUR_REGEX = /(\d+)(?:-(\d+))?/;

const DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_OF_WEEK_REGEX = new RegExp(`(${DAYS_OF_WEEK.join('|')})(?:-(${DAYS_OF_WEEK.join('|')}))?`, 'i');
