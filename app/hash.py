import hashlib
from typing import Union


def sha256(s: str) -> bytes:
    m = hashlib.sha256()
    m.update(s.encode('utf-8'))
    return m.digest()
