"""Local demo: act like a seat hoarder against YOUR OWN running API, so the security dashboard has a case.

Usage (API must be running on :8000):  python scripts/simulate_scalper.py
Creates/uses demo-scalper@example.com, holds seats and lets the holds expire repeatedly. Only run against
your own local stack. Credentials are stored in the gitignored .env as DEMO_SCALPER_*.
"""
import secrets
import sys
import time
from pathlib import Path

import httpx
import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.migrate import ROOT, database_url  # noqa: E402

API = "http://localhost:8000"


def env() -> dict[str, str]:
    out = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def ensure_user(e: dict[str, str]) -> tuple[str, str]:
    email = "demo-scalper@example.com"
    pw = e.get("DEMO_SCALPER_PASSWORD") or secrets.token_urlsafe(12) + "aA1"
    base, key = e["SUPABASE_URL"].rstrip("/"), e["SUPABASE_SECRET_KEY"]
    r = httpx.post(f"{base}/auth/v1/admin/users", timeout=30, headers={"apikey": key, "Authorization": f"Bearer {key}"},
                   json={"email": email, "password": pw, "email_confirm": True})
    if r.status_code in (200, 201) and "DEMO_SCALPER_PASSWORD" not in e:
        with open(ROOT / ".env", "a", encoding="utf-8", newline="\n") as f:
            f.write(f"DEMO_SCALPER_EMAIL={email}\nDEMO_SCALPER_PASSWORD={pw}\n")
    elif r.status_code not in (200, 201) and "already" not in r.text.lower():
        sys.exit(f"could not create user: {r.status_code}")
    with psycopg.connect(database_url()) as c:
        c.execute("insert into profiles (id, display_name) select id, 'scalper' from auth.users where email = %s "
                  "on conflict (id) do nothing", (email,))
        c.commit()
    return email, pw


def main() -> None:
    e = env()
    email, pw = ensure_user(e)
    tok = httpx.post(f"{e['SUPABASE_URL'].rstrip('/')}/auth/v1/token?grant_type=password",
                     headers={"apikey": e["VITE_SUPABASE_PUBLISHABLE_KEY"]}, json={"email": email, "password": pw},
                     timeout=30).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    shows = httpx.get(f"{API}/api/catalog?type=sports", timeout=30).json()["items"]
    show = httpx.get(f"{API}/api/catalog/{shows[0]['id']}/shows", timeout=30).json()["items"][0]["id"]
    seats = [s["id"] for s in httpx.get(f"{API}/api/shows/{show}/seats", timeout=60).json()["items"]
             if s["status"] == "available"][300:330]
    print(f"scalper account {email} hoarding seats on show {show[:8]}...")
    with psycopg.connect(database_url()) as db:
        httpx.delete(f"{API}/api/me/holds", headers=h, timeout=30)  # start clean
        for i, seat in enumerate(seats[:10]):
            # no release in between: each new hold request expires the previous (abandoned) one,
            # which is recorded as a hold_expired security event
            r = httpx.post(f"{API}/api/holds", headers=h, json={"show_id": show, "inventory_ids": [seat]}, timeout=30)
            print(f"  hold {i + 1}: HTTP {r.status_code}", r.json().get("error", {}).get("message", ""))
            if r.status_code == 201:
                # fast-forward: pretend the five minutes passed without payment
                db.execute("update seat_holds set expires_at = now() - interval '1 second' where id = %s",
                           (r.json()["id"],))
                db.commit()
            time.sleep(0.3)
    httpx.get(f"{API}/api/shows/{show}/sections", timeout=30)  # triggers expiry events
    print("done. Open /admin/security as demo-admin@example.com to see the case.")


if __name__ == "__main__":
    main()
