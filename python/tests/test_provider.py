from types import SimpleNamespace

import pytest

from bk_agent.provider import DeepSeekAdapter


class StubChatModel:
    def __init__(self, content: str) -> None:
        self.content = content

    async def ainvoke(self, messages: list[object]) -> SimpleNamespace:
        return SimpleNamespace(content=self.content)


@pytest.mark.asyncio
async def test_classifier_rejects_invalid_structured_output() -> None:
    adapter = object.__new__(DeepSeekAdapter)
    adapter.model = StubChatModel("not-json")

    with pytest.raises(RuntimeError, match="MODEL_OUTPUT_INVALID"):
        await adapter.classify("Gợi ý học kỳ.", [])


@pytest.mark.asyncio
async def test_answer_adapter_rejects_missing_answer_schema() -> None:
    adapter = object.__new__(DeepSeekAdapter)
    adapter.model = StubChatModel('{"text":"Không đúng schema"}')

    with pytest.raises(RuntimeError, match="MODEL_OUTPUT_INVALID"):
        await adapter.compose("Gợi ý học kỳ.", {"status": "ready"})


@pytest.mark.asyncio
async def test_answer_adapter_rejects_free_form_fact_text() -> None:
    adapter = object.__new__(DeepSeekAdapter)
    adapter.model = StubChatModel('{"style":"Môn SYN999 có 99 tín chỉ"}')

    with pytest.raises(RuntimeError, match="MODEL_OUTPUT_INVALID"):
        await adapter.compose("Gợi ý học kỳ.", {"status": "ready"})
