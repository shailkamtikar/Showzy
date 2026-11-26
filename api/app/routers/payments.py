from uuid import UUID

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ..auth import CurrentUser
from ..config import get_settings
from ..deps import current_user
from ..security.ratelimit import rate_limit
from ..services import payments

router = APIRouter(prefix="/api/demo-payments", tags=["demo-payments"])

_confirm_rl = rate_limit("confirm", lambda: get_settings().rl_confirm_per_min, 60, by="user", fail_closed=True)


class CreateIn(BaseModel):
    order_id: UUID


class ConfirmIn(BaseModel):
    code: str = Field(min_length=4, max_length=32)


@router.post("", status_code=201)
def create_attempt(body: CreateIn, user: CurrentUser = Depends(current_user)):
    """DEMO ONLY. Creates a simulated payment attempt; no real money is involved."""
    return payments.create_or_reissue(user.id, body.order_id)


@router.get("/{attempt_id}")
def get_attempt(attempt_id: UUID, user: CurrentUser = Depends(current_user)):
    return payments.get_attempt(user.id, attempt_id)


@router.post("/{attempt_id}/reissue")
def reissue(attempt_id: UUID, user: CurrentUser = Depends(current_user)):
    row = payments.get_attempt(user.id, attempt_id)  # 404 if not the caller's
    return payments.create_or_reissue(user.id, row["order_id"])


@router.post("/{attempt_id}/confirm", dependencies=[Depends(_confirm_rl)])
def confirm(attempt_id: UUID, body: ConfirmIn, request: Request, user: CurrentUser = Depends(current_user)):
    return payments.confirm(user.id, attempt_id, body.code, request)


@router.post("/{attempt_id}/cancel")
def cancel(attempt_id: UUID, user: CurrentUser = Depends(current_user)):
    return payments.cancel(user.id, attempt_id)
