import hashlib
import hmac
import json
import logging
from uuid import UUID

from fastapi import Request

from ..config import get_settings
from ..db import conn

log = logging.getLogger("showzy.security")

# Strict allowlist: only these metadata keys are ever stored, per event type.
ALLOWED: dict[str, set[str]] = {
    "hold_created": {"show_id", "seat_count", "hold_id"},
    "hold_conflict": {"show_id", "seat_count"},
    "hold_expired": {"show_id", "seat_count", "hold_id"},
    "hold_released": {"show_id", "hold_id"},
    "order_created": {"show_id", "order_id", "total_minor"},
    "payment_challenge_failed": {"attempt_id", "failed_count"},
    "payment_succeeded": {"attempt_id", "order_id"},
    "rate_limited": {"limit_name"},
    "seatmap_requested": {"show_id"},
    "auth_missing_or_invalid_token": {"path"},
}
SEVERITY = {"rate_limited": "medium", "payment_challenge_failed": "low", "hold_conflict": "low"}


def client_ip(request: Request | None) -> str:
    if request is None:
        return ""
    if get_settings().trust_proxy:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


def ip_hash(ip: str) -> str | None:
    if not ip:
        return None
    return hmac.new(get_settings().ip_hash_pepper.encode(), ip.encode(), hashlib.sha256).hexdigest()[:24]


def clean_metadata(event_type: str, metadata: dict | None) -> dict:
    allowed = ALLOWED.get(event_type, set())
    return {k: (str(v) if isinstance(v, UUID) else v) for k, v in (metadata or {}).items() if k in allowed}


def record_event(
    event_type: str,
    user_id: UUID | None = None,
    request: Request | None = None,
    metadata: dict | None = None,
    severity: str | None = None,
    evaluate: bool = True,
) -> None:
    """Best-effort: a logging failure never breaks the request."""
    try:
        with conn() as c:
            c.execute(
                "insert into security_events (user_id, event_type, severity, ip_hash, metadata) "
                "values (%s, %s, %s, %s, %s::jsonb)",
                (
                    user_id,
                    event_type,
                    severity or SEVERITY.get(event_type, "info"),
                    ip_hash(client_ip(request)),
                    json.dumps(clean_metadata(event_type, metadata)),
                ),
            )
    except Exception:  # noqa: BLE001
        log.exception("failed to record security event %s", event_type)
        return
    if evaluate and user_id and event_type in {
        "hold_created", "hold_expired", "payment_challenge_failed", "hold_conflict"
    }:
        try:
            from .scoring import evaluate_user

            evaluate_user(user_id)
        except Exception:  # noqa: BLE001
            log.exception("risk evaluation failed")
