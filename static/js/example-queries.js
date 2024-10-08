/* File contaning some example queries that will be shown on the homepage */

function getExampleChartPath(queries, chart_options) {
  let data = {
    options: chart_options ? chart_options : {
      aggregate: DEFAULT_AGGREGATE_BY,
      start_date: DEFAULT_START_DATE,
      end_date: DEFAULT_END_DATE
    },
    queries: queries.map((x, i) => ({
      color:DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      text: x
    }))
  };
  return '/?data=' + urlSafeBase64Encode(JSON.stringify(data));
}

const DEFAULT_QUERIES = ['name="donald trump"', 'name="kamala harris"', 'name="joe biden"'];

const EXAMPLE_QUERIES = [
  [
    'Donald Trump vs. Kamala Harris, vs. Joe Biden screen time in 2024', getExampleChartPath(
      ['name="donald trump"', 'name="kamala harris"', 'name="joe biden"'],
      {start_date: '2024-01-01', aggregate: 'day'}
    )
  ], [
    'Joe Biden vs. Donald Trump screen time in 2020', getExampleChartPath(
      ['name="joe biden"', 'name="donald trump"'],
      {start_date: '2020-01-01', end_date: '2022-03-01', aggregate: 'day'}
    )
  ], [
    'Hillary Clinton vs. Donald Trump screen time in 2016', getExampleChartPath(
      ['name="hillary clinton"', 'name="donald trump"'],
      {start_date: '2016-01-01', end_date: '2017-01-01', aggregate: 'day'}
    )
  ], [
    'Sean Hannity and Tucker Carlson, on screen together', getExampleChartPath(
      ['name="sean hannity" AND name="tucker carlson"']
    )
  ], [
    'US Dept. of State designated Foreign Terrorist Organizations', getExampleChartPath(
      [
        'text="ISIS | Islamic State"',
        'text="Hamas"',
        'text="Al-Qaeda | Al Qaeda"',
        'text="Hezbollah | Hizballah"'
      ],
      {start_date: '2010-01-01', aggregate: 'month'}
    )
  ], [
    'COVID-19 pandemic', getExampleChartPath(
      [
        'text="COVID | CORONAVIRUS | CORONA VIRUS"',
        'text="WUHAN VIRUS | CHINESE VIRUS"',
        'text="SOCIAL DISTANCING"'
      ],
      {start_date: '2019-12-01', aggregate: 'week'}
    )
  ], [
    'Black Lives Matter', getExampleChartPath(
      ['text="BLACK LIVES MATTER"'], {aggregate: 'week'}
    )
  ], [
    'Illegal vs. undocumented immigration', getExampleChartPath(
      [
        'text="ILLEGAL IMMIGRATION | ILLEGAL [IMMIGRANT] | ILLEGALS" AND channel="CNN"',
        'text="UNDOCUMENTED IMMIGRATION | UNDOCUMENTED [IMMIGRANT]" AND channel="CNN"',
        'text="ILLEGAL IMMIGRATION | ILLEGAL [IMMIGRANT] | ILLEGALS" AND channel="FOX"',
        'text="UNDOCUMENTED IMMIGRATION | UNDOCUMENTED [IMMIGRANT]" AND channel="FOX"',
        'text="ILLEGAL IMMIGRATION | ILLEGAL [IMMIGRANT] | ILLEGALS" AND channel="MSNBC"',
        'text="UNDOCUMENTED IMMIGRATION | UNDOCUMENTED [IMMIGRANT]" AND channel="MSNBC"',
      ],
    )
  ], [
    'Hillary Clinton and emails', getExampleChartPath(
      ['name="hillary clinton" AND text="E [MAIL] | [EMAIL]"'],
      {start_date: '2015-01-01', end_date: '2017-01-01', aggregate: 'day'}
    )
  ], [
    'Show all of the data and by channel', getExampleChartPath(
      ['', 'channel="CNN"', 'channel="FOX"', 'channel="MSNBC"'], {aggregate: 'month'})
  ]
];
