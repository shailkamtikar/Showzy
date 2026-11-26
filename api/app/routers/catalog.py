from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request, Response

from ..config import get_settings
from ..deps import optional_user
from ..security.events import record_event
from ..security.ratelimit import rate_limit
from ..services import catalog as svc
from ..services.holds import expire_stale

router = APIRouter(prefix="/api", tags=["catalog"])

_catalog_rl = rate_limit("catalog", lambda: get_settings().rl_catalog_per_min, 60, by="ip")
_seatmap_rl = rate_limit("seatmap", lambda: get_settings().rl_seatmap_per_min, 60, by="ip")


@router.get("/config")
def public_config(response: Response):
    s = get_settings()
    response.headers["Cache-Control"] = "public, max-age=60"
    return {"max_seats_per_order": s.max_seats_per_order, "hold_duration_seconds": s.hold_duration_seconds,
            "fee_percent": s.fee_percent, "demo_payment_mode": s.demo_payment_mode, "currency": "INR"}


@router.get("/catalog", dependencies=[Depends(_catalog_rl)])
def list_catalog(
    response: Response,
    type: Literal["movie", "sports", "concert", "event"] | None = None,
    q: str | None = Query(None, max_length=80),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
):
    response.headers["Cache-Control"] = "public, max-age=15"
    return svc.list_catalog(type, q, limit, offset)


@router.get("/catalog/{item_id}", dependencies=[Depends(_catalog_rl)])
def catalog_item(item_id: UUID, response: Response):
    response.headers["Cache-Control"] = "public, max-age=15"
    return svc.get_item(item_id)


@router.get("/catalog/{item_id}/shows", dependencies=[Depends(_catalog_rl)])
def catalog_shows(item_id: UUID, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return {"items": svc.list_shows(item_id)}


@router.get("/shows/{show_id}", dependencies=[Depends(_catalog_rl)])
def show_detail(show_id: UUID, response: Response):
    response.headers["Cache-Control"] = "public, max-age=15"
    return svc.get_show(show_id)


@router.get("/shows/{show_id}/price-range", dependencies=[Depends(_catalog_rl)])
def show_price_range(show_id: UUID, response: Response):
    response.headers["Cache-Control"] = "no-store"
    return svc.price_range(show_id)


@router.get("/shows/{show_id}/sections", dependencies=[Depends(_seatmap_rl)])
def show_sections(show_id: UUID, request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    expire_stale(show_id, request)
    return {"items": svc.sections(show_id)}


@router.get("/shows/{show_id}/seats", dependencies=[Depends(_seatmap_rl)])
def show_seats(
    show_id: UUID,
    request: Request,
    response: Response,
    section_id: UUID | None = None,
    user=Depends(optional_user),
):
    response.headers["Cache-Control"] = "no-store"
    expire_stale(show_id, request)
    record_event("seatmap_requested", user.id if user else None, request, {"show_id": show_id}, evaluate=False)
    return {"items": svc.seats(show_id, section_id)}
