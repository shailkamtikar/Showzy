from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth import CurrentUser
from ..db import conn, fetch_all
from ..deps import require_admin
from ..errors import conflict, invalid, not_found
from .security_admin import audit

router = APIRouter(prefix="/api/admin", tags=["admin-catalog"])


class ItemIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    item_type: Literal["movie", "sports", "concert", "event"]
    subtitle: str = Field("", max_length=160)
    description: str = Field("", max_length=1000)
    accent: str = Field("#6366f1", pattern=r"^#[0-9a-fA-F]{6}$")


class ShowIn(BaseModel):
    catalog_item_id: UUID
    venue_space_id: UUID
    starts_at: datetime
    prices: dict[str, int]  # tier name -> rupees


@router.get("/venue-spaces")
def venue_spaces(user: CurrentUser = Depends(require_admin)):
    return {"items": fetch_all(
        "select vs.id, vs.name as space_name, v.name as venue_name, v.city, v.venue_type, "
        "(select string_agg(distinct t.name, ',') from sections sec join price_tiers t on t.id = sec.price_tier_id "
        " where sec.layout_version_id = lv.id) as tiers "
        "from venue_spaces vs join venues v on v.id = vs.venue_id "
        "join lateral (select id from venue_layout_versions where venue_space_id = vs.id and is_published "
        "order by version desc limit 1) lv on true order by v.name, vs.name")}


@router.post("/catalog", status_code=201)
def create_item(body: ItemIn, user: CurrentUser = Depends(require_admin)):
    slug = "item-" + str(abs(hash((body.title, datetime.utcnow().timestamp()))))[:10]
    with conn() as c:
        row = c.execute(
            "insert into catalog_items (slug, item_type, title, subtitle, description, accent) "
            "values (%s,%s,%s,%s,%s,%s) returning id, slug, title", (slug, body.item_type, body.title,
                                                                    body.subtitle, body.description, body.accent)
        ).fetchone()
        audit(c, user.id, "create_item", "catalog_item", str(row["id"]), {"title": body.title})
    return row


@router.post("/shows", status_code=201)
def create_show(body: ShowIn, user: CurrentUser = Depends(require_admin)):
    if any(p <= 0 for p in body.prices.values()):
        raise invalid("Prices must be greater than zero.")
    with conn() as c:
        if not c.execute("select 1 from catalog_items where id = %s", (body.catalog_item_id,)).fetchone():
            raise not_found("Listing")
        space = c.execute(
            "select vs.id, vs.venue_id, lv.id as layout_id from venue_spaces vs "
            "join lateral (select id from venue_layout_versions where venue_space_id = vs.id and is_published "
            "order by version desc limit 1) lv on true where vs.id = %s", (body.venue_space_id,)).fetchone()
        if not space:
            raise not_found("Venue space with a published layout")
        needed = {r["name"] for r in c.execute(
            "select distinct t.name from sections sec join price_tiers t on t.id = sec.price_tier_id "
            "where sec.layout_version_id = %s", (space["layout_id"],)).fetchall()}
        missing = sorted(needed - set(body.prices))
        if missing:
            raise invalid(f"Missing prices for tiers: {', '.join(missing)}")
        show = c.execute(
            "insert into shows (catalog_item_id, venue_id, venue_space_id, layout_version_id, starts_at) "
            "values (%s,%s,%s,%s,%s) returning id",
            (body.catalog_item_id, space["venue_id"], space["id"], space["layout_id"], body.starts_at)).fetchone()
        for tier, rupees in body.prices.items():
            if tier in needed:
                c.execute("insert into show_prices (show_id, price_tier_id, price_minor) "
                          "select %s, id, %s from price_tiers where name = %s", (show["id"], rupees * 100, tier))
        c.execute(
            "insert into seat_inventory (show_id, seat_id, status, price_tier_id, current_price_minor, currency) "
            "select %s, se.id, 'available', sec.price_tier_id, sp.price_minor, 'INR' from seats se "
            "join sections sec on sec.id = se.section_id "
            "join show_prices sp on sp.show_id = %s and sp.price_tier_id = sec.price_tier_id "
            "where se.layout_version_id = %s", (show["id"], show["id"], space["layout_id"]))
        n = c.execute("select count(*)::int as n from seat_inventory where show_id = %s", (show["id"],)).fetchone()["n"]
        audit(c, user.id, "create_show", "show", str(show["id"]), {"seats": n})
    return {"id": show["id"], "seats": n}


@router.post("/shows/{show_id}/cancel")
def cancel_show(show_id: UUID, user: CurrentUser = Depends(require_admin)):
    with conn() as c:
        show = c.execute("select status from shows where id = %s for update", (show_id,)).fetchone()
        if not show:
            raise not_found("Show")
        if show["status"] == "cancelled":
            raise conflict("Show is already cancelled.")
        c.execute("update shows set status = 'cancelled' where id = %s", (show_id,))
        c.execute("update seat_holds set status = 'released' where show_id = %s and status = 'active'", (show_id,))
        c.execute("update seat_inventory set status = 'available', hold_id = null "
                  "where show_id = %s and status = 'held'", (show_id,))
        audit(c, user.id, "cancel_show", "show", str(show_id))
    return {"id": show_id, "status": "cancelled"}
