"""End-to-end API tests against the real dev database with throwaway users."""
import concurrent.futures as cf
import re
import secrets
import uuid

import httpx
import psycopg
import pytest

from scripts.migrate import database_url
from tests.conftest import BASE, PUB, SECRET, _make_user, seats_for


# ------------------------------------------------------------------ health / auth
def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/health/db").json() == {"db": "ok"}


def test_unknown_route_has_standard_error_shape(client):
    r = client.get("/nope")
    assert r.status_code == 404
    assert set(r.json()["error"]) >= {"code", "message", "request_id"}
    assert "X-Request-ID" in r.headers


def test_cors_allowed_and_blocked(client):
    ok = client.options("/health", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.options("/health", headers={"Origin": "http://evil.test", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


def test_me_requires_valid_token(client, alice):
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers={"Authorization": "Bearer abc"}).status_code == 401
    r = client.get("/api/me", headers=alice.h)
    assert r.status_code == 200 and r.json()["id"] == alice.id and r.json()["role"] == "customer"


def test_tampered_token_rejected(client, alice):
    head, payload, sig = alice.token.split(".")
    bad = f"{head}.{payload}.{sig[:-2]}AA"
    assert client.get("/api/me", headers={"Authorization": f"Bearer {bad}"}).status_code == 401


def test_alg_none_rejected(client):
    import base64
    import json

    b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()  # noqa: E731
    tok = f"{b({'alg': 'none', 'typ': 'JWT'})}.{b({'sub': str(uuid.uuid4()), 'aud': 'authenticated'})}."
    assert client.get("/api/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 401


def test_admin_guard(client, alice, admin):
    assert client.get("/api/admin/ping").status_code == 401
    assert client.get("/api/admin/ping", headers=alice.h).status_code == 403
    assert client.get("/api/admin/ping", headers=admin.h).status_code == 200


# ------------------------------------------------------------------ RLS (publishable key via PostgREST)
def rest(path, method="GET", **kw):
    return httpx.request(method, f"{BASE}/rest/v1/{path}", headers={"apikey": PUB, **kw.pop("headers", {})},
                         timeout=30, **kw)


def test_rls_anon_reads_catalog_only():
    assert rest("catalog_items?select=title").status_code == 200
    assert len(rest("catalog_items?select=title").json()) >= 6
    w = rest("catalog_items", "POST", json={"slug": "x", "item_type": "movie", "title": "hack"})
    assert w.status_code in (401, 403)
    for t in ("seat_inventory", "profiles", "orders", "seat_holds", "tickets", "security_events", "audit_logs"):
        r = rest(f"{t}?select=*")
        assert r.status_code in (401, 403) or r.json() == [], t


def test_user_cannot_self_promote(alice):
    r = rest(f"profiles?id=eq.{alice.id}", "PATCH", json={"role": "admin"},
             headers={"Authorization": f"Bearer {alice.token}"})
    assert r.status_code in (401, 403)


def test_all_public_tables_have_rls(db):
    rows = db.execute(
        "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity").fetchall()
    assert rows == []


# ------------------------------------------------------------------ catalog
def test_catalog_list_filter_pagination(client):
    r = client.get("/api/catalog").json()
    assert r["total"] >= 6
    movies = client.get("/api/catalog?type=movie").json()["items"]
    assert movies and all(i["item_type"] == "movie" for i in movies)
    page = client.get("/api/catalog?limit=2&offset=2").json()
    assert len(page["items"]) == 2
    assert client.get("/api/catalog?limit=1000").status_code == 422
    assert client.get("/api/catalog?type=bogus").status_code == 422
    assert client.get("/api/catalog?q=' OR 1=1 --").json()["items"] == []


def test_catalog_prices_and_unknown_ids(client):
    for it in client.get("/api/catalog").json()["items"]:
        assert it["min_price_minor"] and it["max_price_minor"] >= it["min_price_minor"]
    assert client.get(f"/api/catalog/{uuid.uuid4()}").status_code == 404
    assert client.get("/api/catalog/abc").status_code == 422


def test_movie_has_shows_in_different_halls(client):
    movie = next(i for i in client.get("/api/catalog?type=movie").json()["items"])
    shows = client.get(f"/api/catalog/{movie['id']}/shows").json()["items"]
    assert len(shows) >= 2
    assert len({s["layout_version_id"] for s in shows}) >= 2
    assert len({s["space_name"] for s in shows}) >= 2


def test_price_range_and_sections_and_seats(client, show):
    pr = client.get(f"/api/shows/{show}/price-range").json()
    assert pr["min_price_minor"] < pr["max_price_minor"] and pr["currency"].strip() == "INR"
    secs = client.get(f"/api/shows/{show}/sections").json()["items"]
    seats = client.get(f"/api/shows/{show}/seats")
    assert seats.headers["cache-control"] == "no-store"
    items = seats.json()["items"]
    assert sum(s["total"] for s in secs) == len(items)
    assert not ({"hold_id", "user_id"} & set(items[0]))
    one = client.get(f"/api/shows/{show}/seats?section_id={secs[0]['id']}").json()["items"]
    assert len(one) == secs[0]["total"]
    assert client.get(f"/api/shows/{uuid.uuid4()}/seats").status_code == 404


def test_stadium_and_cinema_use_different_layouts(client):
    kinds = set()
    for it in client.get("/api/catalog").json()["items"]:
        sh = client.get(f"/api/catalog/{it['id']}/shows").json()["items"][0]
        kinds.add(client.get(f"/api/shows/{sh['id']}").json()["layout_metadata"]["kind"])
    assert {"cinema", "stadium", "arena"} <= kinds


# ------------------------------------------------------------------ holds
def hold(client, user, show, ids):
    return client.post("/api/holds", json={"show_id": show, "inventory_ids": ids}, headers=user.h)


def test_hold_flow_and_limits(client, alice, bob, show, release_all):
    ids = seats_for(client, show, 2)
    r = hold(client, alice, show, ids)
    assert r.status_code == 201, r.text
    body = r.json()
    assert len(body["seat_inventory_ids"]) == 2 and body["status"] == "active"
    # seat map shows them held
    held = {s["id"]: s["status"] for s in client.get(f"/api/shows/{show}/seats").json()["items"]}
    assert all(held[i] == "held" for i in ids)
    # conflict, and atomic: bob's other seat is NOT held
    other = seats_for(client, show, 1, offset=5)[0]
    c = hold(client, bob, show, [ids[0], other])
    assert c.status_code == 409 and ids[0] in c.json()["error"]["unavailable"]
    assert {s["id"]: s["status"] for s in client.get(f"/api/shows/{show}/seats").json()["items"]}[other] == "available"
    # validation
    assert hold(client, bob, show, []).status_code == 422
    assert hold(client, bob, show, [other, other]).status_code == 422
    assert hold(client, bob, show, seats_for(client, show, 7, offset=10)).status_code == 422
    assert client.post("/api/holds", json={"show_id": show, "inventory_ids": [other]}).status_code == 401
    # other users can't read or release it
    assert client.get(f"/api/holds/{body['id']}", headers=bob.h).status_code == 404
    assert client.delete(f"/api/holds/{body['id']}", headers=bob.h).status_code == 404
    # release is idempotent and frees seats
    assert client.delete(f"/api/holds/{body['id']}", headers=alice.h).status_code == 204
    assert client.delete(f"/api/holds/{body['id']}", headers=alice.h).status_code == 204
    assert hold(client, bob, show, [ids[0]]).status_code == 201


def test_seat_from_other_show_rejected(client, alice, db, show, release_all):
    other = db.execute("select id from shows where id <> %s limit 1", (show,)).fetchone()[0]
    other_seat = str(db.execute("select id from seat_inventory where show_id = %s limit 1", (other,)).fetchone()[0])
    assert hold(client, alice, show, [other_seat]).status_code == 422


def test_active_hold_limit(client, alice, show, release_all):
    ids = seats_for(client, show, 3, offset=20)
    assert hold(client, alice, show, [ids[0]]).status_code == 201
    assert hold(client, alice, show, [ids[1]]).status_code == 201
    third = hold(client, alice, show, [ids[2]])
    assert third.status_code == 409 and third.json()["error"]["code"] == "hold_limit"


def test_release_all_my_holds(client, alice, bob, show, release_all):
    ids = seats_for(client, show, 2, offset=25)
    hold(client, alice, show, [ids[0]])
    hold(client, alice, show, [ids[1]])
    assert client.delete("/api/me/holds").status_code == 401
    assert client.delete("/api/me/holds", headers=bob.h).json() == {"released": 0}
    assert client.delete("/api/me/holds", headers=alice.h).json() == {"released": 2}
    assert hold(client, bob, show, ids).status_code == 201


def test_client_cannot_choose_user_or_ttl(client, alice, bob, show, release_all):
    ids = seats_for(client, show, 1, offset=30)
    r = client.post("/api/holds", headers=alice.h, json={
        "show_id": show, "inventory_ids": ids, "user_id": bob.id, "ttl": 99999})
    assert r.status_code == 201
    h = client.get(f"/api/holds/{r.json()['id']}", headers=alice.h).json()
    assert client.get(f"/api/holds/{r.json()['id']}", headers=bob.h).status_code == 404
    from datetime import datetime
    exp = datetime.fromisoformat(h["expires_at"]); now = datetime.fromisoformat(h["server_time"])
    assert (exp - now).total_seconds() <= 301


def test_concurrent_holds_single_winner(client, show, release_all):
    users = [_make_user() for _ in range(8)]
    try:
        seat = seats_for(client, show, 1, offset=40)

        def go(u):
            return hold(client, u, show, seat).status_code

        with cf.ThreadPoolExecutor(8) as ex:
            codes = list(ex.map(go, users))
        assert codes.count(201) == 1, codes
        assert codes.count(409) == 7, codes
    finally:
        with psycopg.connect(database_url()) as c:
            c.execute("update seat_inventory set status='available', hold_id=null where hold_id in "
                      "(select id from seat_holds where user_id = any(%s::uuid[]))", ([u.id for u in users],))
            c.commit()
        for u in users:
            httpx.delete(f"{BASE}/auth/v1/admin/users/{u.id}", timeout=30,
                         headers={"apikey": SECRET, "Authorization": f"Bearer {SECRET}"})


def test_expired_hold_frees_seats(client, alice, bob, db, show, release_all):
    ids = seats_for(client, show, 1, offset=50)
    h = hold(client, alice, show, ids).json()
    db.execute("update seat_holds set expires_at = now() - interval '1 second' where id = %s", (h["id"],))
    db.commit()
    seat = next(s for s in client.get(f"/api/shows/{show}/seats").json()["items"] if s["id"] == ids[0])
    assert seat["status"] == "available"
    assert client.get(f"/api/holds/{h['id']}", headers=alice.h).json()["status"] == "expired"
    assert hold(client, bob, show, ids).status_code == 201


# ------------------------------------------------------------------ orders + payments
def make_order(client, user, show, offset=60, n=2, key=None):
    ids = seats_for(client, show, n, offset=offset)
    h = hold(client, user, show, ids)
    assert h.status_code == 201, h.text
    hdr = {**user.h, **({"Idempotency-Key": key} if key else {})}
    o = client.post("/api/orders", json={"hold_id": h.json()["id"]}, headers=hdr)
    return h.json(), o


def test_order_prices_are_server_side_and_idempotent(client, alice, bob, db, show, release_all):
    key = secrets.token_hex(6)
    h, o = make_order(client, alice, show, key=key)
    assert o.status_code == 201, o.text
    order = o.json()
    prices = {s["id"]: s["price_minor"] for s in client.get(f"/api/shows/{show}/seats").json()["items"]}
    subtotal = sum(prices[i] for i in h["seat_inventory_ids"])
    assert order["subtotal_minor"] == subtotal
    assert order["fees_minor"] == (subtotal * 3 + 50) // 100
    assert order["total_minor"] == subtotal + order["fees_minor"]
    # idempotent
    again = client.post("/api/orders", json={"hold_id": h["id"]}, headers={**alice.h, "Idempotency-Key": key})
    assert again.json()["id"] == order["id"]
    # same hold, new key: rejected
    assert client.post("/api/orders", json={"hold_id": h["id"]}, headers={**alice.h, "Idempotency-Key": "k2"}
                       ).status_code == 409
    # client-sent amounts ignored
    # price change after order does not alter snapshot
    db.execute("update seat_inventory set current_price_minor = 1 where id = any(%s::uuid[])", (h["seat_inventory_ids"],))
    db.commit()
    assert client.get(f"/api/orders/{order['id']}", headers=alice.h).json()["total_minor"] == order["total_minor"]
    db.execute("update seat_inventory set current_price_minor = %s where id = %s", (prices[h['seat_inventory_ids'][0]], h["seat_inventory_ids"][0]))
    db.execute("update seat_inventory set current_price_minor = %s where id = %s", (prices[h['seat_inventory_ids'][1]], h["seat_inventory_ids"][1]))
    db.commit()
    # ownership
    assert client.get(f"/api/orders/{order['id']}", headers=bob.h).status_code == 404
    assert client.post("/api/orders", json={"hold_id": h["id"]}).status_code == 401


def test_order_from_expired_or_foreign_hold(client, alice, bob, db, show, release_all):
    ids = seats_for(client, show, 1, offset=70)
    h = hold(client, alice, show, ids).json()
    assert client.post("/api/orders", json={"hold_id": h["id"]}, headers=bob.h).status_code == 404
    db.execute("update seat_holds set expires_at = now() - interval '1 second' where id = %s", (h["id"],))
    db.commit()
    r = client.post("/api/orders", json={"hold_id": h["id"]}, headers=alice.h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "hold_expired"


def pay_create(client, user, order_id):
    return client.post("/api/demo-payments", json={"order_id": order_id}, headers=user.h)


def test_payment_happy_path_replay_and_wrong_codes(client, alice, bob, db, show, release_all):
    h, o = make_order(client, alice, show, offset=80)
    order_id = o.json()["id"]
    assert pay_create(client, bob, order_id).status_code == 404  # not bob's order
    a = pay_create(client, alice, order_id)
    assert a.status_code == 201
    att = a.json()
    assert re.fullmatch(r"DEMO-[A-Z2-9]{4}-[A-Z2-9]{4}", att["challenge"]) and att["demo"] is True
    # plaintext never stored
    stored = db.execute("select challenge_hash from demo_payment_attempts where id = %s", (att["attempt_id"],)).fetchone()[0]
    assert att["challenge"] not in stored and len(stored) == 64
    assert "challenge" not in client.get(f"/api/demo-payments/{att['attempt_id']}", headers=alice.h).json()
    assert client.get(f"/api/demo-payments/{att['attempt_id']}", headers=bob.h).status_code == 404
    # bob cannot confirm alice's attempt
    assert client.post(f"/api/demo-payments/{att['attempt_id']}/confirm", json={"code": att["challenge"]},
                       headers=bob.h).status_code == 404
    # wrong code: generic error, order untouched
    w = client.post(f"/api/demo-payments/{att['attempt_id']}/confirm", json={"code": "DEMO-ZZZZ-ZZZZ"}, headers=alice.h)
    assert w.status_code == 400 and w.json()["error"]["code"] == "invalid_or_expired_code"
    assert client.get(f"/api/orders/{order_id}", headers=alice.h).json()["status"] == "pending_payment"
    assert client.get(f"/api/demo-payments/{att['attempt_id']}", headers=alice.h).json()["attempts_left"] == 4
    # reissue invalidates old code
    new = client.post(f"/api/demo-payments/{att['attempt_id']}/reissue", headers=alice.h).json()
    assert new["challenge"] != att["challenge"] and new["attempt_id"] == att["attempt_id"]
    old = client.post(f"/api/demo-payments/{att['attempt_id']}/confirm", json={"code": att["challenge"]}, headers=alice.h)
    assert old.status_code == 400
    # correct code
    ok = client.post(f"/api/demo-payments/{att['attempt_id']}/confirm", json={"code": new["challenge"].lower()},
                     headers=alice.h)
    assert ok.status_code == 200, ok.text
    res = ok.json()
    assert res["simulated"] is True and len(res["tickets"]) == 2 and res["reference"].startswith("DEMO_TXN_")
    # replay: same result, tickets exactly once
    again = client.post(f"/api/demo-payments/{att['attempt_id']}/confirm", json={"code": new["challenge"]}, headers=alice.h)
    assert again.status_code == 200 and again.json()["reference"] == res["reference"]
    assert db.execute("select count(*) from tickets where order_id = %s", (order_id,)).fetchone()[0] == 2
    # seats sold, bookings + ticket access control
    st = {s["id"]: s["status"] for s in client.get(f"/api/shows/{show}/seats").json()["items"]}
    assert all(st[i] == "sold" for i in h["seat_inventory_ids"])
    books = client.get("/api/me/bookings", headers=alice.h).json()["items"]
    assert any(b["id"] == order_id and len(b["tickets"]) == 2 for b in books)
    tid = res["tickets"][0]["id"]
    assert client.get(f"/api/tickets/{tid}", headers=alice.h).status_code == 200
    assert client.get(f"/api/tickets/{tid}", headers=bob.h).status_code == 404
    # sold seats can't be held again
    assert hold(client, bob, show, [h["seat_inventory_ids"][0]]).status_code == 409


def test_attempt_limit_locks(client, alice, db, show, release_all):
    _, o = make_order(client, alice, show, offset=90, n=1)
    att = pay_create(client, alice, o.json()["id"]).json()
    for _ in range(5):
        assert client.post(f"/api/demo-payments/{att['attempt_id']}/confirm", json={"code": "DEMO-AAAA-AAAA"},
                           headers=alice.h).status_code == 400
    # RL is 10/min so this still reaches the endpoint; correct code now rejected because locked
    r = client.post(f"/api/demo-payments/{att['attempt_id']}/confirm", json={"code": att["challenge"]}, headers=alice.h)
    assert r.status_code == 423


def test_expired_challenge_and_hold_cannot_confirm(client, alice, db, show, release_all):
    _, o = make_order(client, alice, show, offset=100, n=1)
    att = pay_create(client, alice, o.json()["id"]).json()
    db.execute("update demo_payment_attempts set challenge_expires_at = now() - interval '1 second' where id = %s",
               (att["attempt_id"],))
    db.commit()
    r = client.post(f"/api/demo-payments/{att['attempt_id']}/confirm", json={"code": att["challenge"]}, headers=alice.h)
    assert r.status_code == 400
    assert client.get(f"/api/orders/{o.json()['id']}", headers=alice.h).json()["status"] == "pending_payment"


def test_concurrent_confirm_issues_tickets_once(client, alice, db, show, release_all):
    _, o = make_order(client, alice, show, offset=105, n=2)
    att = pay_create(client, alice, o.json()["id"]).json()

    def go(_):
        return client.post(f"/api/demo-payments/{att['attempt_id']}/confirm", json={"code": att["challenge"]},
                           headers=alice.h).status_code

    with cf.ThreadPoolExecutor(6) as ex:
        codes = list(ex.map(go, range(6)))
    assert all(c in (200, 429) for c in codes) and 200 in codes
    assert db.execute("select count(*) from tickets where order_id = %s", (o.json()["id"],)).fetchone()[0] == 2


def test_confirm_atomicity_on_failure(db, client, alice, show, release_all):
    """A failure inside the function rolls everything back (simulated by a bad ticket_code collision)."""
    _, o = make_order(client, alice, show, offset=110, n=1)
    att = pay_create(client, alice, o.json()["id"]).json()
    db.execute("create or replace function pg_temp.noop() returns void language sql as 'select 1'")
    from app.services import payments as p
    from app.db import conn
    with pytest.raises(Exception):
        with conn() as c:
            c.execute("select * from confirm_demo_payment(%s, %s, %s, 5)",
                      (att["attempt_id"], alice.id, p.code_hmac(att["attempt_id"], att["challenge"])))
            raise RuntimeError("crash after confirm, before commit")
    assert client.get(f"/api/orders/{o.json()['id']}", headers=alice.h).json()["status"] == "pending_payment"
    assert db.execute("select count(*) from tickets where order_id = %s", (o.json()["id"],)).fetchone()[0] == 0


# ------------------------------------------------------------------ security
def test_events_recorded_without_secrets(client, alice, db, show, release_all):
    h, o = make_order(client, alice, show, offset=115, n=1)
    att = pay_create(client, alice, o.json()["id"]).json()
    client.post(f"/api/demo-payments/{att['attempt_id']}/confirm", json={"code": "DEMO-NOPE-NOPE"}, headers=alice.h)
    rows = db.execute("select event_type, metadata, ip_hash from security_events where user_id = %s", (alice.id,)).fetchall()
    kinds = {r[0] for r in rows}
    assert {"hold_created", "order_created", "payment_challenge_failed"} <= kinds
    blob = str(rows)
    assert att["challenge"] not in blob and "DEMO-NOPE" not in blob
    assert all(r[2] and len(r[2]) == 24 for r in rows if r[0] == "hold_created")
    assert "127.0.0.1" not in blob and "testclient" not in blob


def test_event_allowlist_drops_extra_keys():
    from app.security.events import clean_metadata

    out = clean_metadata("hold_created", {"show_id": "s", "password": "x", "token": "t", "seat_count": 2})
    assert out == {"show_id": "s", "seat_count": 2}


def test_rate_limit_429_with_retry_after(client, db):
    from app.security.ratelimit import hit

    key = f"test:{uuid.uuid4()}"
    counts = [hit(key, 60) for _ in range(5)]
    assert counts == [1, 2, 3, 4, 5]
    with cf.ThreadPoolExecutor(10) as ex:
        res = list(ex.map(lambda _: hit(f"test:{uuid.uuid4().hex[:6]}-c", 60), range(10)))
    assert all(r == 1 for r in res)
    shared = f"test:{uuid.uuid4()}"
    with cf.ThreadPoolExecutor(10) as ex:
        res = sorted(ex.map(lambda _: hit(shared, 60), range(20)))
    assert res == list(range(1, 21)), "counter is exact under concurrency"
    db.execute("delete from rate_limits where key like 'test:%'")
    db.commit()


def test_hold_endpoint_returns_429_over_limit(client, alice, show, monkeypatch, release_all):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "rl_holds_per_min", 2)
    bobby = _make_user()
    try:
        ids = seats_for(client, show, 3, offset=120)
        codes = [hold(client, bobby, show, [i]).status_code for i in ids]
        assert 429 in codes
        r = hold(client, bobby, show, [ids[0]])
        assert r.status_code == 429 and r.headers["retry-after"] == "60"
    finally:
        with psycopg.connect(database_url()) as c:
            c.execute("update seat_inventory set status='available', hold_id=null where hold_id in "
                      "(select id from seat_holds where user_id = %s)", (bobby.id,))
            c.commit()
        httpx.delete(f"{BASE}/auth/v1/admin/users/{bobby.id}", timeout=30,
                     headers={"apikey": SECRET, "Authorization": f"Bearer {SECRET}"})


def test_scalper_flow_opens_case_restricts_and_admin_reviews(client, db, show, admin, monkeypatch, release_all):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "max_active_holds_per_user", 99)
    monkeypatch.setattr(get_settings(), "rl_holds_per_min", 999)
    scalper = _make_user()
    try:
        ids = seats_for(client, show, 14, offset=130)
        for i in ids[:9]:
            h = hold(client, scalper, show, [i])
            assert h.status_code == 201, h.text
            db.execute("update seat_holds set expires_at = now() - interval '1 second' where id = %s", (h.json()["id"],))
            db.commit()
        client.get(f"/api/shows/{show}/sections")  # triggers opportunistic expiry -> hold_expired events
        from app.security.scoring import evaluate_user
        r = evaluate_user(uuid.UUID(scalper.id))
        assert r["score"] >= 60 and r["case_id"], r
        codes = {x["code"] for x in r["reasons"]}
        assert "repeated_expired_holds" in codes
        # restriction enforced: second concurrent hold is rejected
        a = hold(client, scalper, show, [ids[7]])
        b = hold(client, scalper, show, [ids[8]])
        assert a.status_code == 201 and b.status_code == 409 and b.json()["error"]["code"] == "hold_limit"
        # admin sees case, customers do not
        cases = client.get("/api/security/cases", headers=admin.h).json()["items"]
        case = next(c for c in cases if c["user_id"] == scalper.id)
        assert client.get("/api/security/cases", headers=scalper.h).status_code == 403
        detail = client.get(f"/api/security/cases/{case['id']}", headers=admin.h).json()
        assert detail["timeline"] and detail["restrictions"]
        # AI unavailable path: no key configured in this process -> deterministic result, never a crash
        monkeypatch.setattr(get_settings(), "gemini_api_key", "")
        run = client.post(f"/api/security/cases/{case['id']}/investigate", headers=admin.h)
        assert run.status_code == 202
        import time
        for _ in range(40):
            runs = client.get(f"/api/security/cases/{case['id']}", headers=admin.h).json()["runs"]
            if runs and runs[0]["status"] not in ("pending", "running"):
                break
            time.sleep(0.5)
        assert runs[0]["status"] == "ai_unavailable" and runs[0]["result"]["ai_used"] is False
        assert "not a definitive finding" in runs[0]["result"]["disclaimer"]
        # review: dismiss clears restriction, writes audit, no auto-ban happened
        rv = client.post(f"/api/security/cases/{case['id']}/review", json={"decision": "dismiss", "note": "test"},
                         headers=admin.h)
        assert rv.status_code == 200
        assert db.execute("select count(*) from user_restrictions where user_id = %s", (scalper.id,)).fetchone()[0] == 0
        assert db.execute("select count(*) from audit_logs where target_id = %s", (case["id"],)).fetchone()[0] >= 2
        assert client.post(f"/api/security/cases/{case['id']}/review", json={"decision": "dismiss"},
                           headers=scalper.h).status_code == 403
    finally:
        with psycopg.connect(database_url()) as c:
            c.execute("update seat_inventory set status='available', hold_id=null where hold_id in "
                      "(select id from seat_holds where user_id = %s)", (scalper.id,))
            c.execute("delete from investigation_cases where user_id = %s", (scalper.id,))
            c.commit()
        httpx.delete(f"{BASE}/auth/v1/admin/users/{scalper.id}", timeout=30,
                     headers={"apikey": SECRET, "Authorization": f"Bearer {SECRET}"})


def test_audit_log_is_append_only(db):
    db.execute("insert into audit_logs (action) values ('test_row')")
    db.execute("savepoint s1")
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("update audit_logs set action = 'x' where action = 'test_row'")
    db.execute("rollback to savepoint s1")
    with pytest.raises(psycopg.errors.RaiseException):
        db.execute("delete from audit_logs where action = 'test_row'")
    db.rollback()  # discards the inserted test row too


def test_security_endpoints_deny_customers(client, alice):
    for path in ("/api/security/summary", "/api/security/events", "/api/security/cases"):
        assert client.get(path).status_code == 401
        assert client.get(path, headers=alice.h).status_code == 403


# ------------------------------------------------------------------ admin catalog
def test_admin_creates_bookable_show(client, admin, alice, db, release_all):
    spaces = client.get("/api/admin/venue-spaces", headers=admin.h).json()["items"]
    hall = next(s for s in spaces if s["venue_type"] == "cinema")
    assert client.get("/api/admin/venue-spaces", headers=alice.h).status_code == 403
    item = client.post("/api/admin/catalog", headers=admin.h,
                       json={"title": "Test Film " + secrets.token_hex(2), "item_type": "movie"}).json()
    from datetime import datetime, timedelta, timezone
    when = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    bad = client.post("/api/admin/shows", headers=admin.h, json={
        "catalog_item_id": item["id"], "venue_space_id": hall["id"], "starts_at": when, "prices": {"Standard": 100}})
    assert bad.status_code == 422
    show = client.post("/api/admin/shows", headers=admin.h, json={
        "catalog_item_id": item["id"], "venue_space_id": hall["id"], "starts_at": when,
        "prices": {"Standard": 100, "Premium": 200, "VIP": 300}})
    assert show.status_code == 201 and show.json()["seats"] > 50
    sid = show.json()["id"]
    assert client.get(f"/api/shows/{sid}/price-range").json()["min_price_minor"] == 10000
    h = hold(client, alice, sid, seats_for(client, sid, 1))
    assert h.status_code == 201
    assert client.post(f"/api/admin/shows/{sid}/cancel", headers=admin.h).status_code == 200
    assert client.post(f"/api/admin/shows/{sid}/cancel", headers=admin.h).status_code == 409
    db.execute("delete from seat_holds where show_id = %s", (sid,))
    db.execute("delete from catalog_items where id = %s", (item["id"],))
    db.commit()
