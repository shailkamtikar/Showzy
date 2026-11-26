"""Pure, explainable detection rules over lists of event dicts.

Each event: {"event_type": str, "created_at": datetime, "metadata": dict, "ip_hash": str|None}.
A rule returns a Reason or None. Thresholds live in THRESHOLDS so tests and tuning are easy.
"""
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone

DETECTOR_VERSION = "1"

THRESHOLDS = {
    "repeated_expired_holds": {"count": 4, "window_min": 15, "weight": 40},
    "high_seat_selection_velocity": {"count": 8, "window_min": 5, "weight": 30},
    "payment_probing": {"count": 5, "window_min": 10, "weight": 35},
    "bulk_reservation": {"count": 3, "window_min": 30, "weight": 20, "seats": 6},
    "api_scraping": {"count": 100, "window_min": 5, "weight": 25},
}
CASE_THRESHOLD = 60


@dataclass
class Reason:
    code: str
    weight: int
    count: int
    window_min: int
    detail: str

    def as_dict(self) -> dict:
        return asdict(self)


def _within(events: list[dict], etype: str, minutes: int, now: datetime) -> list[dict]:
    cutoff = now - timedelta(minutes=minutes)
    return [e for e in events if e["event_type"] == etype and e["created_at"] >= cutoff]


def repeated_expired_holds(events, now) -> Reason | None:
    t = THRESHOLDS["repeated_expired_holds"]
    n = len(_within(events, "hold_expired", t["window_min"], now))
    if n >= t["count"]:
        return Reason("repeated_expired_holds", t["weight"], n, t["window_min"],
                      f"{n} holds expired unpaid in {t['window_min']} minutes")
    return None


def high_seat_selection_velocity(events, now) -> Reason | None:
    t = THRESHOLDS["high_seat_selection_velocity"]
    n = len(_within(events, "hold_created", t["window_min"], now))
    if n >= t["count"]:
        return Reason("high_seat_selection_velocity", t["weight"], n, t["window_min"],
                      f"{n} seat holds created in {t['window_min']} minutes")
    return None


def payment_probing(events, now) -> Reason | None:
    t = THRESHOLDS["payment_probing"]
    n = len(_within(events, "payment_challenge_failed", t["window_min"], now))
    if n >= t["count"]:
        return Reason("payment_probing", t["weight"], n, t["window_min"],
                      f"{n} wrong payment challenge codes in {t['window_min']} minutes")
    return None


def bulk_reservation(events, now) -> Reason | None:
    t = THRESHOLDS["bulk_reservation"]
    big = [e for e in _within(events, "hold_created", t["window_min"], now)
           if int(e.get("metadata", {}).get("seat_count", 0)) >= t["seats"]]
    if len(big) >= t["count"]:
        return Reason("bulk_reservation", t["weight"], len(big), t["window_min"],
                      f"{len(big)} maximum-size seat holds in {t['window_min']} minutes")
    return None


def api_scraping(events, now) -> Reason | None:
    t = THRESHOLDS["api_scraping"]
    n = len(_within(events, "seatmap_requested", t["window_min"], now))
    if n >= t["count"]:
        return Reason("api_scraping", t["weight"], n, t["window_min"],
                      f"{n} seat map requests in {t['window_min']} minutes")
    return None


USER_RULES = [repeated_expired_holds, high_seat_selection_velocity, payment_probing, bulk_reservation, api_scraping]
IP_ONLY_RULES = {"api_scraping"}


def score(reasons: list[Reason]) -> int:
    return min(100, sum(r.weight for r in reasons))


def evaluate(events: list[dict], now: datetime | None = None) -> tuple[int, list[Reason]]:
    now = now or datetime.now(timezone.utc)
    reasons = [r for rule in USER_RULES if (r := rule(events, now))]
    return score(reasons), reasons


def case_worthy(reasons: list[Reason], total: int) -> bool:
    """A case needs score >= threshold AND at least one non-IP-only signal (no single-signal IP accusation)."""
    return total >= CASE_THRESHOLD and any(r.code not in IP_ONLY_RULES for r in reasons)
