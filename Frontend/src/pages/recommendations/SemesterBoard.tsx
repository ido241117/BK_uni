import { type DragEvent, type ReactNode, useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Modal, Popover, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { LuCalendarX, LuCircleX, LuPin, LuPinOff, LuUndo2, LuX } from 'react-icons/lu';
import type { CourseAtSemester, PlanCourse, PlanResult, PlanWarningItem } from '@/types';
import { isBlockSlot, moveHint, type MoveHint } from './localHints';
import type { Scenario } from './scenario';

const { Text } = Typography;

/**
 * Bảng lộ trình (giai đoạn 12, bố cục theo mẫu `mau-what-if` làm wireframe, giữ màu và font của web):
 * học kỳ xếp dọc trên một đường thời gian, môn xếp ngang trong hàng; mỗi môn là một chấm khuyết + mã, tên bên dưới.
 * Mọi thao tác chỉ sửa kịch bản; **bấm Giải mới gọi bộ giải** (W6, W10).
 * - M6: bấm một môn → hàng chuyển vào được sáng lên ("Chuyển vào đây"), hàng không được mờ đi kèm lý do.
 * - M7, M8: ghim / bỏ ghim, "kỳ này không mở", giả định rớt, đổi môn cùng khối, gõ mã ở ô tự chọn tự do.
 * - M9: rê chuột vào môn xem TC, loại môn, ghim, đã chuyển, giả định rớt, không mở.
 * - M5: từng kỳ có Nghỉ / Học hè, ô "muốn … TC"; kỳ tắt thu thành một dòng mỏng.
 * - M12, M13: cảnh báo ngay trên hàng kỳ (nút "Kỳ này có mở"); môn chờ xếp khi bấm Giải.
 */

/** Lựa chọn trong ô khối: nhóm theo khối con (chuyên ngành) nếu có. */
export interface BlockChoice {
    group: string;
    options: { value: string; label: string; credits: number }[];
}

interface Props {
    result: PlanResult;
    semesters: string[];
    scenario: Scenario;
    onChange: (next: Scenario, message: string) => void;
    courseName: (code: string) => string;
    blockChoices: Map<string, BlockChoice[]>;
    passed: Set<string>;
    prerequisites: Map<string, string[]>;
    /** Cảnh báo có cấu trúc của bộ giải (`warning_items`); rỗng khi đang có sửa chưa giải. */
    warnings: PlanWarningItem[];
    onConfirm: (item: PlanWarningItem) => void;
}

const isSummer = (code: string) => code.endsWith('3');
const at = (course_code: string, semester_code: string): CourseAtSemester => ({ course_code, semester_code });
const REASON_LABEL: Record<string, string> = {
    required: 'Bắt buộc', elective: 'Tự chọn', wanted: 'Bạn muốn học', retake: 'Học lại', free_elective: 'Ô tự chọn tự do',
};
const ERROR = 'var(--ant-color-error, #cf1322)';
const WARNING = 'var(--ant-color-warning-text, #ad6800)';

const Dot = ({ filled, color = 'var(--brand)', dashed }: { filled?: boolean; color?: string; dashed?: boolean }) => (
    <span style={{
        display: 'inline-block', width: 9, height: 9, borderRadius: '50%', flex: 'none', boxSizing: 'border-box',
        border: `1.6px ${dashed ? 'dashed' : 'solid'} ${color}`, background: filled ? color : 'var(--bg-surface)',
    }} />
);

const SemesterBoard = ({
    result, semesters, scenario, onChange, courseName, blockChoices, passed, prerequisites, warnings, onConfirm,
}: Props) => {
    const [dragging, setDragging] = useState<string | null>(null);
    const [over, setOver] = useState<string | null>(null);
    const [selected, setSelected] = useState<string | null>(null);
    const [freeCode, setFreeCode] = useState<Record<string, string>>({});

    // Vị trí theo kết quả giải, rồi áp các chỗ sinh viên vừa ghim mà chưa giải (bảng hiện ngay vị trí mới).
    const cards = new Map<string, { course: PlanCourse; semester: string; moved: boolean }>();
    const failedCards: { course: PlanCourse; semester: string }[] = [];
    for (const s of result.semesters) {
        for (const c of s.courses) {
            if (c.assumed_fail) failedCards.push({ course: c, semester: s.semester_code });
            else cards.set(c.reason === 'free_elective' ? `${c.code}@${s.semester_code}` : c.code, { course: c, semester: s.semester_code, moved: false });
        }
    }
    for (const l of scenario.locked) {
        const card = cards.get(l.course_code);
        if (card && card.semester !== l.semester_code) cards.set(l.course_code, { ...card, semester: l.semester_code, moved: true });
    }
    const newlyFailed = scenario.assumedFail.filter(a => !failedCards.some(f => f.course.code === a.course_code));
    const pending = [
        ...scenario.locked.filter(l => !cards.has(l.course_code) && !failedCards.some(f => f.course.code === l.course_code))
            .map(l => `${l.course_code} (${l.semester_code})`),
        ...newlyFailed.map(a => `học lại ${a.course_code}`),
        ...scenario.freeChoices.filter(f => !cards.has(f.course_code)).map(f => `${f.course_code} (${f.semester_code})`),
    ].filter((v, i, a) => a.indexOf(v) === i);

    const placement = new Map([...cards.values()].filter(c => c.course.reason !== 'free_elective').map(c => [c.course.code, c.semester]));
    const credits = new Map([...cards.values()].map(c => [c.course.code, c.course.credits]));
    const hintCtx = {
        placement, credits, facts: result.course_facts ?? {}, skipped: scenario.skipped, summers: scenario.summers,
        notOffered: scenario.notOffered, offered: scenario.offered, assumedFail: scenario.assumedFail, targets: scenario.targets,
        limits: result.credit_rules ?? { main_max: 25, summer_max: 12 },
    };
    const selectedCard = selected ? cards.get(selected) : undefined;
    const movable = selectedCard && selectedCard.course.reason !== 'free_elective' ? selectedCard : undefined;
    const hintFor = (semester: string): MoveHint | null => (movable ? moveHint(movable.course.code, semester, hintCtx) : null);

    const firstActive = semesters.find(code => (isSummer(code) ? scenario.summers.includes(code) : !scenario.skipped.includes(code)));
    const pinnedAt = new Map(scenario.locked.map(l => [l.course_code, l.semester_code]));

    const set = (patch: Partial<Scenario>, message: string) => onChange({ ...scenario, ...patch }, message);
    const pin = (code: string, semester: string, message: string) => set({
        locked: [...scenario.locked.filter(l => l.course_code !== code), at(code, semester)],
        assumedFail: scenario.assumedFail.map(a => (a.course_code === code ? at(code, semester) : a)),
    }, message);
    const unpin = (code: string) => set({ locked: scenario.locked.filter(l => l.course_code !== code) }, `Bỏ ghim ${code}`);
    const move = (semester: string) => {
        if (!movable) return;
        pin(movable.course.code, semester, `Chuyển ${movable.course.code} vào ${semester}`);
        setSelected(null);
    };
    const markNotOffered = (code: string, semester: string) => Modal.confirm({
        title: `${code} không mở ở kỳ ${semester}?`,
        content: 'Lần Giải sau, bộ giải sẽ xếp môn này sang kỳ khác.',
        okText: 'Đúng vậy', cancelText: 'Hủy',
        onOk: () => {
            set({
                locked: scenario.locked.filter(l => !(l.course_code === code && l.semester_code === semester)),
                notOffered: [...scenario.notOffered.filter(n => !(n.course_code === code && n.semester_code === semester)), at(code, semester)],
            }, `${code} không mở ở ${semester}`);
            setSelected(null);
        },
    });
    const toggleFail = (code: string, semester: string) => {
        const on = scenario.assumedFail.some(a => a.course_code === code);
        set({
            assumedFail: on ? scenario.assumedFail.filter(a => a.course_code !== code) : [...scenario.assumedFail, at(code, semester)],
            locked: on ? scenario.locked : scenario.locked.filter(l => !(l.course_code === code && l.semester_code === semester)),
        }, on ? `Bỏ giả định rớt ${code}` : `Giả định rớt ${code} ở ${semester}`);
    };
    const swap = (from: string, to: string, semester: string) => set({
        locked: [...scenario.locked.filter(l => l.course_code !== from && l.course_code !== to), at(to, semester)],
        wanted: scenario.wanted.filter(w => w !== from),
    }, `Đổi ${from} → ${to} ở ${semester}`);
    const addFree = (key: string, semester: string) => {
        const code = (freeCode[key] ?? '').trim().toUpperCase();
        if (!code) return;
        set({ freeChoices: [...scenario.freeChoices.filter(f => f.course_code !== code), at(code, semester)] },
            `Chọn ${code} cho ô tự chọn tự do ở ${semester}`);
        setFreeCode(v => ({ ...v, [key]: '' }));
        setSelected(null);
    };
    const removeFree = (code: string) => set({
        freeChoices: scenario.freeChoices.filter(f => f.course_code !== code),
        locked: scenario.locked.filter(l => l.course_code !== code),
    }, `Bỏ ${code} khỏi ô tự chọn tự do`);
    const setTarget = (code: string, v: number | null) => {
        const targets = { ...scenario.targets };
        if (v == null) delete targets[code]; else targets[code] = v;
        set({ targets }, v == null ? `Bỏ số TC muốn ở ${code}` : `Muốn ${v} TC ở ${code}`);
    };
    /** `on`: kỳ hè thì học hè; kỳ chính thì nghỉ. */
    const toggleOff = (code: string, on: boolean) => (isSummer(code)
        ? set({ summers: on ? [...scenario.summers, code] : scenario.summers.filter(s => s !== code) },
            on ? `Học hè ${code}` : `Không học hè ${code}`)
        : set({ skipped: on ? [...scenario.skipped, code] : scenario.skipped.filter(s => s !== code) },
            on ? `Nghỉ ${code}` : `Không nghỉ ${code}`));

    const warningsOf = (course: string | undefined, semester: string) => warnings
        .filter(w => w.semester === semester && (course ? w.course === course : !w.course));
    const missingPrereqs = (code: string, semester: string) => (prerequisites.get(code) ?? [])
        .filter(p => !passed.has(p) && !((placement.get(p) ?? '999') < semester));

    const drop = (event: DragEvent, semester: string) => {
        event.preventDefault();
        setOver(null);
        const code = event.dataTransfer.getData('text/plain') || dragging;
        setDragging(null);
        if (code) pin(code, semester, `Chuyển ${code} vào ${semester}`);
    };

    /** M9: rê chuột xem chi tiết. */
    const details = (c: PlanCourse, semester: string, moved: boolean, failed?: boolean) => {
        const free = c.reason === 'free_elective';
        // Ô khối (24/11, người duyệt): môn tự chọn sinh viên chưa chọn chỉ hiện tên khối, không hiện môn bộ giải tạm xếp.
        if (isBlockSlot(c)) {
            return <div style={{ maxWidth: 260 }}><div>{c.block}</div><div>{c.credits} TC · chưa chọn môn; bấm để chọn môn trong khối</div></div>;
        }
        const lines = [
            free ? 'Ô tự chọn tự do: bấm để gõ mã môn bất kỳ' : courseName(c.code),
            `${c.credits} TC · ${REASON_LABEL[c.reason] ?? c.reason}${c.block && !free ? ` (${c.block})` : ''}`,
        ];
        if (pinnedAt.get(c.code) === semester) lines.push('Đã ghim vào kỳ này');
        if (moved) lines.push('Đã chuyển, chưa giải');
        if (failed) lines.push('Lần học này giả định rớt, học lại ở kỳ sau');
        else if (scenario.assumedFail.some(a => a.course_code === c.code && a.semester_code === semester)) lines.push('Giả định rớt kỳ này (chưa giải)');
        if (scenario.notOffered.some(n => n.course_code === c.code && n.semester_code === semester)) lines.push('Bạn báo kỳ này không mở');
        if (scenario.freeChoices.some(f => f.course_code === c.code)) lines.push('Bạn chọn cho ô tự chọn tự do');
        if (passed.has(c.code)) lines.push('Học cải thiện');
        for (const w of warningsOf(c.code, semester)) lines.push(`Lưu ý: ${w.message}`);
        return <div style={{ maxWidth: 260 }}>{lines.map(l => <div key={l}>{l}</div>)}</div>;
    };

    /** Bảng thao tác khi chọn một môn (M7, M8). */
    const actions = (key: string, c: PlanCourse, semester: string) => {
        const free = c.reason === 'free_elective';
        const pinned = pinnedAt.get(c.code) === semester;
        const failedHere = scenario.assumedFail.some(a => a.course_code === c.code && a.semester_code === semester);
        const chosenFree = scenario.freeChoices.some(f => f.course_code === c.code);
        const choices = c.block && !free ? blockChoices.get(c.block) : undefined;
        const options = choices?.map(g => ({
            label: g.group,
            options: g.options.filter(o => isBlockSlot(c) || o.value !== c.code).map(o => {
                const missing = missingPrereqs(o.value, semester);
                return { value: o.value, label: missing.length ? `${o.label} (cần ${missing.join(', ')} trước)` : o.label, disabled: missing.length > 0 };
            }),
        }));
        if (free) {
            return (
                <Space orientation="vertical" size={6} style={{ width: 260 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>Ô tự chọn tự do · {c.credits} TC</Text>
                    <Space.Compact style={{ width: '100%' }}>
                        <Input autoFocus placeholder="Gõ mã môn, vd IM1013" value={freeCode[key] ?? ''}
                            onChange={e => setFreeCode(v => ({ ...v, [key]: e.target.value }))}
                            onPressEnter={() => addFree(key, semester)} aria-label={`Mã môn cho ô tự chọn tự do ở ${semester}`} />
                        <Button type="primary" onClick={() => addFree(key, semester)}>Chọn</Button>
                    </Space.Compact>
                </Space>
            );
        }
        if (isBlockSlot(c)) {
            return (
                <Space orientation="vertical" size={6} style={{ width: 260 }}>
                    <Text strong>{c.block} · {c.credits} TC</Text>
                    <Select<string>
                        autoFocus size="small" showSearch style={{ width: '100%' }} placeholder="Chọn môn trong khối"
                        value={undefined} optionFilterProp="label" options={options}
                        onChange={code => { swap(c.code, code, semester); setSelected(null); }}
                    />
                </Space>
            );
        }
        return (
            <Space orientation="vertical" size={4} style={{ width: 260 }}>
                <Text strong>{c.code} · {courseName(c.code)}</Text>
                <Button size="small" type="text" block style={{ textAlign: 'left' }} icon={pinned ? <LuPinOff /> : <LuPin />}
                    onClick={() => (pinned ? unpin(c.code) : pin(c.code, semester, `Ghim ${c.code} vào ${semester}`))}>
                    {pinned ? 'Bỏ ghim' : `Ghim vào kỳ ${semester}`}
                </Button>
                <Button size="small" type="text" block style={{ textAlign: 'left' }} icon={<LuCalendarX />}
                    onClick={() => markNotOffered(c.code, semester)}>
                    Kỳ {semester} không mở môn này
                </Button>
                {!c.slot && (
                    <Button size="small" type="text" block style={{ textAlign: 'left' }} icon={<LuCircleX />}
                        onClick={() => toggleFail(c.code, semester)}>
                        {failedHere ? 'Bỏ giả định rớt' : 'Giả định rớt kỳ này'}
                    </Button>
                )}
                {chosenFree && (
                    <Button size="small" type="text" block style={{ textAlign: 'left' }} icon={<LuX />} onClick={() => removeFree(c.code)}>
                        Bỏ môn này khỏi ô tự do
                    </Button>
                )}
                {options && options.some(g => g.options.length) && (
                    <Select<string>
                        size="small" showSearch style={{ width: '100%' }}
                        placeholder={c.slot ? 'Chọn môn trong khối' : 'Đổi môn khác cùng khối'}
                        value={undefined} optionFilterProp="label" options={options}
                        onChange={code => { swap(c.code, code, semester); setSelected(null); }}
                    />
                )}
                <Text type="secondary" style={{ fontSize: 12 }}>Bấm "Chuyển vào đây" ở hàng đang sáng để chuyển môn.</Text>
            </Space>
        );
    };

    /** Một môn: chấm khuyết + mã bên phải, tên bên dưới (M9 khi rê chuột, M7 khi bấm). */
    const bead = (key: string, c: PlanCourse, semester: string, moved: boolean) => {
        const free = c.reason === 'free_elective';
        const isSelected = selected === key;
        const failedNow = scenario.assumedFail.some(a => a.course_code === c.code && a.semester_code === semester);
        const warn = warningsOf(c.code, semester).length > 0;
        const slot = isBlockSlot(c);
        const body = (
            <div
                draggable={!free && !slot}
                onDragStart={e => { e.dataTransfer.setData('text/plain', c.code); setDragging(c.code); }}
                onDragEnd={() => setDragging(null)}
                onClick={() => setSelected(isSelected ? null : key)}
                style={{ width: 136, padding: '4px 6px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    background: isSelected ? 'var(--brand-soft)' : undefined }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Dot filled={isSelected} dashed={free} color={failedNow ? ERROR : warn ? WARNING : 'var(--brand)'} />
                    <Text strong style={{ fontSize: 13, color: isSelected ? 'var(--brand)' : undefined }}>
                        {free ? 'Tự chọn tự do' : slot ? 'Tự chọn' : c.code}
                    </Text>
                    {moved && <span style={{ color: 'var(--brand)' }} title="Đã chuyển, chưa giải">•</span>}
                    {pinnedAt.get(c.code) === semester && !moved && <LuPin size={11} color="var(--text-muted)" />}
                </div>
                <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {free ? `${c.credits} TC · gõ mã môn bất kỳ` : slot ? `${c.block} · ${c.credits} TC` : courseName(c.code)}
                </Text>
            </div>
        );
        return isSelected
            ? (
                <Popover key={key} open placement="bottomLeft" content={actions(key, c, semester)}
                    onOpenChange={v => { if (!v) setSelected(null); }} trigger="click">
                    {body}
                </Popover>
            )
            : <Tooltip key={key} title={details(c, semester, moved)} mouseEnterDelay={0.25}>{body}</Tooltip>;
    };

    const failedBead = (c: PlanCourse, semester: string) => (
        <Tooltip key={`fail-${c.code}`} title={details(c, semester, false, true)}>
            <div style={{ width: 136, padding: '4px 6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Dot filled color={ERROR} />
                    <Text delete strong style={{ fontSize: 13 }}>{c.code}</Text>
                    <Button size="small" type="text" icon={<LuUndo2 />} aria-label={`Bỏ giả định rớt ${c.code}`}
                        onClick={() => toggleFail(c.code, semester)} />
                </div>
                <Text style={{ fontSize: 12, color: ERROR }}>Rớt (giả định)</Text>
            </div>
        </Tooltip>
    );

    const warningLine = (w: PlanWarningItem): ReactNode => (
        <div key={w.text} style={{ fontSize: 12, color: WARNING, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{w.course ? `${w.course}: ` : ''}{w.message}{w.rule ? ` (${w.rule})` : ''}</span>
            {w.confirm && (
                <Button size="small" onClick={() => onConfirm(w)}>{w.confirm === 'offered' ? 'Kỳ này có mở' : 'Mình đạt rồi'}</Button>
            )}
        </div>
    );

    return (
        <div>
            {pending.length > 0 && (
                <Text style={{ display: 'block', marginBottom: 8, color: 'var(--brand)' }}>✦ Chờ xếp khi bấm Giải: {pending.join(', ')}</Text>
            )}
            <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 9, top: 20, bottom: 20, width: 1, background: 'var(--border-soft)' }} />
                {semesters.map(code => {
                    const summer = isSummer(code);
                    const off = summer ? !scenario.summers.includes(code) : scenario.skipped.includes(code);
                    const list = [...cards.entries()].filter(([, c]) => c.semester === code);
                    const failedHere = failedCards.filter(f => f.semester === code);
                    const load = list.reduce((sum, [, c]) => sum + c.course.credits, 0) + failedHere.reduce((sum, f) => sum + f.course.credits, 0);
                    const target = scenario.targets[code];
                    const hint = hintFor(code);
                    const okHint = hint && 'ok' in hint ? hint : null;
                    const block = hint && 'block' in hint ? hint.block : null;
                    const blocked = scenario.notOffered.filter(n => n.semester_code === code);
                    // Cảnh báo của kỳ, và cảnh báo môn cần sinh viên bấm xác nhận (vd "Kỳ này có mở"), hiện ngay trên hàng.
                    const notes = [...warningsOf(undefined, code), ...warnings.filter(w => w.semester === code && w.course && w.confirm)];
                    const rowDrop = {
                        onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(code); },
                        onDragLeave: () => setOver(o => (o === code ? null : o)),
                        onDrop: (e: DragEvent) => drop(e, code),
                    };
                    if (off && list.length === 0 && failedHere.length === 0) {
                        // M5: kỳ tắt thu thành một dòng mỏng.
                        return (
                            <div key={code} {...rowDrop} style={{ display: 'grid', gridTemplateColumns: '20px 150px 1fr', alignItems: 'center',
                                padding: '6px 12px 6px 0', opacity: block ? 0.45 : 1 }}>
                                <span style={{ position: 'relative', zIndex: 1, marginLeft: 5, lineHeight: 0 }}><Dot filled color="var(--border-strong)" /></span>
                                <Text type="secondary" style={{ fontSize: 16 }}>{code}{summer ? ' · hè' : ''}</Text>
                                <Checkbox checked={!summer} onChange={e => toggleOff(code, summer ? e.target.checked : e.target.checked)}>
                                    <Text type="secondary">{summer ? 'Học hè kỳ này' : 'Đang nghỉ kỳ này'}</Text>
                                </Checkbox>
                            </div>
                        );
                    }
                    return (
                        <div key={code} {...rowDrop} style={{
                            display: 'grid', gridTemplateColumns: '20px 150px 1fr', alignItems: 'start', padding: '12px 12px 12px 0',
                            borderRadius: 'var(--radius-lg)', transition: 'background .15s, opacity .15s',
                            background: okHint || over === code ? 'var(--brand-soft)' : undefined, opacity: block ? 0.45 : 1,
                        }}>
                            <span style={{ position: 'relative', zIndex: 1, marginLeft: 5, marginTop: 9, lineHeight: 0 }}>
                                <Dot filled color={code === firstActive || okHint ? 'var(--brand)' : 'var(--text-muted)'} />
                            </span>
                            <div>
                                <Space size={6} align="baseline">
                                    <Text strong style={{ fontSize: 22, lineHeight: 1.1 }}>{code}</Text>
                                    {summer && <Tag color="orange" style={{ marginInlineEnd: 0 }}>Hè</Tag>}
                                    <Text type="secondary" style={{ fontSize: 12 }}>{load}{target != null ? ` / ${target}` : ''} TC</Text>
                                </Space>
                                {code === firstActive && <div><Text type="secondary" style={{ fontSize: 11 }}>Kỳ tới</Text></div>}
                                <Space size={10} wrap style={{ marginTop: 4 }}>
                                    <Checkbox checked={summer ? !off : off} onChange={e => toggleOff(code, e.target.checked)}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>{summer ? 'học hè' : 'nghỉ'}</Text>
                                    </Checkbox>
                                    <Space size={2}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>muốn</Text>
                                        <InputNumber size="small" variant="borderless" style={{ width: 44, borderBottom: '1px dashed var(--border-strong)' }}
                                            min={1} max={30} placeholder="—" value={target ?? null} aria-label={`Số TC muốn ở ${code}`}
                                            onChange={v => setTarget(code, v == null ? null : Number(v))} />
                                        <Text type="secondary" style={{ fontSize: 12 }}>TC</Text>
                                    </Space>
                                </Space>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 6px', alignItems: 'flex-start' }}>
                                {(notes.length > 0 || blocked.length > 0) && (
                                    <div style={{ flexBasis: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        {notes.map(warningLine)}
                                        {blocked.length > 0 && (
                                            <Space size={4} wrap>
                                                {blocked.map(n => (
                                                    <Tag key={n.course_code} closable icon={<LuCalendarX />}
                                                        onClose={() => set({ notOffered: scenario.notOffered.filter(x => x !== n) }, `${n.course_code} mở lại ở ${code}`)}>
                                                        {n.course_code} không mở
                                                    </Tag>
                                                ))}
                                            </Space>
                                        )}
                                    </div>
                                )}
                                {failedHere.map(f => failedBead(f.course, code))}
                                {list.map(([key, c]) => bead(key, c.course, code, c.moved))}
                                {list.length === 0 && failedHere.length === 0 && <Text type="secondary" style={{ fontSize: 12 }}>Chưa có môn</Text>}
                                {okHint && (
                                    <Space size={8} style={{ alignSelf: 'center' }}>
                                        <Button type="primary" ghost shape="round" size="small" onClick={() => move(code)}>Chuyển vào đây</Button>
                                        {okHint.soft && <Text style={{ fontSize: 12, color: WARNING }}>{okHint.soft}</Text>}
                                    </Space>
                                )}
                                {block && <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic', alignSelf: 'center' }}>{block}</Text>}
                            </div>
                        </div>
                    );
                })}
            </div>
            <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
                Rê chuột vào môn để xem chi tiết, bấm để chỉnh. Khi đang chọn môn: hàng sáng lên là chuyển vào được, hàng mờ là không.
                Dấu • cạnh mã: đã chuyển, chưa giải. Trang chỉ kiểm nhanh; bấm Giải để bộ giải kiểm đầy đủ.
            </Text>
        </div>
    );
};

export default SemesterBoard;
