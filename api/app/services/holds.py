from uuid import UUID

import psycopg.errors

from ..config import get_settings
from ..db import conn, fetch_all, fetch_one
from ..errors import AppError, conflict, invalid, not_found
from ..security.events import record_event


def expire_stale(show_id: UUID | None = None, request=None) -> None:
    """Opportunistic cleanup; correctness never depends on a timer."""
    with conn() as c:
        rows = c.execute("select * from release_expired_holds(%s)", (show_id,)).fetchall()
    for r in rows:
        record_event("hold_expired", r["user_id"], request, {
            "show_id": r["show_id"], "seat_count": r["seat_count"], "hold_id": r["hold_id"]})


def create_hold(user_id: UUID, show_id: UUID, inventory_ids: list[UUID], request=None) -> dict:
    s = get_settings()
    # Expire stale holds in Python first so each expiry is recorded as a security event
    # (the SQL function cleans up too, but silently).
    expire_stale(show_id, request)
    try:
        with conn() as c:
            row = c.execute(
                "select * from create_hold(%s, %s, %s, %s, %s, %s)",
                (user_id, show_id, inventory_ids, s.hold_duration_seconds, s.max_seats_per_order,
                 s.max_active_holds_per_user),
            ).fetchone()
    except psycopg.errors.RaiseException as e:
        code = e.diag.message_primary or ""
        if code == "SEAT_UNAVAILABLE":
            taken = [str(r["id"]) for r in fetch_all(
                "select id from seat_inventory where id = any(%s) and status <> 'available'", (inventory_ids,))]
            record_event("hold_conflict", user_id, request, {"show_id": show_id, "seat_count": len(inventory_ids)})
            raise conflict("Some seats were just taken. Please choose different seats.", unavailable=taken) from None
        if code == "HOLD_LIMIT":
            raise AppError(409, "hold_limit", "You already have the maximum number of active holds. "
                           "Finish or release one first.") from None
        if code == "TOO_MANY_SEATS":
            raise invalid(f"You can hold at most {s.max_seats_per_order} seats at once.") from None
        if code == "SHOW_NOT_AVAILABLE":
            raise conflict("This show is not available for booking.") from None
        raise invalid("Invalid seat selection.") from None
    record_event("hold_created", user_id, request, {
        "show_id": show_id, "seat_count": len(inventory_ids), "hold_id": row["hold_id"]})
    return get_hold(user_id, row["hold_id"], expire=False)


def get_hold(user_id: UUID, hold_id: UUID, expire: bool = True) -> dict:
    if expire:
        expire_stale()
    h = fetch_one(
        "select id, show_id, status, created_at, expires_at, now() as server_time from seat_holds "
        "where id = %s and user_id = %s", (hold_id, user_id))
    if not h:
        raise not_found("Hold")
    items = fetch_all("select seat_inventory_id from seat_hold_items where hold_id = %s", (hold_id,))
    h["seat_inventory_ids"] = [i["seat_inventory_id"] for i in items]
    return h


def release_all_holds(user_id: UUID, request=None) -> int:
    """Lets a customer drop every active hold (for example after abandoning a checkout)."""
    ids = [r["id"] for r in fetch_all(
        "select id from seat_holds where user_id = %s and status = 'active'", (user_id,))]
    for hid in ids:
        release_hold(user_id, hid, request)
    return len(ids)


def release_hold(user_id: UUID, hold_id: UUID, request=None) -> None:
    with conn() as c:
        h = c.execute("select id, show_id, status from seat_holds where id = %s and user_id = %s for update",
                      (hold_id, user_id)).fetchone()
        if not h:
            raise not_found("Hold")
        if h["status"] != "active":
            return  # idempotent
        c.execute("update seat_holds set status = 'released' where id = %s", (hold_id,))
        c.execute("update seat_inventory set status = 'available', hold_id = null "
                  "where hold_id = %s and status = 'held'", (hold_id,))
        c.execute("update orders set status = 'cancelled' where hold_id = %s and status = 'pending_payment'",
                  (hold_id,))
        c.execute("update demo_payment_attempts set status = 'cancelled', updated_at = now() "
                  "where status in ('created','challenge_issued') and order_id in "
                  "(select id from orders where hold_id = %s)", (hold_id,))
    record_event("hold_released", user_id, request, {"show_id": h["show_id"], "hold_id": hold_id}, evaluate=False)
