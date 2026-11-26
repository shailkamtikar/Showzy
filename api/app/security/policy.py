"""Deterministic policy: score bands -> permitted automatic actions.

  < 30   none
  30-59  log only
  60-79  auto-restrict to 1 active hold for 1 hour
  >= 80  same restriction + case queued as in_review (humans decide anything permanent)
There is no automatic ban; permanent actions only come from an admin review.
"""
from uuid import UUID


def band(score: int) -> str:
    if score >= 80:
        return "restrict_and_review"
    if score >= 60:
        return "restrict"
    if score >= 30:
        return "log_only"
    return "none"


def apply_policy(c, user_id: UUID, score: int) -> str:
    action = band(score)
    if action in ("restrict", "restrict_and_review"):
        has = c.execute(
            "select 1 from user_restrictions where user_id = %s and (expires_at is null or expires_at > now())",
            (user_id,),
        ).fetchone()
        if not has:
            c.execute(
                "insert into user_restrictions (user_id, max_active_holds, reason, expires_at) "
                "values (%s, 1, %s, now() + interval '1 hour')",
                (user_id, f"auto: risk score {score}"),
            )
    return action
