const ALL_SHOWS = [
  {% for show in shows %}"{{ show }}",{% endfor %}
];

const ALL_PEOPLE = [
  {% for person in people %}"{{ person }}",{% endfor %}
];

const ALL_PERSON_TAGS = [
  {% for tag in person_tags %}"{{ tag }}",{% endfor %}
];

const ALL_TAGS = [
  {% for tag in global_face_tags %}"{{ tag }}",{% endfor %}
].concat(ALL_PERSON_TAGS);

const CHANNELS = ['CNN', 'FOX', 'MSNBC'];
const CHANNEL_REGEX = /CNN|FOX(?:NEWS)?|MSNBC/i;
const HOUR_REGEX = /(\d+)(?:-(\d+))?/;

const DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_OF_WEEK_REGEX = new RegExp(`(${DAYS_OF_WEEK.join('|')})(?:-(${DAYS_OF_WEEK.join('|')}))?`, 'i');
