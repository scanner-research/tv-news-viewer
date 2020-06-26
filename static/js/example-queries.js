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

const DEFAULT_QUERIES = ['name="hillary clinton"', 'name="bernie sanders"'];

const EXAMPLE_QUERIES = [
  [
    'Donald Trump vs. Joe Biden in 2020', getExampleChartPath(
      ['name="donald trump"', 'name="joe biden"'],
      {start_date: '2020-01-01', aggregate: 'day'}
    )
  ], [
    'Binary gender presentation, as a fraction of screen time', getExampleChartPath(
      ['tag="male" NORMALIZE', 'tag="female" NORMALIZE']
    )
  ], [
    'Binary gender presentation, as a fraction of screen time, by channel', getExampleChartPath(
      [
        'tag="male" AND channel="CNN" NORMALIZE channel="CNN"',
        'tag="female" AND channel="CNN" NORMALIZE channel="CNN"',
        'tag="male" AND channel="FOX" NORMALIZE channel="FOX"',
        'tag="female" AND channel="FOX" NORMALIZE channel="FOX"',
        'tag="male" AND channel="MSNBC" NORMALIZE channel="MSNBC"',
        'tag="female" AND channel="MSNBC" NORMALIZE channel="MSNBC"'
      ]
    )
  ], [
    'Sean Hannity and Tucker Carlson, on screen together', getExampleChartPath(
      ['name="sean hannity" AND name="tucker carlson"']
    )
  ], [
    'COVID-19 pandemic', getExampleChartPath(
      [
        'text="COVID | CORONAVIRUS | CORONA VIRUS"',
        'text="WUHAN VIRUS | CHINESE VIRUS"',
        'text="SOCIAL DISTANCING"'
      ],
      {start_date: '2019-12-01', aggregate: 'day'}
    )
  ], [
    'Black Lives Matter', getExampleChartPath(
      ['text="BLACK LIVES MATTER"'], {aggregate: 'day'})
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
  ]
];
