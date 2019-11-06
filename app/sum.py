from abc import abstractmethod
from datetime import datetime
from typing import Tuple, Dict, List

from .types import AggregateFn, Number, JsonObject
from .parsing import format_date


class DateAccumulator(object):

    @abstractmethod
    def __init__(self, aggregate_fn: AggregateFn):
        pass

    @abstractmethod
    def add(self, date: datetime, video_id: int, value: Number) -> None:
        pass

    @abstractmethod
    def get(self) -> JsonObject:
        pass


class DetailedDateAccumulator(DateAccumulator):
    Value = Tuple[int, Number]

    def __init__(self, aggregate_fn: AggregateFn):
        self._values: Dict[str, List['DetailedDateAccumulator.Value']] = {}
        self._aggregate_fn = aggregate_fn

    def add(self, date: datetime, video_id: int, value: Number) -> None:
        if value > 0:
            key = format_date(self._aggregate_fn(date))
            if key not in self._values:
                self._values[key] = []
            self._values[key].append((video_id, value))

    def get(self) -> JsonObject:
        return self._values


class SimpleDateAcumulator(DateAccumulator):

    def __init__(self, aggregate_fn: AggregateFn):
        self._values: Dict[str, Number] = {}
        self._aggregate_fn = aggregate_fn

    def add(self, date: datetime, video_id: int, value: Number) -> None:
        if value > 0:
            key = format_date(self._aggregate_fn(date))
            if key not in self._values:
                self._values[key] = value
            else:
                self._values[key] += value

    def get(self) -> JsonObject:
        return self._values
