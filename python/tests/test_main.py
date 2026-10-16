from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi.testclient import TestClient
from pydantic import SecretStr

from bk_agent.config import Settings
from bk_agent.gateway import GatewayError
from bk_agent.main import create_app
from bk_agent.provider import IntentDecision
from bk_agent.schemas import HistoryMessage

CORRELATION_ID = "00000000-0000-0000-0000-000000000002"


class FakeModel:
    async def classify(self, message: str, history: list[HistoryMessage]) -> IntentDecision:
        return IntentDecision(intent="recommendation")

    async def compose(self, message: str, recommendation: dict[str, Any]) -> str:
        return "concise"


class FakeGateway:
    async def recommend(self, delegated_context: str, correlation_id: str) -> dict[str, Any]:
        return {
            "status": "ready",
            "estimatedTerm": {"code": "T1", "name": "Học kỳ 1"},
            "summary": {"recommendedCredits": 0},
            "recommendedCourses": [],
        }


def create_test_client(data_classification: str, gateway: Any | None = None) -> TestClient:
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    settings = Settings(
        _env_file=None,
        service_token=SecretStr("service-test-token"),
        delegation_public_key=public_key.decode(),
    )
    now = datetime.now(UTC)
    delegated_context = jwt.encode(
        {
            "iss": "bk-nest",
            "aud": "bk-recommendation-tool",
            "sub": "synthetic-user",
            "profile_id": "synthetic-profile",
            "scope": "recommendation:read",
            "correlation_id": CORRELATION_ID,
            "data_classification": data_classification,
            "iat": now,
            "exp": now + timedelta(seconds=60),
        },
        private_key,
        algorithm="EdDSA",
    )
    client = TestClient(create_app(settings, FakeModel(), gateway or FakeGateway()))
    client.headers.update(
        {
            "Authorization": "Bearer service-test-token",
            "X-Delegated-Context": delegated_context,
            "X-Correlation-ID": CORRELATION_ID,
        }
    )
    return client


def test_health_endpoints_are_available_without_provider_credentials() -> None:
    with create_test_client("synthetic") as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/health/ready").status_code == 200


def test_readiness_is_unavailable_without_service_configuration() -> None:
    with TestClient(create_app(settings=Settings(_env_file=None))) as client:
        assert client.get("/health/live").status_code == 200
        assert client.get("/health/ready").status_code == 503


def test_internal_turn_rejects_non_synthetic_context() -> None:
    with create_test_client("student") as client:
        response = client.post(
            "/internal/v1/turns",
            json={
                "conversationId": "00000000-0000-0000-0000-000000000001",
                "message": "Gợi ý học kỳ.",
            },
        )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "SYNTHETIC_DATA_ONLY"


def test_internal_turn_rejects_payload_larger_than_contract_limit() -> None:
    with create_test_client("synthetic") as client:
        response = client.post(
            "/internal/v1/turns",
            json={
                "conversationId": "00000000-0000-0000-0000-000000000001",
                "message": "Gợi ý học kỳ.",
                "history": [
                    {"role": "user", "content": "x" * 3900},
                    {"role": "assistant", "content": "y" * 3900},
                    {"role": "user", "content": "z" * 3900},
                    {"role": "assistant", "content": "w" * 3900},
                    {"role": "user", "content": "v" * 3900},
                ],
            },
        )

    assert response.status_code == 422


def test_internal_turn_runs_graph_for_synthetic_context() -> None:
    with create_test_client("synthetic") as client:
        response = client.post(
            "/internal/v1/turns",
            json={
                "conversationId": "00000000-0000-0000-0000-000000000001",
                "message": "Gợi ý học kỳ.",
            },
        )

    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    assert response.json()["recommendation"]["status"] == "ready"


def test_internal_turn_maps_gateway_timeout_without_exposing_exception() -> None:
    class TimedOutGateway:
        async def recommend(self, delegated_context: str, correlation_id: str) -> dict[str, Any]:
            error = GatewayError("TOOL_TIMEOUT")
            error.args = ("internal detail",)
            raise error

    with create_test_client("synthetic", TimedOutGateway()) as client:
        response = client.post(
            "/internal/v1/turns",
            json={
                "conversationId": "00000000-0000-0000-0000-000000000001",
                "message": "Gợi ý học kỳ.",
            },
        )

    assert response.status_code == 504
    assert response.json()["detail"] == {"code": "AGENT_TIMEOUT"}


def test_internal_turn_maps_provider_error_without_exposing_exception() -> None:
    class BrokenModel(FakeModel):
        async def classify(self, message: str, history: list[HistoryMessage]) -> IntentDecision:
            raise RuntimeError("provider response contained private details")

    settings = Settings(
        _env_file=None,
        service_token=SecretStr("service-test-token"),
        delegation_public_key="unused-with-injected-graph",
    )
    private_key = Ed25519PrivateKey.generate()
    settings.delegation_public_key = private_key.public_key().public_bytes(
        Encoding.PEM,
        PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "iss": "bk-nest",
            "aud": "bk-recommendation-tool",
            "sub": "synthetic-user",
            "profile_id": "synthetic-profile",
            "scope": "recommendation:read",
            "correlation_id": CORRELATION_ID,
            "data_classification": "synthetic",
            "iat": now,
            "exp": now + timedelta(seconds=60),
        },
        private_key,
        algorithm="EdDSA",
    )
    with TestClient(create_app(settings, BrokenModel(), FakeGateway())) as client:
        response = client.post(
            "/internal/v1/turns",
            headers={
                "Authorization": "Bearer service-test-token",
                "X-Delegated-Context": token,
                "X-Correlation-ID": CORRELATION_ID,
            },
            json={
                "conversationId": "00000000-0000-0000-0000-000000000001",
                "message": "Gợi ý học kỳ.",
            },
        )

    assert response.status_code == 502
    assert response.json()["detail"] == {"code": "AGENT_UNAVAILABLE"}
    assert "private details" not in response.text
