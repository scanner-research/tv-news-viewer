const ALL_SHOWS = [
  {% for show in shows %}"{{ show }}",{% endfor %}
];

const ALL_PEOPLE = [
  {% for person in people %}"{{ person }}",{% endfor %}
];
const ALL_PEOPLE_LOWER_CASE_SET = new Set(ALL_PEOPLE.map(x => x.toLowerCase()));

const ALL_PERSON_TAGS = [
  {% for tag in person_tags %}"{{ tag }}",{% endfor %}
];

const ALL_GLOBAL_TAGS = [
  {% for tag in global_face_tags %}"{{ tag }}",{% endfor %}
];

const ALL_TAGS = ALL_GLOBAL_TAGS.concat(ALL_PERSON_TAGS);
const ALL_TAGS_LOWER_CASE_SET = new Set(ALL_TAGS.map(x => x.toLowerCase()));

const CHANNELS = ['CNN', 'FOX', 'MSNBC'];
const CHANNEL_REGEX = /CNN|FOX(?:NEWS)?|MSNBC/i;
const HOUR_REGEX = /(\d+)(?:-(\d+))?/;

const DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_OF_WEEK_REGEX = new RegExp(`(${DAYS_OF_WEEK.join('|')})(?:-(${DAYS_OF_WEEK.join('|')}))?`, 'i');
