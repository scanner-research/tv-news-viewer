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
                    {"color": DEFAULT_COLORS[i], "query": q}
                    for i, q in enumerate(self.queries)
                ]
            })
        })


# Count mentions views
MENTION_VIEWS = [
    WidgetView(
        'Plot number of words over time',
        Countable.mentions,
        ['']
    ),
    WidgetView(
        'Plot mentions of Hillary Clinton vs Donald Trump',
        Countable.mentions,
        ['text="Donald Trump"', 'text="Hillary Clinton"']
    ),
    WidgetView(
        'Plot mentions of "Donald Trump" by channel',
        Countable.mentions,
        [
            'text="Donald Trump" AND channel="CNN"',
            'text="Donald Trump" AND channel="FOX"',
            'text="Donald Trump" AND channel="MSNBC"'
        ]
    ),
    WidgetView(
        'Plot normalized mentions of "Donald Trump" by channel',
        Countable.mentions,
        [
            'text="Donald Trump" AND channel="CNN" NORMALIZE channel="CNN"',
            'text="Donald Trump" AND channel="FOX" NORMALIZE channel="FOX"',
            'text="Donald Trump" AND channel="MSNBC" NORMALIZE channel="MSNBC"'
        ]
    ),
    WidgetView(
        'Plot mentions of "geico" including and excluding commercials',
        Countable.mentions,
        [
            'text="geico"',
            'text="geico" AND commercials=true'
        ]
    ),
    WidgetView(
        'Plot mentions of "abortion" when a woman vs. a man is onsreen',
        Countable.mentions,
        [
            'text="abortion" AND onscreen.face="female"',
            'text="abortion" AND onscreen.face="male"'
        ]
    ),
    WidgetView(
        'Plot mentions of "collusion" when Robert Mueller is on screen',
        Countable.mentions,
        ['text="collusion" AND onscreen.person="Robert Mueller"']
    ),
    WidgetView(
        'Plot mentions of "good morning" in the morning vs. evening',
        Countable.mentions,
        [
            'text="good morning" AND hour="4-11"',
            'text="good morning" AND hour="15-23"'
        ]
    )
]

FACE_TIME_VIEWS = [
    WidgetView(
        'Plot face screen time over time (and broken by channel)',
        Countable.facetime,
        ['', 'channel=CNN', 'channel=FOX', 'channel=MSNBC']
    ),
    WidgetView(
        'Plot proportion of face screen time of hosts over time (and broken by channel)',
        Countable.facetime,
        [
            'role="host" NORMALIZE',
            'role="host" AND channel=CNN NORMALIZE channel=CNN',
            'role="host" AND channel=FOX NORMALIZE channel=FOX',
            'role="host" AND channel=MSNBC NORMALIZE channel=MSNBC'
        ]
    ),
    WidgetView(
        'Plot proportion of face time of women (and broken by channel)',
        Countable.facetime,
        [
            'gender="female" NORMALIZE',
            'gender="female" AND channel=CNN NORMALIZE channel=CNN',
            'gender="female" AND channel=FOX NORMALIZE channel=FOX',
            'gender="female" AND channel=MSNBC NORMALIZE channel=CNN'
        ]
    ),
    WidgetView(
        'Plot proportion of face time of female vs male hosts',
        Countable.facetime,
        [
            'gender="male" AND role="host" NORMALIZE role="host"',
            'gender="female" AND role="host" NORMALIZE role="host"'
        ]
    ),
    WidgetView(
        'Plot proportion of face time of female vs male hosts on FOX News',
        Countable.facetime,
        [
            'gender="male" AND role="host" AND channel=FOX NORMALIZE role="host" AND channel="FOX"',
            'gender="female" AND role="host" AND channel=FOX NORMALIZE role="host" AND channel="FOX"'
        ]
    ),
    WidgetView(
        'Plot proportion of face time of female vs male hosts on "Morning Joe"',
        Countable.facetime,
        [
            'gender="male" AND role="host" AND show="Morning Joe" NORMALIZE role="host" AND show="Morning Joe"',
            'gender="female" AND role="host" AND show="Morning Joe" NORMALIZE role="host" AND show="Morning Joe"'
        ]
    ),
    WidgetView(
        'Plot male vs. female screen time when "isis" is mentioned',
        Countable.facetime,
        [
            'gender="male" AND captions.text="isis"',
            'gender="female" AND captions.text="isis"',
        ]
    ),
    WidgetView(
        'Plot male and female screen time when "Hillary Clinton" is on screen',
        Countable.facetime,
        [
            'gender="male" AND onscreen.person="Hillary Clinton"',
            'gender="female" AND onscreen.person="Hillary Clinton" MINUS person="Hillary Clinton"',
            'person="Hillary Clinton"'
        ]
    ),
    WidgetView(
        'Plot proportion of male and female host screen time when "Hillary Clinton" is on screen',
        Countable.facetime,
        [
            'gender="male" AND role="host" AND onscreen.person="Hillary Clinton" NORMALIZE role="host" AND onscreen.person="Hillary Clinton"',
            'gender="female" AND role="host" AND onscreen.person="Hillary Clinton" NORMALIZE role="host" AND onscreen.person="Hillary Clinton"',
        ]
    ),
    WidgetView(
        'Plot proportion of total face time for "Donald Trump" and "Hillary Clinton"',
        Countable.facetime,
        [
            'person="Donald Trump" NORMALIZE',
            'person="Hillary Clinton" NORMALIZE'
        ]
    )
]

VIDEO_TIME_VIEWS = [
    WidgetView(
        'Plot amount of video (and broken by channel)',
        Countable.videotime,
        ['', 'channel=CNN', 'channel=FOX', 'channel=MSNBC']
    ),
    WidgetView(
        'Plot amount of video with and without commercials',
        Countable.videotime,
        ['', 'commercials=true']
    ),
    WidgetView(
        'Plot amount of video when there is a face on screen (and broken by channel)',
        Countable.videotime,
        [
            'onscreen.face=all',
            'onscreen.face=all AND channel=CNN',
            'onscreen.face=all AND channel=FOX',
            'onscreen.face=all AND channel=MSNBC'
        ]
    ),
    WidgetView(
        'Plot proportion of video when there is a face on screen (and broken by channel)',
        Countable.videotime,
        [
            'onscreen.face=all NORMALIZE',
            'onscreen.face=all AND channel=CNN NORMALIZE channel=CNN',
            'onscreen.face=all AND channel=FOX NORMALIZE channel=FOX',
            'onscreen.face=all AND channel=MSNBC NORMALIZE channel=MSNBC'
        ]
    ),
    WidgetView(
        'Plot proportion of video when there is a female host on screen (and broken by channel)',
        Countable.videotime,
        [
            'onscreen.face=female+host NORMALIZE',
            'onscreen.face=female+host AND channel=CNN NORMALIZE channel=CNN',
            'onscreen.face=female+host AND channel=FOX NORMALIZE channel=FOX',
            'onscreen.face=female+host AND channel=MSNBC NORMALIZE channel=MSNBC'
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
