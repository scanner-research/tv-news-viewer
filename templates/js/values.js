const ALL_SHOWS = [
  {% for show in shows %}"{{ show }}",{% endfor %}
];

const ALL_PEOPLE = [
  {% for person in people %}"{{ person }}",{% endfor %}
];

const ALL_PERSON_TAGS = [
  {% for tag in person_tags %}"{{ tag }}",{% endfor %}
];
