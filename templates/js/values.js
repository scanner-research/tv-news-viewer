const ALL_SHOWS = [
  {% for show in shows %}"{{ show }}",{% endfor %}
];

const ALL_PEOPLE = [
  {% for person in people %}"{{ person }}",{% endfor %}
];

const ALL_PERSON_ATTRIBUTES = [
  {% for attr in person_attributes %}"{{ attr }}",{% endfor %}
];
