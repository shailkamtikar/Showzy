import logging
import random

from fastapi import Depends, Request

from ..auth import CurrentUser
from ..db import conn
from ..deps import optional_user
from ..errors import AppError
from .events import client_ip, ip_hash, record_event

log = logging.getLogger("showzy.ratelimit")


def hit(key: str, window_seconds: int) -> int:
    """Increment the fixed-window counter and return the new count."""
    with conn() as c:
        row = c.execute(
            "insert into rate_limits (key, window_start, count) "
            "values (%s, to_timestamp(floor(extract(epoch from now()) / %s) * %s), 1) "
            "on conflict (key, window_start) do update set count = rate_limits.count + 1 "
            "returning count",
            (key, window_seconds, window_seconds),
        ).fetchone()
        if random.random() < 0.01:
            c.execute("delete from rate_limits where window_start < now() - interval '1 hour'")
        return row["count"]


def rate_limit(name: str, limit_getter, window_seconds: int = 60, by: str = "user", fail_closed: bool = False):
    """FastAPI dependency factory. limit_getter is a callable so tests/env can change limits."""

    def dep(request: Request, user: CurrentUser | None = Depends(optional_user)) -> None:
        subject = str(user.id) if (by == "user" and user) else (ip_hash(client_ip(request)) or "unknown")
        try:
            count = hit(f"{name}:{subject}", window_seconds)
        except Exception:  # noqa: BLE001
            log.exception("rate limiter unavailable")
            if fail_closed:
                raise AppError(503, "rate_limiter_unavailable", "Please try again shortly") from None
            return
        if count > limit_getter():
            record_event("rate_limited", user.id if user else None, request, {"limit_name": name}, evaluate=False)
            raise AppError(
                429, "rate_limited", "Too many requests. Please slow down.", retry_after=window_seconds
            )

    return dep
