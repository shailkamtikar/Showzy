from contextlib import contextmanager
from typing import Any, Iterator

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import get_settings

_pool: ConnectionPool | None = None


def init_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            get_settings().database_url,
            min_size=1,
            max_size=8,
            kwargs={"row_factory": dict_row, "prepare_threshold": None},
            open=False,
            timeout=20,
        )
        _pool.open(wait=False)
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def conn() -> Iterator[Connection]:
    """Transactional connection: commits on success, rolls back on any exception."""
    pool = init_pool()
    with pool.connection() as c:
        yield c


def fetch_all(sql: str, params: Any = None, c: Connection | None = None) -> list[dict]:
    if c is not None:
        return c.execute(sql, params).fetchall()
    with conn() as cx:
        return cx.execute(sql, params).fetchall()


def fetch_one(sql: str, params: Any = None, c: Connection | None = None) -> dict | None:
    if c is not None:
        return c.execute(sql, params).fetchone()
    with conn() as cx:
        return cx.execute(sql, params).fetchone()


def execute(sql: str, params: Any = None, c: Connection | None = None) -> None:
    if c is not None:
        c.execute(sql, params)
        return
    with conn() as cx:
        cx.execute(sql, params)
