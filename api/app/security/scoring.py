"""Evaluate a user from stored events, persist the assessment, open/update a case, apply policy."""
import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from ..db import conn
from . import rules
from .policy import apply_policy

log = logging.getLogger("showzy.scoring")


def _load_events(c, user_id: UUID, minutes: int = 60) -> list[dict]:
    return c.execute(
        "select event_type, created_at, metadata, ip_hash from security_events "
        "where user_id = %s and created_at > now() - make_interval(mins => %s)",
        (user_id, minutes),
    ).fetchall()


def evaluate_user(user_id: UUID) -> dict:
    with conn() as c:
        events = _load_events(c, user_id)
        total, reasons = rules.evaluate(events, datetime.now(timezone.utc))
        reason_dicts = [r.as_dict() for r in reasons]
        if total > 0:
            c.execute(
                "insert into risk_assessments (user_id, score, reasons, detector_version) "
                "values (%s, %s, %s::jsonb, %s)",
                (user_id, total, json.dumps(reason_dicts), rules.DETECTOR_VERSION),
            )
        case_id = None
        if rules.case_worthy(reasons, total):
            summary = "; ".join(r.detail for r in reasons)
            row = c.execute(
                "select id from investigation_cases where user_id = %s and status <> 'closed'", (user_id,)
            ).fetchone()
            if row:
                case_id = row["id"]
                c.execute(
                    "update investigation_cases set max_score = greatest(max_score, %s), summary = %s, "
                    "reasons = %s::jsonb, updated_at = now() where id = %s",
                    (total, summary, json.dumps(reason_dicts), case_id),
                )
            else:
                case_id = c.execute(
                    "insert into investigation_cases (user_id, max_score, summary, reasons, status) "
                    "values (%s, %s, %s, %s::jsonb, %s) returning id",
                    (user_id, total, summary, json.dumps(reason_dicts), "in_review" if total >= 80 else "open"),
                ).fetchone()["id"]
            apply_policy(c, user_id, total)
        return {"score": total, "reasons": reason_dicts, "case_id": case_id}
