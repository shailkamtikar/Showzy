import asyncio
import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import get_settings
from .db import close_pool, fetch_one, init_pool
from .errors import AppError
from .routers import admin_catalog, booking, catalog, payments, security_admin
from .services.holds import expire_stale

settings = get_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("showzy")


async def _expiry_loop() -> None:
    """Optimisation only: correctness comes from query-time expiry + opportunistic cleanup."""
    while True:
        await asyncio.sleep(30)
        try:
            await asyncio.to_thread(expire_stale)
        except Exception:  # noqa: BLE001
            log.exception("expiry loop error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_pool()
    task = asyncio.create_task(_expiry_loop())
    yield
    task.cancel()
    close_pool()


app = FastAPI(title="Showzy API", version="1.0.0", lifespan=lifespan)

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    expose_headers=["X-Request-ID", "Retry-After", "Date"],
)


@app.middleware("http")
async def request_id_mw(request: Request, call_next):
    rid = uuid.uuid4().hex[:16]
    request.state.request_id = rid
    try:
        response = await call_next(request)
    except Exception:  # noqa: BLE001
        log.exception("unhandled error rid=%s", rid)
        response = JSONResponse(
            {"error": {"code": "internal_error", "message": "Something went wrong", "request_id": rid}},
            status_code=500,
        )
    response.headers["X-Request-ID"] = rid
    return response


def _err(request: Request, status: int, code: str, message: str, **extra) -> JSONResponse:
    headers = {}
    if "retry_after" in extra:
        headers["Retry-After"] = str(extra["retry_after"])
    body = {"error": {"code": code, "message": message, "request_id": getattr(request.state, "request_id", None),
                      **extra}}
    return JSONResponse(body, status_code=status, headers=headers)


@app.exception_handler(AppError)
async def app_error(request: Request, exc: AppError):
    return _err(request, exc.status, exc.code, exc.message, **exc.extra)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    fields = [{"loc": [str(p) for p in e["loc"][1:]], "msg": e["msg"]} for e in exc.errors()]
    return _err(request, 422, "validation_error", "Invalid request", fields=fields)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    code = {401: "not_authenticated", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}.get(
        exc.status_code, "http_error")
    return _err(request, exc.status_code, code, str(exc.detail))


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("unhandled error")
    return _err(request, 500, "internal_error", "Something went wrong")


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


@app.get("/health/db", tags=["health"])
def health_db():
    try:
        fetch_one("select 1 as ok")
    except Exception:  # noqa: BLE001
        log.exception("db health failed")
        raise AppError(503, "db_unavailable", "Database unavailable") from None
    return {"db": "ok"}


for r in (catalog.router, booking.router, payments.router, security_admin.router, admin_catalog.router):
    app.include_router(r)
