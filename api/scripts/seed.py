"""Idempotent seed. Usage: python scripts/seed.py [--reset]

--reset removes ONLY rows created by this script (slugs starting with 'seed-') and re-creates
them with fresh dates. It will fail if real orders reference seeded shows.
"""
import json
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402

from app.layouts import LayoutSpec, bowl, cinema_hall  # noqa: E402
from scripts.migrate import database_url  # noqa: E402

TIERS = [("Standard", 1), ("Premium", 2), ("VIP", 3), ("Balcony", 4)]

# prices in rupees -> paise at insert time
HALL1_PRICES = {"Standard": 250, "Premium": 450, "VIP": 650, "Balcony": 250}
HALL2_PRICES = {"Standard": 350, "Premium": 600, "VIP": 900, "Balcony": 350}
STADIUM_PRICES = {"Standard": 500, "Premium": 1500, "VIP": 5000, "Balcony": 500}
ARENA_PRICES = {"Standard": 2000, "Premium": 3500, "VIP": 8000, "Balcony": 1000}

ITEMS = [
    ("seed-midnight-express-run", "movie", "Midnight Express Run", "Thriller - English/Hindi",
     "A night train, a stolen ledger and sixty minutes to clear a name. (Fictional demo listing.)", "#ef4444"),
    ("seed-the-last-monsoon", "movie", "The Last Monsoon", "Drama - Hindi",
     "A family farm, one more season and a decision that changes everything. (Fictional demo listing.)", "#0ea5e9"),
    ("seed-neon-orbit", "movie", "Neon Orbit", "Sci-fi - English",
     "A salvage crew finds a signal that should not exist. (Fictional demo listing.)", "#a855f7"),
    ("seed-mavericks-vs-challengers", "sports", "Mumbai Mavericks vs Chennai Challengers", "Cricket - T20",
     "Fictional teams in a fictional league, built to demo stadium seat selection.", "#f59e0b"),
    ("seed-premier-derby-night", "sports", "Premier Derby Night", "Football - League match",
     "A fictional derby on a fictional pitch, for the arena demo.", "#10b981"),
    ("seed-aurora-live", "concert", "Aurora Live: Skyline Tour", "Concert - Pop",
     "A fictional headline show with a floor-to-balcony price range.", "#ec4899"),
]


def build_layouts() -> dict[str, LayoutSpec]:
    return {
        "hall1": cinema_hall(rows=10, cols=12, aisle_after=6, rake=0.30, screen_width=13, screen_height=5.5,
                             kind_label="Screen 1 (Large format)"),
        "hall2": cinema_hall(rows=7, cols=10, aisle_after=5, rake=0.22, screen_width=9, screen_height=4.0,
                             recliner_rows=2, kind_label="Screen 3 (Standard)"),
        "stadium": bowl("stadium", stands=8, rows_per_tier=10, seats_per_row=14, field_a=30, field_b=24,
                        vip_stand="South", upper_tier_name="Standard", lower_tier_name="Premium"),
        "arena": bowl("arena", stands=6, rows_per_tier=8, seats_per_row=12, field_a=14, field_b=10,
                      vip_stand="Block 1", upper_tier_name="Balcony", lower_tier_name="Premium"),
    }


def reset(c: psycopg.Connection) -> None:
    # Demo orders/holds on seeded shows would block the delete (FKs without cascade), so clear them first.
    seeded_shows = ("select s.id from shows s join catalog_items ci on ci.id = s.catalog_item_id "
                    "where ci.slug like 'seed-%'")
    c.execute(f"delete from orders where show_id in ({seeded_shows})")
    c.execute(f"update seat_inventory set hold_id = null where show_id in ({seeded_shows})")
    c.execute(f"delete from seat_holds where show_id in ({seeded_shows})")
    c.execute("delete from catalog_items where slug like 'seed-%'")
    c.execute("delete from venues where slug like 'seed-%'")
    print("reset: removed seeded rows")


def run(c: psycopg.Connection) -> None:
    if c.execute("select 1 from catalog_items where slug like 'seed-%' limit 1").fetchone():
        print("already seeded (use --reset to rebuild)")
        return

    tier_ids = {}
    for name, order in TIERS:
        row = c.execute(
            "insert into price_tiers(name, sort_order) values (%s,%s) "
            "on conflict (name) do update set sort_order=excluded.sort_order returning id",
            (name, order),
        ).fetchone()
        tier_ids[name] = row[0]

    layouts = build_layouts()

    def make_space(venue_slug, venue_name, city, vtype, space_slug, space_name, layout: LayoutSpec, venue_id=None):
        if venue_id is None:
            venue_id = c.execute(
                "insert into venues(slug,name,city,venue_type) values (%s,%s,%s,%s) returning id",
                (venue_slug, venue_name, city, vtype),
            ).fetchone()[0]
        space_id = c.execute(
            "insert into venue_spaces(venue_id,slug,name) values (%s,%s,%s) returning id",
            (venue_id, space_slug, space_name),
        ).fetchone()[0]
        layout_id = c.execute(
            "insert into venue_layout_versions(venue_space_id,version,layout_metadata,is_published) "
            "values (%s,1,%s,true) returning id",
            (space_id, json.dumps(layout.metadata)),
        ).fetchone()[0]
        seat_ids: list[tuple[uuid.UUID, str]] = []  # (seat_id, tier name)
        # Sections first (a COPY must not overlap other statements on the same connection).
        section_ids = {}
        for sec in layout.sections:
            section_ids[sec.name] = c.execute(
                "insert into sections(layout_version_id,name,price_tier_id,sort_order) "
                "values (%s,%s,%s,%s) returning id",
                (layout_id, sec.name, tier_ids[sec.tier], sec.sort_order),
            ).fetchone()[0]
        with c.cursor() as cur:
            with cur.copy(
                "copy seats (id, layout_version_id, section_id, row_label, seat_label, x, y, z, orientation, "
                "seat_type, is_accessible) from stdin"
            ) as cp:
                for sec in layout.sections:
                    for s in sec.seats:
                        sid = uuid.uuid4()
                        seat_ids.append((sid, sec.tier))
                        cp.write_row((sid, layout_id, section_ids[sec.name], s.row_label, s.seat_label, s.x,
                                      s.y, s.z, json.dumps({"look": list(s.look)}), s.seat_type,
                                      s.is_accessible))
        return venue_id, space_id, layout_id, seat_ids

    # --- venues ---
    cinema_vid, hall1_space, hall1_layout, hall1_seats = make_space(
        "seed-showzy-cineplex", "Showzy Cineplex", "Mumbai", "cinema", "screen-1", "Screen 1 (Large format)",
        layouts["hall1"])
    _, hall2_space, hall2_layout, hall2_seats = make_space(
        None, None, None, None, "screen-3", "Screen 3 (Standard)", layouts["hall2"], venue_id=cinema_vid)
    stadium_vid, stadium_space, stadium_layout, stadium_seats = make_space(
        "seed-maverick-park", "Maverick Park Stadium", "Mumbai", "stadium", "main-bowl", "Main bowl",
        layouts["stadium"])
    arena_vid, arena_space, arena_layout, arena_seats = make_space(
        "seed-skyline-arena", "Skyline Arena", "Bengaluru", "arena", "arena-bowl", "Arena bowl",
        layouts["arena"])

    item_ids = {}
    for slug, itype, title, subtitle, desc, accent in ITEMS:
        item_ids[slug] = c.execute(
            "insert into catalog_items(slug,item_type,title,subtitle,description,accent) "
            "values (%s,%s,%s,%s,%s,%s) returning id",
            (slug, itype, title, subtitle, desc, accent),
        ).fetchone()[0]

    IST = timezone(timedelta(hours=5, minutes=30))  # show times are written as India local time
    now = datetime.now(IST).replace(minute=0, second=0, microsecond=0)

    def add_show(item_slug, venue_id, space_id, layout_id, seats, prices, starts_at, hours):
        show_id = c.execute(
            "insert into shows(catalog_item_id,venue_id,venue_space_id,layout_version_id,starts_at,ends_at) "
            "values (%s,%s,%s,%s,%s,%s) returning id",
            (item_ids[item_slug], venue_id, space_id, layout_id, starts_at, starts_at + timedelta(hours=hours)),
        ).fetchone()[0]
        for tier, rupees in prices.items():
            c.execute("insert into show_prices(show_id,price_tier_id,price_minor) values (%s,%s,%s)",
                      (show_id, tier_ids[tier], rupees * 100))
        with c.cursor() as cur:
            with cur.copy(
                "copy seat_inventory (show_id, seat_id, status, price_tier_id, current_price_minor, currency) "
                "from stdin"
            ) as cp:
                for seat_id, tier in seats:
                    cp.write_row((show_id, seat_id, "available", tier_ids[tier], prices[tier] * 100, "INR"))
        return show_id

    # movies: each has 3 showtimes across the two halls (different layouts and prices)
    movie_slots = [(1, 14, "hall1"), (1, 18, "hall2"), (2, 21, "hall1"), (3, 12, "hall2"), (3, 20, "hall1")]
    for i, slug in enumerate(["seed-midnight-express-run", "seed-the-last-monsoon", "seed-neon-orbit"]):
        for day, hour, hall in movie_slots:
            d = now.replace(hour=hour) + timedelta(days=day + (i % 2))
            if hall == "hall1":
                add_show(slug, cinema_vid, hall1_space, hall1_layout, hall1_seats, HALL1_PRICES, d, 3)
            else:
                add_show(slug, cinema_vid, hall2_space, hall2_layout, hall2_seats, HALL2_PRICES, d, 3)

    add_show("seed-mavericks-vs-challengers", stadium_vid, stadium_space, stadium_layout, stadium_seats,
             STADIUM_PRICES, (now + timedelta(days=5)).replace(hour=19, minute=30), 4)
    add_show("seed-premier-derby-night", stadium_vid, stadium_space, stadium_layout, stadium_seats,
             STADIUM_PRICES, (now + timedelta(days=7)).replace(hour=20, minute=0), 3)
    add_show("seed-aurora-live", arena_vid, arena_space, arena_layout, arena_seats,
             ARENA_PRICES, (now + timedelta(days=9)).replace(hour=18, minute=0), 3)

    counts = {
        t: c.execute(f"select count(*) from {t}").fetchone()[0]
        for t in ("catalog_items", "shows", "seats", "seat_inventory")
    }
    print("seeded:", counts)


def main() -> None:
    with psycopg.connect(database_url(), connect_timeout=20) as c:
        if "--reset" in sys.argv:
            reset(c)
            c.commit()
        run(c)
        c.commit()


if __name__ == "__main__":
    main()
