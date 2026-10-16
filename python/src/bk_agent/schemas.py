from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class HistoryMessage(ApiModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class TurnRequest(ApiModel):
    conversation_id: UUID
    message: str = Field(min_length=1, max_length=4000)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=12)

    @field_validator("message")
    @classmethod
    def trim_message(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("message must not be blank")
        return value

    @model_validator(mode="after")
    def enforce_payload_limit(self) -> "TurnRequest":
        if len(self.model_dump_json(by_alias=True).encode("utf-8")) > 16 * 1024:
            raise ValueError("request body exceeds 16 KiB")
        return self


class TurnResponse(ApiModel):
    status: Literal["completed", "clarification", "out_of_scope"]
    answer: str
    recommendation: dict[str, Any] | None = None
    tool_called: bool
    correlation_id: UUID
