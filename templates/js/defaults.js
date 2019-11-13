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

const QUERY_PREFIX = 'COUNT screen time WHERE';

function alertAndThrow(msg) {
  alert(msg);
  throw Error(msg);
}
