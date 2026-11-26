import { useMemo, useState, type ReactNode } from 'react';
import { Empty, Segmented, Typography } from 'antd';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';
import { ToneChip } from '@/components';
import type { AdvisorStep, AdvisorStepRole } from '@/types';
import i18n from '@/i18n';

const { Text } = Typography;

// Màu của từng vai trò nằm ở `.trace-row[data-role]` trong styles/components.css.
const ROLE_UI: Record<AdvisorStepRole, { label: string }> = {
    system: { label: 'SYSTEM' },
    context: { label: 'CONTEXT' },
    user: { label: 'USER' },
    assistant: { label: 'ASSISTANT' },
    tool: { label: 'TOOL' },
    answer: { label: 'ANSWER' },
    error: { label: 'ERROR' },
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

/**
 * Dòng tóm tắt của một bước, chia thành phần có kiểu riêng thay vì một chuỗi monospace:
 * tên tool đậm màu cam, tham số / kết quả monospace nhạt, mũi tên tách vào → ra, lời model là chữ thường,
 * khi chỉ có thinking thì nghiêng nhạt, context (JSON) monospace nhạt.
 */
const preview = (step: AdvisorStep): ReactNode => {
    if (step.role === 'tool') {
        return (
            <>
                <span className="tp-tool">{step.tool_name}</span>
                <span className="tp-code">{oneLine(pretty(step.tool_args), 60)}</span>
                <span className="tp-arrow" aria-hidden>→</span>
                <span className="tp-code tp-out">{oneLine(step.content, 100)}</span>
            </>
        );
    }
    if (step.role === 'assistant') {
        const calls = step.tool_calls?.map(call => call.name) ?? [];
        const text = oneLine(step.content, calls.length ? 80 : 160);
        return (
            <>
                {isFormatter(step) && <span className="tp-flag">JSON mode</span>}
                {text
                    ? <span className="tp-text">{text}</span>
                    : <span className="tp-thinking">{oneLine(step.reasoning, calls.length ? 80 : 160)}</span>}
                {calls.length > 0 && (
                    <>
                        <span className="tp-arrow" aria-hidden>⟶</span>
                        <span className="tp-muted">{i18n.t('gọi')}</span>
                        {calls.map((name, index) => <span key={index} className="tp-tool">{name}</span>)}
                    </>
                )}
            </>
        );
    }
    if (step.role === 'context') return <span className="tp-code">{oneLine(step.content)}</span>;
    if (step.role === 'system') return <span className="tp-muted">{oneLine(step.content)}</span>;
    return <span className={step.role === 'error' ? 'tp-error' : 'tp-text'}>{oneLine(step.content)}</span>;
};

/** `value` → { text, json }: JSON (object hoặc chuỗi JSON) được format 2 khoảng trắng, còn lại giữ nguyên. */
const toDisplay = (value: unknown): { text: string; json: boolean } => {
    if (value === null || value === undefined) return { text: '', json: false };
    if (typeof value === 'string') {
        try {
            const parsed: unknown = JSON.parse(value);
            if (parsed !== null && typeof parsed === 'object') return { text: JSON.stringify(parsed, null, 2), json: true };
        } catch { /* không phải JSON: hiện như văn bản */ }
        return { text: value, json: false };
    }
    return { text: JSON.stringify(value, null, 2), json: true };
};

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
/** Quá dài thì bỏ tô màu (kết quả tool có thể vài trăm KB), vẫn hiện đủ nội dung. */
const HIGHLIGHT_LIMIT = 60_000;

/** Tô màu JSON đã format: khóa / chuỗi / số / true-false-null, phần còn lại (ngoặc, dấu phẩy) màu nhạt. */
const JsonText = ({ text }: { text: string }) => {
    const parts = useMemo(() => {
        if (text.length > HIGHLIGHT_LIMIT) return null;
        const out: ReactNode[] = [];
        let last = 0;
        for (const match of text.matchAll(JSON_TOKEN)) {
            const index = match.index ?? 0;
            if (index > last) out.push(<span key={`p${last}`} className="tj-punct">{text.slice(last, index)}</span>);
            const [token, str, colon, literal] = match;
            if (str && colon) {
                out.push(<span key={index} className="tj-key">{str}</span>, <span key={`c${index}`} className="tj-punct">{colon}</span>);
            } else if (str) {
                out.push(<span key={index} className="tj-str">{str}</span>);
            } else {
                out.push(<span key={index} className={literal ? 'tj-lit' : 'tj-num'}>{token}</span>);
            }
            last = index + token.length;
        }
        if (last < text.length) out.push(<span key={`p${last}`} className="tj-punct">{text.slice(last)}</span>);
        return out;
    }, [text]);
    return <pre className="trace-pre" data-kind="json">{parts ?? text}</pre>;
};

type BlockKind = 'thinking' | 'input' | 'output' | 'text';

/**
 * Một khối trong thân bước: nhãn mục (chữ in hoa nhỏ) + chip tên tool / mã gọi nếu có, rồi nội dung.
 * thinking = văn xuôi nghiêng trên nền kem; input / output = JSON tô màu trên nền hồng nhạt; text = văn bản thường.
 */
const Block = ({ kind, label, chip, sub, value }: {
    kind: BlockKind;
    label: string;
    chip?: string;
    sub?: string;
    value: unknown;
}) => {
    const { text, json } = toDisplay(value);
    if (!text) return null;
    return (
        <section className="trace-block" data-kind={kind}>
            <div className="trace-block-head">
                <span className="trace-block-title">{label}</span>
                {chip && <ToneChip tone={kind === 'output' ? 'good' : 'warn'}>{chip}</ToneChip>}
                {sub && <span className="trace-block-sub">{sub}</span>}
            </div>
            {json
                ? <JsonText text={text} />
                : <div className="trace-prose">{text}</div>}
        </section>
    );
};

const StepRow = ({ step }: { step: AdvisorStep }) => {
    const [open, setOpen] = useState(false);
    const ui = ROLE_UI[step.role];
    const meta = [
        step.prompt_tokens !== null ? `${step.prompt_tokens}+${step.completion_tokens ?? 0} tok` : null,
        step.cache_hit_tokens ? `cache ${step.cache_hit_tokens}` : null,
        step.duration_ms !== null ? `${(step.duration_ms / 1000).toFixed(2)} s` : null,
    ].filter(Boolean).join(' · ');

    return (
        <div className={`trace-row${open ? ' is-open' : ''}`} data-role={step.role}>
            <button type="button" className="trace-row-head" onClick={() => setOpen(value => !value)} aria-expanded={open}>
                <span className="trace-caret">{open ? <LuChevronDown /> : <LuChevronRight />}</span>
                <span className="trace-role">{ui.label}</span>
                <span className="trace-preview">{preview(step)}</span>
                {meta && <span className="trace-meta">{meta}</span>}
            </button>
            {open && (
                <div className="trace-body">
                    {step.reasoning && <Block kind="thinking" label="Thinking" sub="reasoning_content" value={step.reasoning} />}
                    {step.role === 'tool' && <Block kind="input" label={i18n.t('Tham số')} chip={step.tool_name ?? undefined} value={step.tool_args} />}
                    {step.tool_calls?.map(call => (
                        <Block key={call.id} kind="input" label={i18n.t('Gọi tool')} chip={call.name} sub={call.id} value={call.arguments} />
                    ))}
                    {step.role === 'answer'
                        ? <Block kind="output" label={i18n.t('Câu trả lời đã kiểm chứng (JSON)')} value={step.data} />
                        : step.role === 'tool'
                            ? <Block kind="output" label={i18n.t('Kết quả')} chip={step.tool_name ?? undefined} value={step.content} />
                            : <Block kind="text" label={i18n.t('Nội dung')} value={step.content} />}
                    <div className="trace-foot">
                        {i18n.t('Lượt')}{' '}{step.turn}{' '}{i18n.t('· bước')}{' '}{step.seq} · {new Date(step.created_at).toLocaleTimeString('vi-VN')}
                        {meta && <> · {meta}</>}
                    </div>
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

    if (!steps.length) return <Empty description={i18n.t('Chưa có bước nào. Gửi câu hỏi để xem agent làm việc.')} />;

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
                    options={[{ value: 'all', label: i18n.t('Tất cả') }, { value: 'model', label: 'Model' }, { value: 'tools', label: 'Tools' }]}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {turns.length}{' '}{i18n.t('lượt ·')}{' '}{totals.requests} request · {totals.calls} tool call · {totals.prompt + totals.completion} tok
                    {totals.prompt > 0 && ` · cache hit ${Math.round((totals.cache / totals.prompt) * 100)}%`}
                </Text>
            </div>
            {turns.map(turn => (
                <div key={turn} className="trace-turn">
                    <div className="trace-turn-label">{i18n.t('Lượt')}{' '}{turn}</div>
                    {visible.filter(step => step.turn === turn).map(step => <StepRow key={step.id} step={step} />)}
                </div>
            ))}
        </div>
    );
};

export default Trajectory;
