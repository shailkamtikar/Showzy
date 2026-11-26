from uuid import UUID

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel, Field

from ..auth import CurrentUser
from ..config import get_settings
from ..deps import current_user
from ..security.ratelimit import rate_limit
from ..services import holds, orders

router = APIRouter(prefix="/api", tags=["booking"])

_holds_rl = rate_limit("holds", lambda: get_settings().rl_holds_per_min, 60, by="user", fail_closed=True)


class HoldIn(BaseModel):
    show_id: UUID
    inventory_ids: list[UUID] = Field(min_length=1, max_length=50)


class OrderIn(BaseModel):
    hold_id: UUID


@router.get("/me")
def me(user: CurrentUser = Depends(current_user)):
    return {"id": user.id, "email": user.email, "role": user.role}


@router.post("/holds", status_code=201, dependencies=[Depends(_holds_rl)])
def create_hold(body: HoldIn, request: Request, user: CurrentUser = Depends(current_user)):
    # user id comes from the verified token; ttl and limits come from server settings only.
    return holds.create_hold(user.id, body.show_id, body.inventory_ids, request)


@router.get("/holds/{hold_id}")
def get_hold(hold_id: UUID, user: CurrentUser = Depends(current_user)):
    return holds.get_hold(user.id, hold_id)


@router.delete("/holds/{hold_id}", status_code=204)
def release_hold(hold_id: UUID, request: Request, user: CurrentUser = Depends(current_user)):
    holds.release_hold(user.id, hold_id, request)
    return Response(status_code=204)


@router.delete("/me/holds")
def release_my_holds(request: Request, user: CurrentUser = Depends(current_user)):
    return {"released": holds.release_all_holds(user.id, request)}


@router.post("/orders", status_code=201)
def create_order(
    body: OrderIn,
    request: Request,
    idempotency_key: str | None = Header(None, max_length=100),
    user: CurrentUser = Depends(current_user),
):
    return orders.create_order(user.id, body.hold_id, idempotency_key, request)


@router.get("/orders/{order_id}")
def get_order(order_id: UUID, user: CurrentUser = Depends(current_user)):
    return orders.get_order(user.id, order_id)


@router.get("/me/bookings")
def my_bookings(user: CurrentUser = Depends(current_user)):
    return {"items": orders.my_bookings(user.id)}


@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: UUID, user: CurrentUser = Depends(current_user)):
    return orders.get_ticket(user.id, ticket_id)
