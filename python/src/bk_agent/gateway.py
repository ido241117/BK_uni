from typing import Any

import httpx


class GatewayError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class RecommendationGateway:
    def __init__(
        self,
        base_url: str,
        service_token: str,
        timeout_seconds: float = 5,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.service_token = service_token
        self.timeout_seconds = timeout_seconds

    async def recommend(self, delegated_context: str, correlation_id: str) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    f"{self.base_url}/api/v1/internal/v1/tools/recommendation",
                    json={},
                    headers={
                        "Authorization": f"Bearer {self.service_token}",
                        "X-Delegated-Context": delegated_context,
                        "X-Correlation-ID": correlation_id,
                    },
                )
        except httpx.TimeoutException as error:
            raise GatewayError("TOOL_TIMEOUT") from error
        except httpx.HTTPError as error:
            raise GatewayError("TOOL_UNAVAILABLE") from error

        if response.is_error:
            try:
                code = response.json().get("code", "TOOL_UNAVAILABLE")
            except (ValueError, AttributeError):
                code = "TOOL_UNAVAILABLE"
            raise GatewayError(str(code))
        try:
            payload = response.json()
            recommendation = payload["data"]
            if not isinstance(recommendation, dict) or recommendation.get("status") not in {
                "ready",
                "program_completed",
            }:
                raise ValueError
            return recommendation
        except (ValueError, KeyError, TypeError) as error:
            raise GatewayError("TOOL_RESPONSE_INVALID") from error
