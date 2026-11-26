"""Tiny SQL migration runner.  Usage: python scripts/migrate.py up | down [n] | status

Files live in supabase/migrations as NNNN_name.sql with a matching NNNN_name.down.sql.
Each migration runs in one transaction; a failure rolls back and stops.
"""
import re
import sys
from pathlib import Path

import psycopg

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"


def database_url() -> str:
    import os

    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip()
    sys.exit("DATABASE_URL not found")


def files() -> list[tuple[str, Path, Path]]:
    ups = sorted(p for p in MIGRATIONS.glob("*.sql") if not p.name.endswith(".down.sql"))
    out = []
    for up in ups:
        down = up.with_name(up.stem + ".down.sql")
        out.append((up.stem, up, down))
    return out


def ensure_table(c: psycopg.Connection) -> None:
    c.execute(
        "create table if not exists public.schema_migrations("
        "version text primary key, applied_at timestamptz not null default now())"
    )
    c.execute("alter table public.schema_migrations enable row level security")
    c.execute("revoke all on public.schema_migrations from anon, authenticated")
    c.commit()


def applied(c: psycopg.Connection) -> list[str]:
    return [r[0] for r in c.execute("select version from public.schema_migrations order by version")]


def up(c: psycopg.Connection) -> None:
    done = set(applied(c))
    pending = [f for f in files() if f[0] not in done]
    if not pending:
        print("nothing to apply")
        return
    for version, upfile, downfile in pending:
        if not downfile.exists():
            sys.exit(f"missing down file for {version}")
        try:
            with c.transaction():
                c.execute(upfile.read_text(encoding="utf-8"))
                c.execute("insert into public.schema_migrations(version) values (%s)", (version,))
        except Exception as e:  # noqa: BLE001
            sys.exit(f"FAILED {version}: {e}")
        print(f"applied {version}")


def down(c: psycopg.Connection, n: int) -> None:
    done = applied(c)
    by_version = {f[0]: f for f in files()}
    for version in reversed(done[-n:] if n else []):
        f = by_version.get(version)
        if not f or not f[2].exists():
            sys.exit(f"missing down file for {version}")
        try:
            with c.transaction():
                c.execute(f[2].read_text(encoding="utf-8"))
                c.execute("delete from public.schema_migrations where version=%s", (version,))
        except Exception as e:  # noqa: BLE001
            sys.exit(f"FAILED down {version}: {e}")
        print(f"reverted {version}")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    with psycopg.connect(database_url(), connect_timeout=20) as c:
        ensure_table(c)
        if cmd == "up":
            up(c)
        elif cmd == "down":
            n = int(sys.argv[2]) if len(sys.argv) > 2 else 1
            down(c, n)
        elif cmd == "status":
            done = set(applied(c))
            for v, _, _ in files():
                print(("[x] " if v in done else "[ ] ") + v)
        else:
            sys.exit("usage: migrate.py up | down [n] | status")


if __name__ == "__main__":
    main()
