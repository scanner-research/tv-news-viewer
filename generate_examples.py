#!/usr/bin/env python3
"""
Generate urls for widget
"""

import argparse
import json
from urllib.parse import urlencode
from typing import List, NamedTuple, Optional

from app.types import *
from app.core import MIN_DATE, MAX_DATE, format_date

DEFAULT_COLORS = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F',
  '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'
]


class WidgetView(NamedTuple):
    """
    Class corresponding to a url to be generated
    """
    description: str
    count: Countable
    queries: List[str]
    start_date: str = format_date(MIN_DATE)
    end_date: str = format_date(MAX_DATE)
    aggregate: Aggregate = Aggregate.month
    comment: Optional[str] = None

    @property
    def path(self) -> str:
        return '/?' + urlencode({
            "data": json.dumps({
                "options": {
                    'count': self.count.name,
                    'aggregate': self.aggregate.name,
                    'start_date': self.start_date,
                    'end_date': self.end_date
                },
                "queries": [
                    {"color": DEFAULT_COLORS[i], "text": q}
                    for i, q in enumerate(self.queries)
                ]
            })
        })


# Count mentions views
MENTION_VIEWS = [
    WidgetView(
        'Plot number of words spoken over time',
        Countable.mentions,
        ['']
    ),
    WidgetView(
        'Plot mentions of Hillary Clinton vs Donald Trump',
        Countable.mentions,
        ['Donald Trump', 'Hillary Clinton']
    ),
    WidgetView(
        'Plot net number of mentions of Hillary Clinton vs Donald Trump',
        Countable.mentions,
        ['Hillary Clinton SUBTRACT Donald Trump']
    ),
    WidgetView(
        'Plot mentions of "Donald Trump" by channel',
        Countable.mentions,
        [
            '"Donald Trump" WHERE channel="CNN"',
            '"Donald Trump" WHERE channel="FOX"',
            '"Donald Trump" WHERE channel="MSNBC"'
        ]
    ),
    WidgetView(
        'Plot normalized mentions of "Donald Trump" by channel',
        Countable.mentions,
        [
            '"Donald Trump" WHERE channel="CNN" NORMALIZE channel="CNN"',
            '"Donald Trump" WHERE channel="FOX" NORMALIZE channel="FOX"',
            '"Donald Trump" WHERE channel="MSNBC" NORMALIZE channel="MSNBC"'
        ]
    ),
    WidgetView(
        'Plot mentions of "geico" including and excluding commercials',
        Countable.mentions,
        [
            'geico WHERE iscommercial=false',
            'geico WHERE iscommercial=true'
        ]
    ),
    WidgetView(
        'Plot mentions of "abortion" when a woman vs. a man is on screen',
        Countable.mentions,
        [
            'abortion WHERE onscreen.face="female"',
            'abortion WHERE onscreen.face="male"'
        ]
    ),
    WidgetView(
        'Plot mentions of "collusion" when Robert Mueller is on screen',
        Countable.mentions,
        ['collusion WHERE onscreen.face="Robert Mueller"']
    ),
    WidgetView(
        'Plot mentions of "good morning" in the morning vs. evening',
        Countable.mentions,
        [
            '"good morning" WHERE hour="4-11"',
            '"good morning" WHERE hour="15-23"'
        ]
    )
]

FACE_TIME_VIEWS = [
    WidgetView(
        'Plot face screen time over time (by channel)',
        Countable.facetime,
        ['', 'channel=CNN', 'channel=FOX', 'channel=MSNBC']
    ),
    WidgetView(
        'Plot proportion of face screen time of hosts over time (by channel)',
        Countable.facetime,
        [
            'host NORMALIZE',
            'host WHERE channel=CNN NORMALIZE WHERE channel=CNN',
            'host WHERE channel=FOX NORMALIZE WHERE channel=FOX',
            'host WHERE channel=MSNBC NORMALIZE WHERE channel=MSNBC'
        ]
    ),
    WidgetView(
        'Plot proportion of face time of women (by channel)',
        Countable.facetime,
        [
            'women NORMALIZE',
            'women WHERE channel=CNN NORMALIZE WHERE channel=CNN',
            'women WHERE channel=FOX NORMALIZE WHERE channel=FOX',
            'women WHERE channel=MSNBC NORMALIZE WHERE channel=CNN'
        ]
    ),
    WidgetView(
        'Plot proportion of face time of female vs male hosts',
        Countable.facetime,
        [
            'male hosts NORMALIZE hosts',
            'female hosts NORMALIZE hosts'
        ]
    ),
    WidgetView(
        'Plot proportion of face time of female vs male hosts on FOX News',
        Countable.facetime,
        [
            'male hosts WHERE channel=FOX NORMALIZE hosts WHERE channel="FOX"',
            'female hosts WHERE channel=FOX NORMALIZE hosts WHERE channel="FOX"'
        ]
    ),
    WidgetView(
        'Plot proportion of face time of female vs male hosts on "Morning Joe"',
        Countable.facetime,
        [
            'male hosts WHERE show="Morning Joe" NORMALIZE hosts WHERE show="Morning Joe"',
            'female hosts WHERE show="Morning Joe" NORMALIZE hosts WHERE show="Morning Joe"'
        ]
    ),
    WidgetView(
        'Plot male vs. female screen time when "isis" is mentioned',
        Countable.facetime,
        [
            'men WHERE caption.text="isis"',
            'women WHERE caption.text="isis"',
        ]
    ),
    WidgetView(
        'Plot male and female screen time when "Hillary Clinton" is on screen',
        Countable.facetime,
        [
            'men WHERE onscreen.face="Hillary Clinton"',
            'women WHERE onscreen.face="Hillary Clinton" SUBTRACT "Hillary Clinton"',
            '"Hillary Clinton"'
        ]
    ),
    WidgetView(
        'Plot proportion of male and female host screen time when "Hillary Clinton" is on screen',
        Countable.facetime,
        [
            'male hosts WHERE onscreen.face="Hillary Clinton" NORMALIZE hosts WHERE onscreen.face="Hillary Clinton"',
            'female hosts WHERE onscreen.face="Hillary Clinton" NORMALIZE hosts WHERE onscreen.face="Hillary Clinton"',
        ]
    ),
    WidgetView(
        'Plot proportion of total face time for "Donald Trump" and "Hillary Clinton"',
        Countable.facetime,
        [
            '"Donald Trump" NORMALIZE',
            '"Hillary Clinton" NORMALIZE'
        ]
    )
]

VIDEO_TIME_VIEWS = [
    WidgetView(
        'Plot amount of video (by channel)',
        Countable.videotime,
        ['', 'channel=CNN', 'channel=FOX', 'channel=MSNBC']
    ),
    WidgetView(
        'Plot proportion of video that is commercials (by channel)',
        Countable.videotime,
        [
            'iscommercial=true NORMALIZE iscommercial=both',
            'channel=CNN AND iscommercial=true NORMALIZE channel=CNN AND iscommercial=both',
            'channel=FOX AND iscommercial=true NORMALIZE channel=FOX AND iscommercial=both',
            'channel=MSNBC AND iscommercial=true NORMALIZE channel=MSNBC AND iscommercial=both'
        ],
    ),
    WidgetView(
        'Plot proportion of video when there is a face on screen (by channel)',
        Countable.videotime,
        [
            'onscreen.face=all NORMALIZE',
            'onscreen.face=all AND channel=CNN NORMALIZE channel=CNN',
            'onscreen.face=all AND channel=FOX NORMALIZE channel=FOX',
            'onscreen.face=all AND channel=MSNBC NORMALIZE channel=MSNBC'
        ]
    ),
    WidgetView(
        'Plot proportion of video when there is a host on screen (by channel)',
        Countable.videotime,
        [
            'onscreen.face=host NORMALIZE',
            'onscreen.face=host AND channel=CNN NORMALIZE channel=CNN',
            'onscreen.face=host AND channel=FOX NORMALIZE channel=FOX',
            'onscreen.face=host AND channel=MSNBC NORMALIZE channel=MSNBC'
        ]
    ),
    WidgetView(
        'Plot proportion of video when there is a female host on screen (by channel)',
        Countable.videotime,
        [
            'onscreen.face="female host" NORMALIZE',
            'onscreen.face="female host" AND channel=CNN NORMALIZE channel=CNN',
            'onscreen.face="female host" AND channel=FOX NORMALIZE channel=FOX',
            'onscreen.face="female host" AND channel=MSNBC NORMALIZE channel=MSNBC'
        ]
    )
]


def get_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('--outfile', default='static/examples.html')
    return parser.parse_args()


# TODO: Make this a more serious page
def main(outfile: str) -> None:
    views = MENTION_VIEWS + FACE_TIME_VIEWS + VIDEO_TIME_VIEWS

    with open(outfile, 'w') as f:
        for i, w in enumerate(views):
            f.write('<h1>{}. {}</h1>\n'.format(i + 1, w.description))
            if w.comment:
                f.write('<h2>[ {} ]</h2>\n'.format(w.comment))
            f.write('<a href="{}" target="_blank">link</a>\n'.format(w.path))
            f.write('<br>\n\n')


if __name__ == '__main__':
    main(**vars(get_args()))
