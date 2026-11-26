"""Pure unit tests: no network, no DB."""
import json
from datetime import datetime, timedelta, timezone

import pytest

from app.ai.client import AIInvalidOutput, AIUnavailable, generate_structured
from app.ai.redact import redact
from app.config import Settings
from app.layouts import bowl, cinema_hall
from app.security import rules
from app.security.policy import band
from app.services.orders import calc_fees
from app.services.payments import ALPHABET, code_hmac, generate_code, normalize

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)


def ev(kind, minutes_ago=1, n=1, **meta):
    return [{"event_type": kind, "created_at": NOW - timedelta(minutes=minutes_ago), "metadata": meta, "ip_hash": None}
            for _ in range(n)]


# ---- layouts
def test_cinema_counts_and_unique_coords():
    spec = cinema_hall(rows=8, cols=10, aisle_after=5)
    assert spec.seat_count == 80
    coords = {(s.x, s.y, s.z) for sec in spec.sections for s in sec.seats}
    assert len(coords) == 80
    s = spec.sections[0].seats[0]
    assert s.look[2] < 0, "front seat looks toward the screen at z=0"


def test_two_halls_differ():
    assert cinema_hall(10, 12, 6).seat_count != cinema_hall(7, 10, 5).seat_count


def test_bowl_counts_and_labels_unique():
    spec = bowl("stadium", stands=8, rows_per_tier=4, seats_per_row=6, field_a=30, field_b=24)
    assert spec.seat_count == 8 * 2 * 4 * 6
    keys = {(sec.name, s.row_label, s.seat_label) for sec in spec.sections for s in sec.seats}
    assert len(keys) == spec.seat_count
    assert any(sec.tier == "VIP" for sec in spec.sections)


# ---- fees
@pytest.mark.parametrize("subtotal,pct,expected", [(150000, 3, 4500), (25000, 3, 750), (1, 3, 0), (50, 3, 2), (0, 3, 0)])
def test_fees(subtotal, pct, expected):
    assert calc_fees(subtotal, pct) == expected


# ---- challenge codes
def test_code_format_and_alphabet():
    import re

    seen = set()
    for _ in range(3000):
        c = generate_code()
        assert re.fullmatch(r"DEMO-[A-Z2-9]{4}-[A-Z2-9]{4}", c)
        assert all(ch in ALPHABET or ch in "DEMO-" for ch in c)
        seen.add(c)
    assert len(seen) > 2990


def test_hmac_binds_attempt_and_normalizes():
    import uuid

    a, b = uuid.uuid4(), uuid.uuid4()
    assert code_hmac(a, "demo-abcd-efgh") == code_hmac(a, " DEMO-ABCD-EFGH ")
    assert code_hmac(a, "DEMO-ABCD-EFGH") != code_hmac(b, "DEMO-ABCD-EFGH")
    assert normalize(" x ") == "X"


# ---- rules
def test_hoarding_threshold_both_sides():
    assert rules.repeated_expired_holds(ev("hold_expired", n=3), NOW) is None
    assert rules.repeated_expired_holds(ev("hold_expired", n=5), NOW).code == "repeated_expired_holds"


def test_window_expiry():
    assert rules.repeated_expired_holds(ev("hold_expired", minutes_ago=40, n=9), NOW) is None


def test_velocity_probing_bulk():
    assert rules.high_seat_selection_velocity(ev("hold_created", n=9), NOW)
    assert rules.high_seat_selection_velocity(ev("hold_created", n=7), NOW) is None
    assert rules.payment_probing(ev("payment_challenge_failed", n=5), NOW)
    assert rules.payment_probing(ev("payment_challenge_failed", n=4), NOW) is None
    assert rules.bulk_reservation(ev("hold_created", n=3, seat_count=6), NOW)
    assert rules.bulk_reservation(ev("hold_created", n=3, seat_count=2), NOW) is None


def test_score_bounded_and_clean_user_zero():
    events = (ev("hold_expired", n=6) + ev("hold_created", n=9) + ev("payment_challenge_failed", n=6)
              + ev("seatmap_requested", n=150))
    total, reasons = rules.evaluate(events, NOW)
    assert total == 100 and len(reasons) >= 4
    assert rules.evaluate(ev("hold_created", n=1, seat_count=2), NOW)[0] == 0


def test_ip_only_signal_cannot_open_case():
    total, reasons = rules.evaluate(ev("seatmap_requested", n=500), NOW)
    assert [r.code for r in reasons] == ["api_scraping"]
    assert not rules.case_worthy(reasons, 100)  # no single-signal accusation
    t2, r2 = rules.evaluate(ev("hold_expired", n=6) + ev("hold_created", n=9), NOW)
    assert rules.case_worthy(r2, t2)


@pytest.mark.parametrize("score,expected", [(0, "none"), (29, "none"), (30, "log_only"), (59, "log_only"),
                                            (60, "restrict"), (79, "restrict"), (80, "restrict_and_review"),
                                            (100, "restrict_and_review")])
def test_policy_bands(score, expected):
    assert band(score) == expected


# ---- redaction
def test_redaction():
    text = ("mail a.b@x.com token eyJabcdefgh.ijklmnopq.rstuvwxyz key sb_secret_AAA digits 123456789012 "
            "ip 10.1.2.3 code DEMO-ABCD-EFGH")
    out = redact(text)
    for bad in ("a.b@x.com", "eyJabcdefgh", "sb_secret_AAA", "123456789012", "10.1.2.3", "DEMO-ABCD-EFGH"):
        assert bad not in out


# ---- config
def test_model_locked_to_flash_lite(monkeypatch):
    base = dict(supabase_url="https://x", supabase_jwt_issuer="i", database_url="d", challenge_pepper="p",
                ip_hash_pepper="q")
    assert Settings(_env_file=None, **base).gemini_model == "gemini-3.5-flash-lite"
    with pytest.raises(Exception):
        Settings(_env_file=None, gemini_model="gemini-2.5-flash", **base)


# ---- AI client (mocked SDK)
class Out(__import__("pydantic").BaseModel):
    ok: bool


def test_ai_valid_output():
    assert generate_structured("hi", Out, call=lambda p, s: json.dumps({"ok": True})).ok is True


def test_ai_invalid_output_retries_once_then_fails():
    calls = []

    def bad(p, s):
        calls.append(1)
        return "not json"

    with pytest.raises(AIInvalidOutput):
        generate_structured("hi", Out, call=bad)
    assert len(calls) == 2


def test_ai_quota_error_is_unavailable_without_retry():
    calls = []

    def boom(p, s):
        calls.append(1)
        raise RuntimeError("429 quota")

    with pytest.raises(AIUnavailable):
        generate_structured("hi", Out, call=boom)
    assert len(calls) == 1


def test_ai_prompt_is_redacted_before_call():
    seen = {}

    def spy(p, s):
        seen["p"] = p
        return json.dumps({"ok": True})

    generate_structured("contact a@b.com", Out, call=spy)
    assert "a@b.com" not in seen["p"]
