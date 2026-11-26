import json
import threading
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from ..ai.graph import run_investigation
from ..auth import CurrentUser
from ..config import REQUIRED_GEMINI_MODEL, get_settings
from ..db import conn, fetch_all, fetch_one
from ..deps import require_admin
from ..errors import conflict, not_found
from ..security.ratelimit import rate_limit

router = APIRouter(prefix="/api", tags=["admin"])

_ai_rl = rate_limit("ai", lambda: get_settings().rl_ai_per_hour, 3600, by="user")


class ReviewIn(BaseModel):
    decision: Literal["dismiss", "restrict", "escalate"]
    note: str = Field("", max_length=500)


def audit(c, actor: UUID, action: str, target_type: str, target_id: str, details: dict | None = None) -> None:
    c.execute("insert into audit_logs (actor_id, action, target_type, target_id, details) "
              "values (%s,%s,%s,%s,%s::jsonb)", (actor, action, target_type, target_id, json.dumps(details or {})))


@router.get("/admin/ping")
def admin_ping(user: CurrentUser = Depends(require_admin)):
    return {"ok": True, "admin": str(user.id)}


@router.get("/security/summary")
def summary(user: CurrentUser = Depends(require_admin)):
    events = fetch_all(
        "select event_type, count(*)::int as n from security_events "
        "where created_at > now() - interval '24 hours' group by event_type order by n desc")
    return {
        "events_24h": events,
        "open_cases": fetch_one("select count(*)::int as n from investigation_cases where status <> 'closed'")["n"],
        "restricted_users": fetch_one(
            "select count(distinct user_id)::int as n from user_restrictions "
            "where expires_at is null or expires_at > now()")["n"],
        "ai": {"model": REQUIRED_GEMINI_MODEL, "configured": bool(get_settings().gemini_api_key)},
    }


@router.get("/security/events")
def events(
    type: str | None = Query(None, max_length=60),
    user_id: UUID | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    user: CurrentUser = Depends(require_admin),
):
    where, params = ["true"], []
    if type:
        where.append("event_type = %s"); params.append(type)
    if user_id:
        where.append("user_id = %s"); params.append(user_id)
    rows = fetch_all(
        f"select id, user_id, event_type, severity, ip_hash, metadata, created_at from security_events "
        f"where {' and '.join(where)} order by created_at desc limit %s offset %s", params + [limit, offset])
    return {"items": rows, "limit": limit, "offset": offset}


@router.get("/security/cases")
def cases(user: CurrentUser = Depends(require_admin)):
    return {"items": fetch_all(
        "select id, user_id, status, max_score, summary, reasons, created_at, updated_at "
        "from investigation_cases order by (status = 'closed'), updated_at desc limit 100")}


@router.get("/security/cases/{case_id}")
def case_detail(case_id: UUID, user: CurrentUser = Depends(require_admin)):
    case = fetch_one("select * from investigation_cases where id = %s", (case_id,))
    if not case:
        raise not_found("Case")
    timeline = fetch_all(
        "select event_type, severity, metadata, created_at from security_events where user_id = %s "
        "order by created_at desc limit 100", (case["user_id"],))
    runs = fetch_all("select id, status, model, started_at, finished_at, result, error from agent_runs "
                     "where case_id = %s order by started_at desc limit 5", (case_id,))
    restrictions = fetch_all(
        "select max_active_holds, reason, created_at, expires_at from user_restrictions where user_id = %s "
        "order by created_at desc limit 5", (case["user_id"],))
    return {"case": case, "timeline": timeline, "runs": runs, "restrictions": restrictions}


@router.post("/security/cases/{case_id}/investigate", status_code=202, dependencies=[Depends(_ai_rl)])
def investigate(case_id: UUID, user: CurrentUser = Depends(require_admin)):
    if not fetch_one("select 1 from investigation_cases where id = %s", (case_id,)):
        raise not_found("Case")
    with conn() as c:
        run = c.execute("insert into agent_runs (case_id, model, status) values (%s,%s,'pending') returning id",
                        (case_id, REQUIRED_GEMINI_MODEL)).fetchone()
        audit(c, user.id, "investigate", "case", str(case_id), {"run_id": str(run["id"])})
    threading.Thread(target=run_investigation, args=(run["id"], case_id), daemon=True).start()
    return {"run_id": run["id"], "status": "pending"}


@router.post("/security/cases/{case_id}/review")
def review(case_id: UUID, body: ReviewIn, user: CurrentUser = Depends(require_admin)):
    with conn() as c:
        case = c.execute("select * from investigation_cases where id = %s for update", (case_id,)).fetchone()
        if not case:
            raise not_found("Case")
        if case["status"] == "closed":
            raise conflict("Case is already closed.")
        if body.decision == "dismiss":
            c.execute("update investigation_cases set status='closed', updated_at=now() where id=%s", (case_id,))
            c.execute("delete from user_restrictions where user_id = %s", (case["user_id"],))
        elif body.decision == "restrict":
            c.execute("insert into user_restrictions (user_id, max_active_holds, reason, created_by, expires_at) "
                      "values (%s, 1, %s, %s, now() + interval '24 hours')",
                      (case["user_id"], "admin review" + (f": {body.note[:200]}" if body.note.strip() else ""), user.id))
            c.execute("update investigation_cases set status='in_review', updated_at=now() where id=%s", (case_id,))
        else:
            c.execute("update investigation_cases set status='in_review', updated_at=now() where id=%s", (case_id,))
        audit(c, user.id, f"review_{body.decision}", "case", str(case_id), {"note": body.note})
    return {"case_id": case_id, "decision": body.decision}
