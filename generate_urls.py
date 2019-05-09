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
    normalize: bool = False
    comment: Optional[str] = None

    @property
    def path(self) -> str:
        return '/?' + urlencode({
            "data": json.dumps({
                "options": {
                    'count': self.count.name,
                    'normalize': str(self.normalize).lower(),
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
            'text="Donald Trump" AND channel="CNN"',
            'text="Donald Trump" AND channel="FOX"',
            'text="Donald Trump" AND channel="MSNBC"'
        ],
        normalize=True
    ),
    WidgetView(
        'Plot mentions of "aflak" including and excluding commericals',
        Countable.mentions,
        [
            'text="aflak"',
            'text="aflak" AND commercials=true'
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
        'Plot % face screen time of hosts over time (and broken by channel)',
        Countable.facetime,
        [
            'role="host"',
            'role="host" AND channel=CNN',
            'role="host" AND channel=FOX',
            'role="host" AND channel=MSNBC'
        ],
        normalize=True
    ),
    WidgetView(
        'Plot % face time of women (and broken by channel)',
        Countable.facetime,
        [
            'gender="female"',
            'gender="female" AND channel=CNN',
            'gender="female" AND channel=FOX',
            'gender="female" AND channel=MSNBC'
        ],
        normalize=True
    ),
    WidgetView(
        'Plot % face time of female vs male hosts',
        Countable.facetime,
        [
            'gender="male" AND role="host"',
            'gender="female" AND role="host"'
        ],
        normalize=True
    ),
    WidgetView(
        'Plot % face time of female vs male hosts on FOX News',
        Countable.facetime,
        [
            'gender="male" AND role="host" AND channel=FOX',
            'gender="female" AND role="host" AND channel=FOX'
        ],
        normalize=True
    ),
    WidgetView(
        'Plot % face time of female vs male hosts on "Morning Joe"',
        Countable.facetime,
        [
            'gender="male" AND role="host" AND show="Morning Joe"',
            'gender="female" AND role="host" AND show="Morning Joe"'
        ],
        normalize=True
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
            'gender="female" AND onscreen.person="Hillary Clinton"',
            'person="Hillary Clinton"'
        ],
        normalize=True,
        comment='The second query includes Clinton\'s face'
    ),
    WidgetView(
        'Plot male and female host screen time when "Hillary Clinton" is on screen',
        Countable.facetime,
        [
            'gender="male" AND role="host" AND onscreen.person="Hillary Clinton"',
            'gender="female" AND role="host" AND onscreen.person="Hillary Clinton"',
        ],
        normalize=True
    ),
    WidgetView(
        'Plot face time for "Donald Trump" and "Hillary Clinton"',
        Countable.facetime,
        ['person="Donald Trump"', 'person="Hillary Clinton"'],
        normalize=True
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
        'Plot % of video when there is a face on screen (and broken by channel)',
        Countable.videotime,
        [
            'onscreen.face=all',
            'onscreen.face=all AND channel=CNN',
            'onscreen.face=all AND channel=FOX',
            'onscreen.face=all AND channel=MSNBC'
        ],
        normalize=True
    ),
    WidgetView(
        'Plot % of video when there is a female host on screen (and broken by channel)',
        Countable.videotime,
        [
            'onscreen.face="female+host"',
            'onscreen.face="female+host" AND channel=CNN',
            'onscreen.face="female+host" AND channel=FOX',
            'onscreen.face="female+host" AND channel=MSNBC'
        ],
        normalize=True
    )
]


def get_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', type=str, default='localhost')
    parser.add_argument('--port', type=int, default=8080)
    return parser.parse_args()


def main(host: str, port: int) -> None:
    url_prefix = 'http://' + host
    if port != 80:
        url_prefix += ':' + str(port)
    views = MENTION_VIEWS + FACE_TIME_VIEWS + VIDEO_TIME_VIEWS
    for i, w in enumerate(views):
        print('{}. {}'.format(i + 1, w.description))
        if w.comment:
            print('[ {} ]'.format(w.comment))
        print(url_prefix + w.path)
        print()


if __name__ == '__main__':
    main(**vars(get_args()))
