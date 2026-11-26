from dataclasses import dataclass
from uuid import UUID

import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWKClientConnectionError

from .config import get_settings
from .errors import AppError

_jwk_client: PyJWKClient | None = None


def _client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = PyJWKClient(get_settings().jwks_url, cache_keys=True, lifespan=3600, timeout=10)
    return _jwk_client


def reset_jwk_client() -> None:
    """Test hook."""
    global _jwk_client
    _jwk_client = None


@dataclass
class CurrentUser:
    id: UUID
    email: str | None
    role: str


def verify_token(token: str) -> dict:
    """Verify a Supabase access token (ES256/RS256 via JWKS). Raises AppError(401/503)."""
    s = get_settings()
    try:
        key = _client().get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            issuer=s.supabase_jwt_issuer,
            options={"require": ["exp", "sub"]},
            leeway=30,  # tolerate small clock skew between Supabase and this server (iat/nbf/exp)
        )
    except PyJWKClientConnectionError:
        raise AppError(503, "auth_unavailable", "Authentication service unavailable") from None
    except jwt.PyJWTError:
        raise AppError(401, "invalid_token", "Invalid or expired token") from None
