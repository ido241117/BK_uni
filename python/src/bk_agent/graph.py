from typing import Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from bk_agent.gateway import GatewayError, RecommendationGateway
from bk_agent.provider import IntentDecision, ModelAdapter
from bk_agent.schemas import TurnRequest


class AgentState(TypedDict):
    request: TurnRequest
    delegated_context: str
    correlation_id: str
    intent: str
    clarification: str
    recommendation: dict[str, Any] | None
    answer: str
    status: Literal["completed", "clarification", "out_of_scope"]
    tool_called: bool


def grounded_answer(
    recommendation: dict[str, Any],
    style: Literal["concise", "encouraging"],
) -> str:
    status = recommendation.get("status")
    if status == "program_completed":
        fact = "RecommendationService đánh dấu chương trình đã hoàn thành theo dữ liệu hiện có."
    elif status == "ready":
        summary = recommendation.get("summary")
        courses = recommendation.get("recommendedCourses")
        term = recommendation.get("estimatedTerm")
        if (
            not isinstance(summary, dict)
            or not isinstance(summary.get("recommendedCredits"), (int, float))
            or not isinstance(courses, list)
            or (term is not None and not isinstance(term, dict))
        ):
            raise RuntimeError("TOOL_RESPONSE_INVALID")
        term_label = (
            f"{term.get('name')} ({term.get('code')})"
            if term and isinstance(term.get("name"), str) and isinstance(term.get("code"), str)
            else "kỳ tiếp theo"
        )
        fact = (
            f"RecommendationService dự kiến {term_label}: {len(courses)} học phần, "
            f"{summary['recommendedCredits']:g} tín chỉ. Danh sách chi tiết bên dưới "
            "được giữ nguyên từ kết quả hệ thống."
        )
    else:
        raise RuntimeError("TOOL_RESPONSE_INVALID")

    prefix = "Mình đã kiểm tra: " if style == "encouraging" else "Kết quả: "
    return prefix + fact


def build_graph(model: ModelAdapter, gateway: RecommendationGateway):
    async def classify(state: AgentState) -> dict[str, Any]:
        decision: IntentDecision = await model.classify(
            state["request"].message,
            state["request"].history,
        )
        return {"intent": decision.intent, "clarification": decision.clarification}

    def route_intent(state: AgentState) -> str:
        if state["intent"] == "recommendation":
            return "recommend"
        if state["intent"] == "clarification":
            return "clarify"
        return "out_of_scope"

    async def recommend(state: AgentState) -> dict[str, Any]:
        try:
            result = await gateway.recommend(
                state["delegated_context"],
                state["correlation_id"],
            )
        except GatewayError as error:
            if error.code in {
                "PROFILE_REQUIRED_FIELDS",
                "CURRICULUM_NOT_SELECTED",
                "CURRICULUM_RECOMMENDATION_NOT_CONFIGURED",
                "CURRICULUM_RECOMMENDATION_SETTINGS_INVALID",
                "CURRICULUM_HAS_NO_TERMS",
                "CURRICULUM_HAS_NO_COURSES",
            }:
                return {
                    "recommendation": None,
                    "answer": "Mình chưa đủ dữ liệu cấu hình hồ sơ để đưa ra gợi ý học kỳ.",
                    "status": "clarification",
                    "tool_called": True,
                }
            raise
        style = await model.compose(state["request"].message, result)
        if style not in {"concise", "encouraging"}:
            raise RuntimeError("MODEL_OUTPUT_INVALID")
        answer = grounded_answer(result, style)
        return {
            "recommendation": result,
            "answer": answer,
            "status": "completed",
            "tool_called": True,
        }

    def clarify(state: AgentState) -> dict[str, Any]:
        return {
            "answer": state["clarification"] or "Bạn muốn hỏi về gợi ý học kỳ nào?",
            "status": "clarification",
            "tool_called": False,
        }

    def out_of_scope(_: AgentState) -> dict[str, Any]:
        return {
            "answer": "Mình chỉ hỗ trợ câu hỏi về gợi ý học kỳ.",
            "status": "out_of_scope",
            "tool_called": False,
        }

    graph = StateGraph(AgentState)
    graph.add_node("classify", classify)
    graph.add_node("recommend", recommend)
    graph.add_node("clarify", clarify)
    graph.add_node("out_of_scope", out_of_scope)
    graph.add_edge(START, "classify")
    graph.add_conditional_edges(
        "classify",
        route_intent,
        {
            "recommend": "recommend",
            "clarify": "clarify",
            "out_of_scope": "out_of_scope",
        },
    )
    graph.add_edge("recommend", END)
    graph.add_edge("clarify", END)
    graph.add_edge("out_of_scope", END)
    return graph.compile()


async def run_turn(
    graph: Any,
    request: TurnRequest,
    delegated_context: str,
    correlation_id: str,
) -> dict[str, Any]:
    result = await graph.ainvoke(
        {
            "request": request,
            "delegated_context": delegated_context,
            "correlation_id": correlation_id,
            "intent": "",
            "clarification": "",
            "recommendation": None,
            "answer": "",
            "status": "clarification",
            "tool_called": False,
        }
    )
    return result
