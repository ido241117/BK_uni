from typing import Any
from uuid import UUID

import pytest

from bk_agent.graph import build_graph, run_turn
from bk_agent.provider import IntentDecision
from bk_agent.schemas import HistoryMessage, TurnRequest


class FakeModel:
    async def classify(self, message: str, history: list[HistoryMessage]) -> IntentDecision:
        if "thời tiết" in message.lower() or "profileid" in message.lower():
            return IntentDecision(intent="out_of_scope")
        if "chưa rõ" in message.lower():
            return IntentDecision(intent="clarification", clarification="Bạn muốn hỏi kỳ nào?")
        return IntentDecision(intent="recommendation")

    async def compose(self, message: str, recommendation: dict[str, Any]) -> str:
        return "encouraging"


class FakeGateway:
    def __init__(self) -> None:
        self.calls = 0
        self.result = {
            "status": "ready",
            "estimatedTerm": {"code": "T1", "name": "Học kỳ 1"},
            "summary": {"recommendedCredits": 3},
            "recommendedCourses": [
                {
                    "course": {"id": "synthetic-course-id", "code": "SYN101", "name": "Môn thử nghiệm"},
                    "credits": 3,
                    "reasons": [],
                }
            ],
        }

    async def recommend(self, delegated_context: str, correlation_id: str) -> dict[str, Any]:
        self.calls += 1
        return self.result


@pytest.mark.asyncio
async def test_recommendation_calls_only_the_allowlisted_gateway() -> None:
    gateway = FakeGateway()
    graph = build_graph(FakeModel(), gateway)  # type: ignore[arg-type]
    request = TurnRequest(
        conversationId=UUID("00000000-0000-0000-0000-000000000001"),
        message="Gợi ý học kỳ tiếp theo.",
    )

    result = await run_turn(
        graph,
        request,
        "synthetic-delegation",
        "00000000-0000-0000-0000-000000000002",
    )

    assert gateway.calls == 1
    assert result["status"] == "completed"
    assert result["recommendation"] == gateway.result
    assert "1 học phần, 3 tín chỉ" in result["answer"]
    assert "SYN101" not in result["answer"]


@pytest.mark.asyncio
async def test_out_of_scope_request_does_not_call_gateway() -> None:
    gateway = FakeGateway()
    graph = build_graph(FakeModel(), gateway)  # type: ignore[arg-type]
    request = TurnRequest(
        conversationId=UUID("00000000-0000-0000-0000-000000000001"),
        message="Dự báo thời tiết ngày mai.",
    )

    result = await run_turn(
        graph,
        request,
        "synthetic-delegation",
        "00000000-0000-0000-0000-000000000002",
    )

    assert gateway.calls == 0
    assert result["status"] == "out_of_scope"


@pytest.mark.asyncio
async def test_ambiguous_request_asks_clarification_without_calling_gateway() -> None:
    gateway = FakeGateway()
    graph = build_graph(FakeModel(), gateway)  # type: ignore[arg-type]
    request = TurnRequest(
        conversationId=UUID("00000000-0000-0000-0000-000000000001"),
        message="Mình chưa rõ nên học gì.",
    )

    result = await run_turn(
        graph,
        request,
        "synthetic-delegation",
        "00000000-0000-0000-0000-000000000002",
    )

    assert gateway.calls == 0
    assert result["status"] == "clarification"
    assert result["answer"] == "Bạn muốn hỏi kỳ nào?"


@pytest.mark.asyncio
async def test_missing_recommendation_configuration_becomes_clarification() -> None:
    class UnconfiguredGateway:
        async def recommend(self, delegated_context: str, correlation_id: str) -> dict[str, Any]:
            from bk_agent.gateway import GatewayError

            raise GatewayError("CURRICULUM_RECOMMENDATION_NOT_CONFIGURED")

    graph = build_graph(FakeModel(), UnconfiguredGateway())  # type: ignore[arg-type]
    request = TurnRequest(
        conversationId=UUID("00000000-0000-0000-0000-000000000001"),
        message="Gợi ý học kỳ tiếp theo.",
    )

    result = await run_turn(
        graph,
        request,
        "synthetic-delegation",
        "00000000-0000-0000-0000-000000000002",
    )

    assert result["status"] == "clarification"
    assert result["recommendation"] is None
