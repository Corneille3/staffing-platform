"""A small in-memory sliding-window limiter.

Per process, nothing stored: counters reset on restart. That is the point for
the public lead intake — a visitor's IP address is personal data, and keeping
it only in memory for an hour means there is nothing to retain or purge.
Fine while the API is a single container; a second instance would need a
shared store.
"""
from collections import deque
from threading import Lock
from time import monotonic

_MAX_KEYS = 10_000


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = {}
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        """Record one hit for `key`; False once it is over the limit."""
        now = monotonic()
        with self._lock:
            if len(self._hits) > _MAX_KEYS:
                self._prune(now)
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True

    def _prune(self, now: float) -> None:
        stale = [k for k, hits in self._hits.items() if not hits or now - hits[-1] >= self.window]
        for key in stale:
            del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
