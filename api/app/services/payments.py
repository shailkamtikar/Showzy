import hashlib
import hmac
import secrets
from uuid import UUID

from ..config import get_settings
from ..db import conn, fetch_one
from ..errors import AppError, not_found
from ..security.events import record_event

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I


def generate_code() -> str:
    pick = lambda n: "".join(secrets.choice(ALPHABET) for _ in range(n))  # noqa: E731
    return f"DEMO-{pick(4)}-{pick(4)}"


def normalize(code: str) -> str:
    return code.strip().upper()


def code_hmac(attempt_id: UUID, code: str) -> str:
    key = get_settings().challenge_pepper.encode()
    return hmac.new(key, f"{attempt_id}:{normalize(code)}".encode(), hashlib.sha256).hexdigest()


def _view(row: dict) -> dict:
    s = get_settings()
    return {
        "attempt_id": row["id"], "order_id": row["order_id"], "status": row["status"],
        "amount_minor": row["amount_minor"], "currency": row["currency"],
        "challenge_expires_at": row["challenge_expires_at"],
        "attempts_left": max(0, s.demo_payment_max_attempts - row["failed_attempt_count"]),
        "simulated_reference": row["simulated_reference"], "demo": True,
    }


def create_or_reissue(user_id: UUID, order_id: UUID) -> dict:
    """Creates a payment attempt for the order (or reissues a new code for the live one).
    The plaintext code exists only in this response; only its HMAC is stored."""
    s = get_settings()
    with conn() as c:
        order = c.execute("select * from orders where id = %s and user_id = %s for update",
                          (order_id, user_id)).fetchone()
        if not order:
            raise not_found("Order")
        hold = c.execute("select status, expires_at, expires_at <= now() as expired from seat_holds where id = %s",
                         (order["hold_id"],)).fetchone()
        if order["status"] != "pending_payment" or hold["status"] != "active" or hold["expired"]:
            raise AppError(409, "order_not_payable", "This order can no longer be paid. Please select seats again.")
        code = generate_code()
        live = c.execute("select id from demo_payment_attempts where order_id = %s "
                         "and status in ('created','challenge_issued') for update", (order_id,)).fetchone()
        if live:
            attempt_id = live["id"]
            c.execute(
                "update demo_payment_attempts set challenge_hash = %s, status = 'challenge_issued', "
                "challenge_expires_at = now() + make_interval(secs => %s), updated_at = now() where id = %s",
                (code_hmac(attempt_id, code), s.demo_payment_challenge_ttl_seconds, attempt_id))
        else:
            row = c.execute(
                "insert into demo_payment_attempts (order_id, user_id, amount_minor, currency, status) "
                "values (%s,%s,%s,%s,'created') returning id",
                (order_id, user_id, order["total_minor"], order["currency"])).fetchone()
            attempt_id = row["id"]
            c.execute(
                "update demo_payment_attempts set challenge_hash = %s, status = 'challenge_issued', "
                "challenge_expires_at = now() + make_interval(secs => %s) where id = %s",
                (code_hmac(attempt_id, code), s.demo_payment_challenge_ttl_seconds, attempt_id))
        out = c.execute("select * from demo_payment_attempts where id = %s", (attempt_id,)).fetchone()
    return {**_view(out), "challenge": code}


def get_attempt(user_id: UUID, attempt_id: UUID) -> dict:
    row = fetch_one("select * from demo_payment_attempts where id = %s and user_id = %s", (attempt_id, user_id))
    if not row:
        raise not_found("Payment attempt")
    return _view(row)


def confirm(user_id: UUID, attempt_id: UUID, code: str, request=None) -> dict:
    s = get_settings()
    before = fetch_one("select status from demo_payment_attempts where id = %s and user_id = %s",
                       (attempt_id, user_id))
    was_failed = bool(before and before["status"] == "failed")
    with conn() as c:
        res = c.execute("select * from confirm_demo_payment(%s, %s, %s, %s)",
                        (attempt_id, user_id, code_hmac(attempt_id, code), s.demo_payment_max_attempts)).fetchone()
    result = res["result"]
    if result == "not_found":
        raise not_found("Payment attempt")
    if result in ("ok", "already"):
        if result == "ok":
            record_event("payment_succeeded", user_id, request,
                         {"attempt_id": attempt_id, "order_id": res["order_id"]}, evaluate=False)
        with conn() as c:
            tickets = c.execute(
                "select t.id, t.ticket_code, oi.section_name, oi.row_label, oi.seat_label "
                "from tickets t join order_items oi on oi.order_id = t.order_id and "
                "oi.seat_inventory_id = t.seat_inventory_id where t.order_id = %s "
                "order by oi.section_name, oi.row_label, oi.seat_label", (res["order_id"],)).fetchall()
        return {"status": "succeeded_simulated", "simulated": True, "order_id": res["order_id"],
                "reference": res["reference"], "tickets": tickets}
    failed = fetch_one("select status, failed_attempt_count from demo_payment_attempts where id = %s", (attempt_id,))
    record_event("payment_challenge_failed", user_id, request,
                 {"attempt_id": attempt_id, "failed_count": failed["failed_attempt_count"] if failed else None})
    # The try that reaches the limit still answers "invalid"; any later try (even the right code) is locked.
    if result == "locked" or was_failed:
        raise AppError(423, "attempt_locked", "Too many wrong codes. This payment attempt is locked.")
    # Same generic message for wrong and expired codes.
    raise AppError(400, "invalid_or_expired_code", "That code is invalid or has expired.")


def cancel(user_id: UUID, attempt_id: UUID) -> dict:
    with conn() as c:
        row = c.execute("select * from demo_payment_attempts where id = %s and user_id = %s for update",
                        (attempt_id, user_id)).fetchone()
        if not row:
            raise not_found("Payment attempt")
        if row["status"] in ("created", "challenge_issued"):
            c.execute("update demo_payment_attempts set status = 'cancelled', updated_at = now() where id = %s",
                      (attempt_id,))
            row = c.execute("select * from demo_payment_attempts where id = %s", (attempt_id,)).fetchone()
    return _view(row)
