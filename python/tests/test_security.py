from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi import HTTPException
from pydantic import SecretStr

from bk_agent.config import Settings
from bk_agent.security import verify_delegated_context

CORRELATION_ID = "00000000-0000-0000-0000-000000000002"


def signed_context(data_classification: str, correlation_id: str = CORRELATION_ID):
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    settings = Settings(
        _env_file=None,
        service_token=SecretStr("service-test-token"),
        delegation_public_key=public_key.decode(),
    )
    now = datetime.now(UTC)
    claims = {
        "iss": "bk-nest",
        "aud": "bk-recommendation-tool",
        "sub": "synthetic-user",
        "profile_id": "synthetic-profile",
        "scope": "recommendation:read",
        "correlation_id": correlation_id,
        "data_classification": data_classification,
        "iat": now,
        "exp": now + timedelta(seconds=60),
    }
    token = jwt.encode(claims, private_key, algorithm="EdDSA")
    return settings, token


def test_delegated_assertion_accepts_synthetic_context() -> None:
    settings, token = signed_context("synthetic")

    claims = verify_delegated_context(token, settings, CORRELATION_ID)

    assert claims["profile_id"] == "synthetic-profile"


def test_delegated_assertion_rejects_non_synthetic_data() -> None:
    settings, token = signed_context("student")

    with pytest.raises(HTTPException) as error:
        verify_delegated_context(token, settings, CORRELATION_ID)

    assert error.value.status_code == 403


def test_delegated_assertion_must_match_correlation_id() -> None:
    settings, token = signed_context("synthetic")

    with pytest.raises(HTTPException) as error:
        verify_delegated_context(token, settings, "00000000-0000-0000-0000-000000000003")

    assert error.value.status_code == 401
