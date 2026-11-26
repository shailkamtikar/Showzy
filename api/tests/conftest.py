"""Integration fixtures. They run against the real Supabase dev project using throwaway users
(test-*@example.com) that are deleted, with their seats released, at the end of the session."""
import secrets
import sys
from pathlib import Path

import httpx
import psycopg
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from scripts.migrate import ROOT, database_url  # noqa: E402


def _env() -> dict[str, str]:
    out = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


ENV = _env()
BASE = ENV["SUPABASE_URL"].rstrip("/")
SECRET = ENV["SUPABASE_SECRET_KEY"]
PUB = ENV["VITE_SUPABASE_PUBLISHABLE_KEY"]


class TUser:
    def __init__(self, uid: str, email: str, password: str):
        self.id, self.email, self.password = uid, email, password
        self.token = ""

    def login(self) -> None:
        r = httpx.post(f"{BASE}/auth/v1/token?grant_type=password", headers={"apikey": PUB},
                       json={"email": self.email, "password": self.password}, timeout=30)
        r.raise_for_status()
        self.token = r.json()["access_token"]

    @property
    def h(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"}


def _make_user(role: str = "customer") -> TUser:
    email = f"test-{secrets.token_hex(5)}@example.com"
    pw = secrets.token_urlsafe(12) + "aA1"
    r = httpx.post(f"{BASE}/auth/v1/admin/users", timeout=30,
                   headers={"apikey": SECRET, "Authorization": f"Bearer {SECRET}"},
                   json={"email": email, "password": pw, "email_confirm": True})
    r.raise_for_status()
    uid = r.json()["id"]
    with psycopg.connect(database_url()) as c:
        c.execute("insert into profiles (id, display_name) values (%s, %s) on conflict (id) do nothing",
                  (uid, email.split("@")[0]))
        if role == "admin":
            c.execute("update profiles set role = 'admin' where id = %s", (uid,))
        c.commit()
    u = TUser(uid, email, pw)
    u.login()
    return u


def _cleanup(uids: list[str]) -> None:
    with psycopg.connect(database_url()) as c:
        c.execute(
            "update seat_inventory set status = 'available', hold_id = null where hold_id in "
            "(select id from seat_holds where user_id = any(%s::uuid[]))", (uids,))
        c.execute("delete from investigation_cases where user_id = any(%s::uuid[])", (uids,))
        c.execute("delete from security_events where user_id = any(%s::uuid[])", (uids,))
        c.execute("delete from risk_assessments where user_id = any(%s::uuid[])", (uids,))
        c.commit()
    for uid in uids:
        httpx.delete(f"{BASE}/auth/v1/admin/users/{uid}", timeout=30,
                     headers={"apikey": SECRET, "Authorization": f"Bearer {SECRET}"})


@pytest.fixture(autouse=True)
def relaxed_rate_limits(monkeypatch):
    """Tests reuse the same users many times per minute. Rate-limit tests lower these again themselves."""
    s = get_settings()
    monkeypatch.setattr(s, "rl_confirm_per_min", 1000)
    monkeypatch.setattr(s, "rl_holds_per_min", 1000)


@pytest.fixture(scope="session")
def users():
    made = [_make_user(), _make_user(), _make_user("admin")]
    yield made
    _cleanup([u.id for u in made])


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def alice(users):
    return users[0]


@pytest.fixture(scope="session")
def bob(users):
    return users[1]


@pytest.fixture(scope="session")
def admin(users):
    return users[2]


@pytest.fixture()
def db():
    with psycopg.connect(database_url()) as c:
        yield c


@pytest.fixture()
def show(db):
    """The seeded show with the most seats (the stadium), so tests can use many distinct seats."""
    row = db.execute(
        "select s.id from shows s join seat_inventory si on si.show_id = s.id where s.status = 'scheduled' "
        "group by s.id order by count(*) desc, s.id limit 1").fetchone()
    return str(row[0])


def seats_for(client, show_id: str, n: int, offset: int = 0) -> list[str]:
    r = client.get(f"/api/shows/{show_id}/seats")
    assert r.status_code == 200
    avail = [s["id"] for s in r.json()["items"] if s["status"] == "available"]
    return avail[offset: offset + n]


@pytest.fixture()
def release_all(client, users):
    yield
    for u in users:
        with psycopg.connect(database_url()) as c:
            c.execute(
                "update seat_inventory set status = 'available', hold_id = null where hold_id in "
                "(select id from seat_holds where user_id = %s)", (u.id,))
            c.execute("delete from orders where user_id = %s", (u.id,))
            c.execute("delete from seat_holds where user_id = %s", (u.id,))
            c.commit()
