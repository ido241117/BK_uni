import { useMemo, useState } from 'react';
import { Empty, Segmented, Tag, Typography } from 'antd';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';
import type { AdvisorStep, AdvisorStepRole } from '@/types';

const { Text } = Typography;

const ROLE_UI: Record<AdvisorStepRole, { label: string; color: string }> = {
    system: { label: 'SYSTEM', color: 'default' },
    context: { label: 'CONTEXT', color: 'green' },
    user: { label: 'USER', color: 'blue' },
    assistant: { label: 'ASSISTANT', color: 'purple' },
    tool: { label: 'TOOL', color: 'orange' },
    answer: { label: 'ANSWER', color: 'cyan' },
    error: { label: 'ERROR', color: 'red' },
};

const pretty = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') {
        try {
            return JSON.stringify(JSON.parse(value), null, 2);
        } catch {
            return value;
        }
    }
    return JSON.stringify(value, null, 2);
};

const oneLine = (text: string | null | undefined, max = 160) => {
    const flat = (text ?? '').replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

const isFormatter = (step: AdvisorStep) => Boolean((step.data as { formatter?: boolean } | null)?.formatter);

const preview = (step: AdvisorStep): string => {
    if (step.role === 'tool') return `${step.tool_name} ${oneLine(pretty(step.tool_args), 60)} → ${oneLine(step.content, 100)}`;
    if (step.role === 'assistant') {
        const calls = step.tool_calls?.map(call => call.name).join(', ');
        const prefix = isFormatter(step) ? '[JSON mode] ' : '';
        if (calls) return `${prefix}${oneLine(step.content, 60) || oneLine(step.reasoning, 80)} ⟶ gọi ${calls}`;
        return prefix + (oneLine(step.content) || oneLine(step.reasoning));
    }
    return oneLine(step.content);
};

const Block = ({ title, children }: { title: string; children: string }) => (
    <div className="trace-block">
        <div className="trace-block-title">{title}</div>
        <pre className="trace-pre">{children}</pre>
    </div>
);

const StepRow = ({ step }: { step: AdvisorStep }) => {
    const [open, setOpen] = useState(false);
    const ui = ROLE_UI[step.role];
    const meta = [
        step.prompt_tokens !== null ? `${step.prompt_tokens}+${step.completion_tokens ?? 0} tok` : null,
        step.cache_hit_tokens ? `cache ${step.cache_hit_tokens}` : null,
        step.duration_ms !== null ? `${(step.duration_ms / 1000).toFixed(2)} s` : null,
    ].filter(Boolean).join(' · ');

    return (
        <div className={`trace-row${open ? ' is-open' : ''}`}>
            <button type="button" className="trace-row-head" onClick={() => setOpen(value => !value)} aria-expanded={open}>
                <span className="trace-caret">{open ? <LuChevronDown /> : <LuChevronRight />}</span>
                <Tag color={ui.color} className="trace-role">{ui.label}</Tag>
                <span className="trace-preview">{preview(step)}</span>
                {meta && <span className="trace-meta">{meta}</span>}
            </button>
            {open && (
                <div className="trace-body">
                    {step.reasoning && <Block title="Thinking (reasoning_content)">{step.reasoning}</Block>}
                    {step.role === 'tool' && <Block title={`Tham số ${step.tool_name}`}>{pretty(step.tool_args)}</Block>}
                    {step.tool_calls?.map(call => (
                        <Block key={call.id} title={`Gọi tool ${call.name} (${call.id})`}>{pretty(call.arguments)}</Block>
                    ))}
                    {step.role === 'answer'
                        ? <Block title="Câu trả lời đã kiểm chứng (JSON)">{pretty(step.data)}</Block>
                        : step.content && <Block title={step.role === 'tool' ? 'Kết quả' : 'Nội dung'}>{step.role === 'tool' || step.role === 'context' ? pretty(step.content) : step.content}</Block>}
                    <Text type="secondary" style={{ fontSize: 12 }}>Lượt {step.turn} · bước {step.seq} · {new Date(step.created_at).toLocaleTimeString('vi-VN')}</Text>
                </div>
            )}
        </div>
    );
};

type Filter = 'all' | 'model' | 'tools';

export const Trajectory = ({ steps }: { steps: AdvisorStep[] }) => {
    const [filter, setFilter] = useState<Filter>('all');
    const totals = useMemo(() => steps.reduce((sum, step) => ({
        prompt: sum.prompt + (step.prompt_tokens ?? 0),
        completion: sum.completion + (step.completion_tokens ?? 0),
        cache: sum.cache + (step.cache_hit_tokens ?? 0),
        calls: sum.calls + (step.role === 'tool' ? 1 : 0),
        requests: sum.requests + (step.role === 'assistant' ? 1 : 0),
    }), { prompt: 0, completion: 0, cache: 0, calls: 0, requests: 0 }), [steps]);

    if (!steps.length) return <Empty description="Chưa có bước nào. Gửi câu hỏi để xem agent làm việc." />;

    const visible = steps.filter(step => (
        filter === 'all' || (filter === 'model' ? step.role === 'assistant' : step.role === 'tool')
    ));
    const turns = [...new Set(visible.map(step => step.turn))];

    return (
        <div className="trace">
            <div className="trace-toolbar">
                <Segmented<Filter>
                    size="small"
                    value={filter}
                    onChange={setFilter}
                    options={[{ value: 'all', label: 'Tất cả' }, { value: 'model', label: 'Model' }, { value: 'tools', label: 'Tools' }]}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {turns.length} lượt · {totals.requests} request · {totals.calls} tool call · {totals.prompt + totals.completion} tok
                    {totals.prompt > 0 && ` · cache hit ${Math.round((totals.cache / totals.prompt) * 100)}%`}
                </Text>
            </div>
            {turns.map(turn => (
                <div key={turn} className="trace-turn">
                    <div className="trace-turn-label">Lượt {turn}</div>
                    {visible.filter(step => step.turn === turn).map(step => <StepRow key={step.id} step={step} />)}
                </div>
            ))}
        </div>
    );
};

export default Trajectory;
