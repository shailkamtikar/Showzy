from uuid import UUID

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .auth import CurrentUser, verify_token
from .db import fetch_one
from .errors import AppError

_bearer = HTTPBearer(auto_error=False)


def _load_user(creds: HTTPAuthorizationCredentials) -> CurrentUser:
    claims = verify_token(creds.credentials)
    try:
        uid = UUID(claims["sub"])
    except (ValueError, KeyError):
        raise AppError(401, "invalid_token", "Invalid or expired token") from None
    row = fetch_one("select role from profiles where id = %s", (uid,))
    # A verified token with no profile yet (trigger lag) is treated as a plain customer.
    return CurrentUser(id=uid, email=claims.get("email"), role=row["role"] if row else "customer")


def current_user(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> CurrentUser:
    if creds is None:
        raise AppError(401, "not_authenticated", "Authentication required")
    user = _load_user(creds)
    request.state.user_id = user.id
    return user


def optional_user(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> CurrentUser | None:
    if creds is None:
        return None
    try:
        user = _load_user(creds)
    except AppError:
        return None
    request.state.user_id = user.id
    return user


def require_admin(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    if user.role != "admin":
        raise AppError(403, "forbidden", "Administrator access required")
    return user
