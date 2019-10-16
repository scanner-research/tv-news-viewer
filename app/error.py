from typing import Optional


class InvalidUsage(Exception):

    status_code = 400

    def __init__(self, message: str, status_code: Optional[int] = None,
                 payload: Optional[str] = None):
        Exception.__init__(self)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        self.payload = payload

    def to_dict(self) -> object:
        rv = dict(self.payload or ())
        rv['message'] = self.message
        return rv


class NotFound(Exception):

    def __init__(self, message: str):
        self.message = message


class UnreachableCode(Exception):
    pass
