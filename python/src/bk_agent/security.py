import hmac

import jwt
from fastapi import HTTPException, status

from bk_agent.config import Settings


def verify_service_token(authorization: str | None, settings: Settings) -> None:
    expected = settings.service_token
    scheme, _, supplied = (authorization or "").partition(" ")
    if expected is None or scheme.lower() != "bearer" or not hmac.compare_digest(
        supplied, expected.get_secret_value()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "SERVICE_AUTH_REQUIRED"},
        )


def verify_delegated_context(
    token: str | None,
    settings: Settings,
    correlation_id: str,
) -> dict[str, object]:
    if not token or not settings.delegation_public_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "DELEGATED_CONTEXT_REQUIRED"},
        )
    public_key = settings.delegation_public_key.replace("\\n", "\n")
    try:
        claims = jwt.decode(
            token,
            public_key,
            algorithms=["EdDSA"],
            issuer="bk-nest",
            audience="bk-recommendation-tool",
            options={
                "require": [
                    "exp",
                    "iat",
                    "sub",
                    "profile_id",
                    "scope",
                    "correlation_id",
                    "data_classification",
                ]
            },
        )
    except jwt.PyJWTError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "DELEGATED_CONTEXT_INVALID"},
        ) from error

    if claims.get("scope") != "recommendation:read":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "DELEGATED_SCOPE_INVALID"},
        )
    if claims.get("correlation_id") != correlation_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "DELEGATED_CONTEXT_INVALID"},
        )
    if claims.get("data_classification") != "synthetic":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "SYNTHETIC_DATA_ONLY"},
        )
    return claims
