from uuid import UUID

from ..config import get_settings
from ..db import conn, fetch_all, fetch_one
from ..errors import AppError, conflict, not_found
from ..security.events import record_event


def calc_fees(subtotal_minor: int, fee_percent: int) -> int:
    """Integer arithmetic, round half up. 4500 for 150000 at 3%."""
    return (subtotal_minor * fee_percent + 50) // 100


def _order_dict(c, order_row: dict) -> dict:
    items = c.execute(
        "select seat_inventory_id, section_name, row_label, seat_label, tier_name, price_minor "
        "from order_items where order_id = %s order by section_name, length(row_label), row_label, "
        "length(seat_label), seat_label", (order_row["id"],)).fetchall()
    meta = c.execute(
        "select ci.title as item_title, s.starts_at, v.name as venue_name, vs.name as space_name "
        "from shows s join catalog_items ci on ci.id = s.catalog_item_id join venues v on v.id = s.venue_id "
        "join venue_spaces vs on vs.id = s.venue_space_id where s.id = %s", (order_row["show_id"],)).fetchone()
    return {**order_row, "items": items, **(meta or {}), "server_time": c.execute("select now() as t").fetchone()["t"]}


def create_order(user_id: UUID, hold_id: UUID, idem_key: str | None, request=None) -> dict:
    fee_percent = get_settings().fee_percent
    with conn() as c:
        if idem_key:
            existing = c.execute("select * from orders where user_id = %s and idempotency_key = %s",
                                 (user_id, idem_key)).fetchone()
            if existing:
                return _order_dict(c, existing)
        hold = c.execute("select * from seat_holds where id = %s and user_id = %s for update",
                         (hold_id, user_id)).fetchone()
        if not hold:
            raise not_found("Hold")
        if c.execute("select 1 from orders where hold_id = %s", (hold_id,)).fetchone():
            raise conflict("An order already exists for this hold.")
        expired = c.execute("select %s <= now() as e", (hold["expires_at"],)).fetchone()["e"]
        if hold["status"] != "active" or expired:
            raise AppError(409, "hold_expired", "Your hold has expired. Please select seats again.")
        items = c.execute(
            """
            select si.id, si.current_price_minor, si.currency, sec.name as section_name,
                   se.row_label, se.seat_label, t.name as tier_name
            from seat_hold_items hi
            join seat_inventory si on si.id = hi.seat_inventory_id
            join seats se on se.id = si.seat_id
            join sections sec on sec.id = se.section_id
            join price_tiers t on t.id = si.price_tier_id
            where hi.hold_id = %s
            """, (hold_id,)).fetchall()
        if not items:
            raise AppError(422, "invalid_request", "Hold has no seats")
        subtotal = sum(i["current_price_minor"] for i in items)
        fees = calc_fees(subtotal, fee_percent)
        order = c.execute(
            "insert into orders (user_id, show_id, hold_id, subtotal_minor, fees_minor, total_minor, currency, "
            "idempotency_key, expires_at) values (%s,%s,%s,%s,%s,%s,%s,%s,%s) returning *",
            (user_id, hold["show_id"], hold_id, subtotal, fees, subtotal + fees, items[0]["currency"],
             idem_key, hold["expires_at"])).fetchone()
        for i in items:
            c.execute(
                "insert into order_items (order_id, seat_inventory_id, section_name, row_label, seat_label, "
                "tier_name, price_minor) values (%s,%s,%s,%s,%s,%s,%s)",
                (order["id"], i["id"], i["section_name"], i["row_label"], i["seat_label"], i["tier_name"],
                 i["current_price_minor"]))
        result = _order_dict(c, order)
    record_event("order_created", user_id, request, {
        "show_id": result["show_id"], "order_id": result["id"], "total_minor": result["total_minor"]},
        evaluate=False)
    return result


def get_order(user_id: UUID, order_id: UUID) -> dict:
    with conn() as c:
        row = c.execute("select * from orders where id = %s and user_id = %s", (order_id, user_id)).fetchone()
        if not row:
            raise not_found("Order")
        return _order_dict(c, row)


def my_bookings(user_id: UUID) -> list[dict]:
    rows = fetch_all(
        """
        select o.id, o.status, o.total_minor, o.currency, o.created_at, o.expires_at,
               ci.title as item_title, s.starts_at, v.name as venue_name, vs.name as space_name
        from orders o
        join shows s on s.id = o.show_id
        join catalog_items ci on ci.id = s.catalog_item_id
        join venues v on v.id = s.venue_id
        join venue_spaces vs on vs.id = s.venue_space_id
        where o.user_id = %s and o.status in ('confirmed_demo','pending_payment')
        order by o.created_at desc
        """, (user_id,))
    for r in rows:
        r["tickets"] = fetch_all(
            "select t.id, t.ticket_code, oi.section_name, oi.row_label, oi.seat_label, oi.tier_name "
            "from tickets t join order_items oi on oi.order_id = t.order_id and "
            "oi.seat_inventory_id = t.seat_inventory_id where t.order_id = %s "
            "order by oi.section_name, oi.row_label, oi.seat_label", (r["id"],))
    return rows


def get_ticket(user_id: UUID, ticket_id: UUID) -> dict:
    row = fetch_one(
        """
        select t.id, t.ticket_code, t.created_at, oi.section_name, oi.row_label, oi.seat_label, oi.tier_name,
               oi.price_minor, o.currency, ci.title as item_title, s.starts_at, v.name as venue_name,
               vs.name as space_name
        from tickets t
        join orders o on o.id = t.order_id
        join order_items oi on oi.order_id = t.order_id and oi.seat_inventory_id = t.seat_inventory_id
        join shows s on s.id = o.show_id
        join catalog_items ci on ci.id = s.catalog_item_id
        join venues v on v.id = s.venue_id
        join venue_spaces vs on vs.id = s.venue_space_id
        where t.id = %s and t.user_id = %s
        """, (ticket_id, user_id))
    if not row:
        raise not_found("Ticket")
    return row
