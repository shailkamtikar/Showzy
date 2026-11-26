"""Create local demo/test accounts (confirmed, no email needed) and store their credentials in .env.

Usage: python scripts/create_demo_users.py
Creates demo-admin / demo-customer / demo-customer2 @example.com. Passwords are generated and written to
the gitignored .env as DEMO_*_PASSWORD; they are never printed. The admin role is set via SQL (never via API).
"""
import re
import secrets
import sys
from pathlib import Path

import httpx
import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.migrate import ROOT, database_url  # noqa: E402

USERS = [("ADMIN", "demo-admin@example.com", "admin"),
         ("CUSTOMER", "demo-customer@example.com", "customer"),
         ("CUSTOMER2", "demo-customer2@example.com", "customer")]


def env_map() -> dict[str, str]:
    out = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def main() -> None:
    env = env_map()
    base, key = env["SUPABASE_URL"].rstrip("/"), env["SUPABASE_SECRET_KEY"]
    added = []
    for tag, email, role in USERS:
        pw_key = f"DEMO_{tag}_PASSWORD"
        pw = env.get(pw_key) or secrets.token_urlsafe(12) + "aA1"
        r = httpx.post(f"{base}/auth/v1/admin/users", timeout=30,
                       headers={"apikey": key, "Authorization": f"Bearer {key}"},
                       json={"email": email, "password": pw, "email_confirm": True})
        if r.status_code in (200, 201):
            uid = r.json()["id"]
            print(f"created {email}")
        elif r.status_code == 422 and "already" in r.text.lower():
            print(f"exists  {email}")
            uid = None
        else:
            sys.exit(f"failed {email}: {r.status_code} {r.text[:200]}")
        if pw_key not in env:
            added.append(f"DEMO_{tag}_EMAIL={email}\n{pw_key}={pw}\n")
        with psycopg.connect(database_url(), connect_timeout=20) as c:
            c.execute("insert into profiles (id, display_name) select id, split_part(email,'@',1) "
                      "from auth.users where email = %s on conflict (id) do nothing", (email,))
            c.execute("update profiles set role = %s where id = (select id from auth.users where email = %s)",
                      (role, email))
            c.commit()
    if added:
        txt = (ROOT / ".env").read_text(encoding="utf-8")
        if not txt.endswith("\n"):
            txt += "\n"
        txt += "\n# ---------- Local demo accounts (gitignored) ----------\n" + "".join(added)
        (ROOT / ".env").write_text(txt, encoding="utf-8", newline="\n")
        print("credentials written to .env")


if __name__ == "__main__":
    main()
