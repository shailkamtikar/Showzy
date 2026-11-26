from uuid import UUID

from ..db import fetch_all, fetch_one
from ..errors import not_found

# Shows that started up to 3 hours ago still count as "current" for the demo.
UPCOMING = "s.status = 'scheduled' and s.starts_at > now() - interval '3 hours'"


def list_catalog(item_type: str | None, q: str | None, limit: int, offset: int) -> dict:
    where = ["ci.status = 'active'"]
    params: list = []
    if item_type:
        where.append("ci.item_type = %s")
        params.append(item_type)
    if q:
        where.append("(ci.title ilike %s or ci.subtitle ilike %s)")
        params += [f"%{q}%", f"%{q}%"]
    wsql = " and ".join(where)
    total = fetch_one(f"select count(*) as n from catalog_items ci where {wsql}", params)["n"]
    rows = fetch_all(
        f"""
        select ci.id, ci.slug, ci.item_type, ci.title, ci.subtitle, ci.description, ci.poster_url, ci.accent,
               agg.show_count, agg.next_show_at, agg.min_price_minor, agg.max_price_minor,
               agg.available, agg.venues
        from catalog_items ci
        left join lateral (
          select count(distinct s.id)::int as show_count,
                 min(s.starts_at) as next_show_at,
                 min(si.current_price_minor) filter (where si.status = 'available') as min_price_minor,
                 max(si.current_price_minor) filter (where si.status = 'available') as max_price_minor,
                 (count(si.id) filter (where si.status = 'available'))::int as available,
                 array_agg(distinct v.name || ', ' || v.city) as venues
          from shows s
          join venues v on v.id = s.venue_id
          join seat_inventory si on si.show_id = s.id
          where s.catalog_item_id = ci.id and {UPCOMING}
        ) agg on true
        where {wsql}
        order by agg.next_show_at nulls last, ci.title
        limit %s offset %s
        """,
        params + [limit, offset],
    )
    for r in rows:
        r["currency"] = "INR"
        r["sold_out"] = bool(r["show_count"]) and not r["available"]
    return {"items": rows, "total": total, "limit": limit, "offset": offset}


def get_item(item_id: UUID) -> dict:
    row = fetch_one(
        "select id, slug, item_type, title, subtitle, description, poster_url, accent "
        "from catalog_items where id = %s and status = 'active'",
        (item_id,),
    )
    if not row:
        raise not_found("Listing")
    return row


def list_shows(item_id: UUID) -> list[dict]:
    get_item(item_id)
    return fetch_all(
        f"""
        select s.id, s.starts_at, s.ends_at, s.currency, s.status,
               v.name as venue_name, v.city as venue_city, v.venue_type,
               vs.name as space_name, s.layout_version_id,
               p.min_price_minor, p.max_price_minor, p.available
        from shows s
        join venues v on v.id = s.venue_id
        join venue_spaces vs on vs.id = s.venue_space_id
        left join lateral (
          select min(current_price_minor) filter (where status = 'available') as min_price_minor,
                 max(current_price_minor) filter (where status = 'available') as max_price_minor,
                 (count(*) filter (where status = 'available'))::int as available
          from seat_inventory where show_id = s.id
        ) p on true
        where s.catalog_item_id = %s and {UPCOMING}
        order by s.starts_at
        """,
        (item_id,),
    )


def get_show(show_id: UUID) -> dict:
    row = fetch_one(
        """
        select s.id, s.catalog_item_id, s.starts_at, s.ends_at, s.status, s.currency, s.layout_version_id,
               ci.title as item_title, ci.item_type, ci.accent,
               v.id as venue_id, v.name as venue_name, v.city as venue_city, v.venue_type,
               vs.name as space_name, lv.layout_metadata
        from shows s
        join catalog_items ci on ci.id = s.catalog_item_id
        join venues v on v.id = s.venue_id
        join venue_spaces vs on vs.id = s.venue_space_id
        join venue_layout_versions lv on lv.id = s.layout_version_id
        where s.id = %s
        """,
        (show_id,),
    )
    if not row:
        raise not_found("Show")
    return row


def price_range(show_id: UUID) -> dict:
    get_show(show_id)
    row = fetch_one(
        """
        select min(current_price_minor) filter (where status = 'available') as min_price_minor,
               max(current_price_minor) filter (where status = 'available') as max_price_minor,
               (count(*) filter (where status = 'available'))::int as available,
               count(*)::int as total, max(currency) as currency, now() as as_of
        from seat_inventory where show_id = %s
        """,
        (show_id,),
    )
    row["starting_price_minor"] = row["min_price_minor"]
    row["sold_out"] = row["available"] == 0
    return row


def sections(show_id: UUID) -> list[dict]:
    get_show(show_id)
    return fetch_all(
        """
        select sec.id, sec.name, t.name as tier, sec.sort_order,
               count(si.id)::int as total,
               (count(si.id) filter (where si.status = 'available'))::int as available,
               min(si.current_price_minor) as min_price_minor, max(si.current_price_minor) as max_price_minor
        from shows sh
        join sections sec on sec.layout_version_id = sh.layout_version_id
        join price_tiers t on t.id = sec.price_tier_id
        join seats se on se.section_id = sec.id
        join seat_inventory si on si.seat_id = se.id and si.show_id = sh.id
        where sh.id = %s
        group by sec.id, sec.name, t.name, sec.sort_order
        order by sec.sort_order
        """,
        (show_id,),
    )


def seats(show_id: UUID, section_id: UUID | None) -> list[dict]:
    get_show(show_id)
    params: list = [show_id]
    extra = ""
    if section_id:
        extra = "and se.section_id = %s"
        params.append(section_id)
    return fetch_all(
        f"""
        select si.id, se.section_id, se.row_label as row, se.seat_label as label,
               se.x, se.y, se.z, se.seat_type, se.is_accessible as accessible,
               case when si.status = 'held' and h.expires_at <= now() then 'available'
                    else si.status::text end as status,
               si.current_price_minor as price_minor, t.name as tier
        from seat_inventory si
        join seats se on se.id = si.seat_id
        join price_tiers t on t.id = si.price_tier_id
        join sections sec on sec.id = se.section_id
        left join seat_holds h on h.id = si.hold_id
        where si.show_id = %s {extra}
        order by sec.sort_order, length(se.row_label), se.row_label, length(se.seat_label), se.seat_label
        """,
        params,
    )
