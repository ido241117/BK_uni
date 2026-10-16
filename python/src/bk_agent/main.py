from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException, Request

from bk_agent.config import Settings
from bk_agent.gateway import GatewayError, RecommendationGateway
from bk_agent.graph import build_graph, run_turn
from bk_agent.provider import DeepSeekAdapter, ModelAdapter
from bk_agent.schemas import TurnRequest, TurnResponse
from bk_agent.security import verify_delegated_context, verify_service_token


def create_app(
    settings: Settings | None = None,
    model: ModelAdapter | None = None,
    gateway: RecommendationGateway | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        resolved_settings = settings or Settings()
        app.state.settings = resolved_settings
        app.state.graph = None
        if model is not None and gateway is not None:
            app.state.graph = build_graph(model, gateway)
        elif all(
            (
                resolved_settings.service_token,
                resolved_settings.gateway_service_token,
                resolved_settings.delegation_public_key,
                resolved_settings.deepseek_api_key,
            )
        ):
            app.state.graph = build_graph(
                DeepSeekAdapter(resolved_settings),
                RecommendationGateway(
                    resolved_settings.gateway_base_url,
                    resolved_settings.gateway_service_token.get_secret_value(),
                    resolved_settings.gateway_timeout_seconds,
                ),
            )
        yield

    app = FastAPI(title="BK Uni Academic Agent", lifespan=lifespan)

    @app.get("/health/live")
    async def live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready")
    async def ready(request: Request) -> dict[str, str]:
        if getattr(request.app.state, "graph", None) is None:
            raise HTTPException(status_code=503, detail={"code": "AGENT_NOT_CONFIGURED"})
        return {"status": "ready"}

    @app.post("/internal/v1/turns", response_model=TurnResponse)
    async def turn(
        body: TurnRequest,
        request: Request,
        correlation_id: Annotated[UUID, Header(alias="X-Correlation-ID")],
        authorization: Annotated[str | None, Header()] = None,
        delegated_context: Annotated[str | None, Header(alias="X-Delegated-Context")] = None,
    ) -> TurnResponse:
        resolved_settings: Settings = request.app.state.settings
        verify_service_token(authorization, resolved_settings)
        verify_delegated_context(
            delegated_context,
            resolved_settings,
            str(correlation_id),
        )
        graph = request.app.state.graph
        if graph is None:
            raise HTTPException(status_code=503, detail={"code": "AGENT_NOT_CONFIGURED"})
        try:
            result = await run_turn(graph, body, delegated_context or "", str(correlation_id))
        except GatewayError as error:
            if error.code == "TOOL_TIMEOUT":
                raise HTTPException(
                    status_code=504,
                    detail={"code": "AGENT_TIMEOUT"},
                ) from None
            raise HTTPException(
                status_code=502,
                detail={"code": "AGENT_UNAVAILABLE"},
            ) from None
        except Exception:  # noqa: BLE001
            raise HTTPException(
                status_code=502,
                detail={"code": "AGENT_UNAVAILABLE"},
            ) from None
        return TurnResponse(
            status=result["status"],
            answer=result["answer"],
            recommendation=result["recommendation"],
            tool_called=result["tool_called"],
            correlation_id=correlation_id,
        )

    return app


app = create_app()
