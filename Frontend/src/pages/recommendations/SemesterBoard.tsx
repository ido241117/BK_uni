import { type DragEvent, type ReactNode, useState } from 'react';
import { Button, Checkbox, Input, InputNumber, Modal, Select, Space, Tag, Typography } from 'antd';
import { LuArrowRightLeft, LuCalendarX, LuCircleX, LuPin, LuPinOff, LuUndo2, LuX } from 'react-icons/lu';
import { Bead, IOutLinedBtn, SparkleMark } from '@/components';
import type { CourseAtSemester, PlanCourse, PlanResult, PlanWarningItem } from '@/types';
import { isBlockSlot, moveHint, type MoveHint } from './localHints';
import type { Scenario } from './scenario';
import i18n from '@/i18n';
import { trLive } from '@/i18n/live';

const { Text } = Typography;

/**
 * Bảng lộ trình (ui-template/semester-timeline.html, section A): semesters stack on a thread that runs down the
 * left edge (fade-in for the past, dashed for the plan, ending at the graduation semester). Checkpoints:
 * next semester = solid blue sparkle, other semesters = hollow sparkle, graduation = solid rose sparkle, off
 * semesters = a small ring. Each checkpoint shows the credits accumulated after it. Courses are pink rings (Bead).
 * Empty semesters after graduation are hidden, except while a course is being moved or dragged.
 * Mọi thao tác chỉ sửa kịch bản; **bấm Giải mới gọi bộ giải** (W6, W10).
 * - M6: chế độ chuyển của một môn → hàng chuyển vào được sáng lên ("Chuyển vào đây"), hàng không được mờ đi kèm lý do.
 * - M7, M8: ghim / bỏ ghim, "kỳ này không mở", giả định rớt, đổi môn cùng khối, gõ mã ở ô tự chọn tự do.
 * - M9: bấm một môn để mở rộng ngay dưới hàng (mở được nhiều môn cùng lúc): TC, loại môn, ghim, đã chuyển,
 *   giả định rớt, không mở, cùng các thao tác. "Chuyển kỳ…" trong phần mở rộng bật chế độ chuyển (M6).
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
    /** Credits the curriculum requires; enables the accumulated-credit labels. */
    totalCredits?: number | null;
    /** Semesters already behind the student (first semester of the cohort up to the current one). */
    past?: { from: string; current: string; count: number } | null;
}

const isSummer = (code: string) => code.endsWith('3');
const at = (course_code: string, semester_code: string): CourseAtSemester => ({ course_code, semester_code });
const REASON_LABEL: Record<string, string> = trLive({
    required: 'Bắt buộc', elective: 'Tự chọn', wanted: 'Bạn muốn học', retake: 'Học lại', free_elective: 'Ô tự chọn tự do',
});
/** Thread segment above / below a checkpoint. */
type Segment = 'plan' | 'fade' | 'none';

const SemesterBoard = ({
    result, semesters, scenario, onChange, courseName, blockChoices, passed, prerequisites, warnings, onConfirm, totalCredits, past,
}: Props) => {
    const [dragging, setDragging] = useState<string | null>(null);
    const [over, setOver] = useState<string | null>(null);
    /** Course in move mode (M6): rows it can move into light up. */
    const [selected, setSelected] = useState<string | null>(null);
    /** Expanded courses, in the order they were opened. */
    const [expanded, setExpanded] = useState<string[]>([]);
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
        ...newlyFailed.map(a => i18n.t('học lại {{course_code}}', { course_code: a.course_code })),
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
    const unpin = (code: string) => set({ locked: scenario.locked.filter(l => l.course_code !== code) }, i18n.t('Bỏ ghim {{code}}', { code: code }));
    const move = (semester: string) => {
        if (!movable) return;
        pin(movable.course.code, semester, i18n.t('Chuyển {{code}} vào {{semester}}', { code: movable.course.code, semester: semester }));
        setSelected(null);
    };
    const markNotOffered = (code: string, semester: string) => Modal.confirm({
        title: i18n.t('{{code}} không mở ở kỳ {{semester}}?', { code: code, semester: semester }),
        content: i18n.t('Lần Giải sau, bộ giải sẽ xếp môn này sang kỳ khác.'),
        okText: i18n.t('Đúng vậy'), cancelText: i18n.t('Hủy'),
        onOk: () => {
            set({
                locked: scenario.locked.filter(l => !(l.course_code === code && l.semester_code === semester)),
                notOffered: [...scenario.notOffered.filter(n => !(n.course_code === code && n.semester_code === semester)), at(code, semester)],
            }, i18n.t('{{code}} không mở ở {{semester}}', { code: code, semester: semester }));
            setSelected(null);
        },
    });
    const toggleFail = (code: string, semester: string) => {
        const on = scenario.assumedFail.some(a => a.course_code === code);
        set({
            assumedFail: on ? scenario.assumedFail.filter(a => a.course_code !== code) : [...scenario.assumedFail, at(code, semester)],
            locked: on ? scenario.locked : scenario.locked.filter(l => !(l.course_code === code && l.semester_code === semester)),
        }, on ? i18n.t('Bỏ giả định rớt {{code}}', { code: code }) : i18n.t('Giả định rớt {{code}} ở {{semester}}', { code: code, semester: semester }));
    };
    const swap = (from: string, to: string, semester: string) => set({
        locked: [...scenario.locked.filter(l => l.course_code !== from && l.course_code !== to), at(to, semester)],
        wanted: scenario.wanted.filter(w => w !== from),
    }, i18n.t('Đổi {{from}} → {{to}} ở {{semester}}', { from: from, to: to, semester: semester }));
    const addFree = (key: string, semester: string) => {
        const code = (freeCode[key] ?? '').trim().toUpperCase();
        if (!code) return;
        set({ freeChoices: [...scenario.freeChoices.filter(f => f.course_code !== code), at(code, semester)] },
            i18n.t('Chọn {{code}} cho ô tự chọn tự do ở {{semester}}', { code: code, semester: semester }));
        setFreeCode(v => ({ ...v, [key]: '' }));
        setSelected(null);
    };
    const removeFree = (code: string) => set({
        freeChoices: scenario.freeChoices.filter(f => f.course_code !== code),
        locked: scenario.locked.filter(l => l.course_code !== code),
    }, i18n.t('Bỏ {{code}} khỏi ô tự chọn tự do', { code: code }));
    const setTarget = (code: string, v: number | null) => {
        const targets = { ...scenario.targets };
        if (v == null) delete targets[code]; else targets[code] = v;
        set({ targets }, v == null ? i18n.t('Bỏ số TC muốn ở {{code}}', { code: code }) : i18n.t('Muốn {{v}} TC ở {{code}}', { v: v, code: code }));
    };
    /** `on`: kỳ hè thì học hè; kỳ chính thì nghỉ. */
    const toggleOff = (code: string, on: boolean) => (isSummer(code)
        ? set({ summers: on ? [...scenario.summers, code] : scenario.summers.filter(s => s !== code) },
            on ? i18n.t('Học hè {{code}}', { code: code }) : i18n.t('Không học hè {{code}}', { code: code }))
        : set({ skipped: on ? [...scenario.skipped, code] : scenario.skipped.filter(s => s !== code) },
            on ? i18n.t('Nghỉ {{code}}', { code: code }) : i18n.t('Không nghỉ {{code}}', { code: code })));

    const warningsOf = (course: string | undefined, semester: string) => warnings
        .filter(w => w.semester === semester && (course ? w.course === course : !w.course));
    const missingPrereqs = (code: string, semester: string) => (prerequisites.get(code) ?? [])
        .filter(p => !passed.has(p) && !((placement.get(p) ?? '999') < semester));

    const drop = (event: DragEvent, semester: string) => {
        event.preventDefault();
        setOver(null);
        const code = event.dataTransfer.getData('text/plain') || dragging;
        setDragging(null);
        if (code) pin(code, semester, i18n.t('Chuyển {{code}} vào {{semester}}', { code: code, semester: semester }));
    };

    const toggleExpanded = (key: string) => {
        const open = expanded.includes(key);
        setExpanded(list => (open ? list.filter(k => k !== key) : [...list, key]));
        if (open && selected === key) setSelected(null);
    };

    /** M9: facts shown in a course's expanded section. */
    const details = (c: PlanCourse, semester: string, moved: boolean) => {
        const free = c.reason === 'free_elective';
        // Ô khối (24/11, người duyệt): môn tự chọn sinh viên chưa chọn chỉ hiện tên khối, không hiện môn bộ giải tạm xếp.
        if (isBlockSlot(c)) {
            return <ul className="bead-facts"><li>{c.credits}{' '}{i18n.t('TC · chưa chọn môn; bấm để chọn môn trong khối')}</li></ul>;
        }
        const lines = [
            i18n.t('{{credits}} TC · {{v1}}{{v2}}', { credits: c.credits, v1: REASON_LABEL[c.reason] ?? c.reason, v2: c.block && !free ? ` (${c.block})` : '' }),
        ];
        if (free) lines.push(i18n.t('Ô tự chọn tự do: bấm để gõ mã môn bất kỳ'));
        if (pinnedAt.get(c.code) === semester) lines.push(i18n.t('Đã ghim vào kỳ này'));
        if (moved) lines.push(i18n.t('Đã chuyển, chưa giải'));
        if (scenario.assumedFail.some(a => a.course_code === c.code && a.semester_code === semester)) lines.push(i18n.t('Giả định rớt kỳ này (chưa giải)'));
        if (scenario.notOffered.some(n => n.course_code === c.code && n.semester_code === semester)) lines.push(i18n.t('Bạn báo kỳ này không mở'));
        if (scenario.freeChoices.some(f => f.course_code === c.code)) lines.push(i18n.t('Bạn chọn cho ô tự chọn tự do'));
        if (passed.has(c.code)) lines.push(i18n.t('Học cải thiện'));
        for (const w of warningsOf(c.code, semester)) lines.push(i18n.t('Lưu ý: {{message}}', { message: w.message }));
        return <ul className="bead-facts">{lines.map(l => <li key={l}>{l}</li>)}</ul>;
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
                return { value: o.value, label: missing.length ? i18n.t('{{label}} (cần {{v1}} trước)', { label: o.label, v1: missing.join(', ') }) : o.label, disabled: missing.length > 0 };
            }),
        }));
        if (free) {
            return (
                <Space orientation="vertical" size={6} style={{ width: 280 }}>
                    <Space.Compact style={{ width: '100%' }}>
                        <Input autoFocus placeholder={i18n.t('Gõ mã môn, vd IM1013')} value={freeCode[key] ?? ''}
                            onChange={e => setFreeCode(v => ({ ...v, [key]: e.target.value }))}
                            onPressEnter={() => addFree(key, semester)} aria-label={i18n.t('Mã môn cho ô tự chọn tự do ở {{semester}}', { semester: semester })} />
                        <Button type="primary" onClick={() => addFree(key, semester)}>{i18n.t('Chọn')}</Button>
                    </Space.Compact>
                </Space>
            );
        }
        if (isBlockSlot(c)) {
            return (
                <Space orientation="vertical" size={6} style={{ width: 280 }}>
                    <Select<string>
                        autoFocus size="small" showSearch style={{ width: '100%' }} placeholder={i18n.t('Chọn môn trong khối')}
                        value={undefined} optionFilterProp="label" options={options}
                        onChange={code => { swap(c.code, code, semester); setSelected(null); }}
                    />
                </Space>
            );
        }
        return (
            <div className="bead-actions">
                <Button size="small" type="text" icon={<LuArrowRightLeft />} aria-pressed={selected === key}
                    onClick={() => setSelected(selected === key ? null : key)}>
                    {selected === key ? i18n.t('Thôi chuyển') : i18n.t('Chuyển kỳ…')}
                </Button>
                <Button size="small" type="text" icon={pinned ? <LuPinOff /> : <LuPin />}
                    onClick={() => (pinned ? unpin(c.code) : pin(c.code, semester, i18n.t('Ghim {{code}} vào {{semester}}', { code: c.code, semester: semester })))}>
                    {pinned ? i18n.t('Bỏ ghim') : i18n.t('Ghim vào kỳ {{semester}}', { semester: semester })}
                </Button>
                <Button size="small" type="text" icon={<LuCalendarX />}
                    onClick={() => markNotOffered(c.code, semester)}>
                    {i18n.t('Kỳ')}{' '}{semester}{' '}{i18n.t('không mở môn này')}
                </Button>
                {!c.slot && (
                    <Button size="small" type="text" icon={<LuCircleX />}
                        onClick={() => toggleFail(c.code, semester)}>
                        {failedHere ? i18n.t('Bỏ giả định rớt') : i18n.t('Giả định rớt kỳ này')}
                    </Button>
                )}
                {chosenFree && (
                    <Button size="small" type="text" icon={<LuX />} onClick={() => removeFree(c.code)}>
                        {i18n.t('Bỏ môn này khỏi ô tự do')}
                    </Button>
                )}
                {options && options.some(g => g.options.length) && (
                    <Select<string>
                        size="small" showSearch style={{ width: 240 }}
                        placeholder={c.slot ? i18n.t('Chọn môn trong khối') : i18n.t('Đổi môn khác cùng khối')}
                        value={undefined} optionFilterProp="label" options={options}
                        onChange={code => { swap(c.code, code, semester); setSelected(null); }}
                    />
                )}
                {selected === key && <Text type="secondary" style={{ fontSize: 12 }}>{i18n.t('Bấm "Chuyển vào đây" ở hàng đang sáng để chuyển môn.')}</Text>}
            </div>
        );
    };

    /** One course: hollow bead + code, name below. Click to expand / collapse its section (M9, M7). */
    const bead = (key: string, c: PlanCourse, semester: string, moved: boolean) => {
        const free = c.reason === 'free_elective';
        const open = expanded.includes(key);
        const failedNow = scenario.assumedFail.some(a => a.course_code === c.code && a.semester_code === semester);
        const warn = warningsOf(c.code, semester).length > 0;
        const slot = isBlockSlot(c);
        return (
            <button
                type="button"
                key={key}
                className="bead"
                data-selected={open}
                aria-expanded={open}
                draggable={!free && !slot}
                onDragStart={e => { e.dataTransfer.setData('text/plain', c.code); setDragging(c.code); }}
                onDragEnd={() => setDragging(null)}
                onClick={() => toggleExpanded(key)}
            >
                <span className="bead-head">
                    <Bead state={failedNow ? 'failed' : 'suggest'} tone={!failedNow && warn ? 'warn' : undefined} dashed={free} />
                    <span className="bead-code">{free ? i18n.t('Tự chọn tự do') : slot ? i18n.t('Tự chọn') : c.code}</span>
                    {moved && <span className="bead-moved" title={i18n.t('Đã chuyển, chưa giải')}>•</span>}
                    {pinnedAt.get(c.code) === semester && !moved && <LuPin size={11} className="bead-pin" />}
                </span>
                <span className="bead-name">
                    {free ? i18n.t('{{credits}} TC · gõ mã môn bất kỳ', { credits: c.credits }) : slot ? i18n.t('{{block}} · {{credits}} TC', { block: c.block, credits: c.credits }) : courseName(c.code)}
                </span>
            </button>
        );
    };

    /** Expanded section under the semester's beads: facts + actions of one course. Several can be open. */
    const detail = (key: string, c: PlanCourse, semester: string, moved: boolean) => {
        const free = c.reason === 'free_elective';
        const title = free ? i18n.t('Ô tự chọn tự do') : isBlockSlot(c) ? (c.block ?? '') : `${c.code} · ${courseName(c.code)}`;
        return (
            <section key={`detail-${key}`} className="bead-detail" data-moving={selected === key} aria-label={title}>
                <header className="bead-detail-head">
                    <Bead state="suggest" />
                    <span className="bead-detail-title">{title}</span>
                    <Button size="small" type="text" icon={<LuX />} aria-label={i18n.t('Thu gọn')} onClick={() => toggleExpanded(key)} />
                </header>
                {details(c, semester, moved)}
                {actions(key, c, semester)}
            </section>
        );
    };

    const failedBead = (c: PlanCourse, semester: string) => (
        <div key={`fail-${c.code}`} className="bead" data-failed="true" title={i18n.t('Lần học này giả định rớt, học lại ở kỳ sau')}>
            <span className="bead-head">
                <Bead state="failed" />
                <span className="bead-code"><s>{c.code}</s></span>
                <Button size="small" type="text" icon={<LuUndo2 />} aria-label={i18n.t('Bỏ giả định rớt {{code}}', { code: c.code })}
                    onClick={() => toggleFail(c.code, semester)} />
            </span>
            <span className="bead-name bead-name-err">{i18n.t('Rớt (giả định)')}</span>
        </div>
    );

    const warningLine = (w: PlanWarningItem): ReactNode => (
        <div key={w.text} className="sem-warning">
            <span>{w.course ? `${w.course}: ` : ''}{w.message}{w.rule ? ` (${w.rule})` : ''}</span>
            {w.confirm && (
                <Button size="small" onClick={() => onConfirm(w)}>{w.confirm === 'offered' ? i18n.t('Kỳ này có mở') : i18n.t('Mình đạt rồi')}</Button>
            )}
        </div>
    );

    const loadOf = (code: string) => [...cards.values()].filter(c => c.semester === code).reduce((sum, c) => sum + c.course.credits, 0)
        + failedCards.filter(f => f.semester === code).reduce((sum, f) => sum + f.course.credits, 0);
    const hasCourses = (code: string) => [...cards.values()].some(c => c.semester === code) || failedCards.some(f => f.semester === code);
    // Graduation = the last semester that still holds a course (follows unsolved moves too).
    const grad = [...semesters].reverse().find(hasCourses) ?? null;
    // Accumulated credits after each semester: already earned (required total minus everything still planned) + plan so far.
    const cumulative = new Map<string, number>();
    semesters.reduce((sum, code) => {
        const next = sum + loadOf(code);
        cumulative.set(code, next);
        return next;
    }, 0);
    const base = totalCredits ? Math.max(0, totalCredits - (cumulative.get(semesters[semesters.length - 1]) ?? 0)) : 0;
    // Empty semesters after graduation fold away, unless a course is being moved (they are move targets) or has a target.
    const moving = Boolean(movable || dragging);
    const isEmptyAfter = (code: string) => grad !== null && code > grad && !hasCourses(code) && scenario.targets[code] == null;
    const visible = semesters.filter(code => moving || !isEmptyAfter(code));
    const hiddenAfter = semesters.filter(code => !moving && isEmptyAfter(code));

    return (
        <div>
            {pending.length > 0 && <p className="sem-tray">{i18n.t('✦ Chờ xếp khi bấm Giải:')}{' '}{pending.join(', ')}</p>}
            <div className="sem-timeline">
                {past && (
                    <div className="sem-row" data-fold="true" data-past="true" data-above="fade" data-below={visible.length ? 'plan' : 'none'}>
                        <span className="sem-gutter"><span className="sem-mark"><Bead state="completed" /></span></span>
                        <span className="sem-code-fold">{past.from} – {past.current}</span>
                        <div className="sem-past">
                            <span className="hint">
                                {i18n.t('Đã qua {{count}} kỳ · đang ở {{current}}', { count: past.count, current: past.current })}
                                {totalCredits ? <>{i18n.t(' · tích lũy')}{' '}<b>{base}</b>/{totalCredits}{' '}{i18n.t('TC')}</> : null}
                            </span>
                            {totalCredits ? <span className="sem-mini"><i style={{ width: `${Math.min(100, (base / totalCredits) * 100)}%` }} /></span> : null}
                        </div>
                    </div>
                )}
                {visible.map((code, index) => {
                    const summer = isSummer(code);
                    const off = summer ? !scenario.summers.includes(code) : scenario.skipped.includes(code);
                    const list = [...cards.entries()].filter(([, c]) => c.semester === code);
                    const failedHere = failedCards.filter(f => f.semester === code);
                    const load = loadOf(code);
                    const afterGrad = grad !== null && code > grad;
                    const above: Segment = afterGrad ? 'none' : index > 0 || past ? 'plan' : 'none';
                    const below: Segment = grad !== null && code < grad ? 'plan' : 'none';
                    const total = totalCredits && !afterGrad ? base + (cumulative.get(code) ?? 0) : null;
                    const target = scenario.targets[code];
                    const hint = hintFor(code);
                    const okHint = hint && 'ok' in hint ? hint : null;
                    const block = hint && 'block' in hint ? hint.block : null;
                    const blocked = scenario.notOffered.filter(n => n.semester_code === code);
                    // Semester warnings, and course warnings that need a confirmation (e.g. "Kỳ này có mở"), on the row.
                    const notes = [...warningsOf(undefined, code), ...warnings.filter(w => w.semester === code && w.course && w.confirm)];
                    const rowDrop = {
                        onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(code); },
                        onDragLeave: () => setOver(o => (o === code ? null : o)),
                        onDrop: (e: DragEvent) => drop(e, code),
                    };
                    if (off && list.length === 0 && failedHere.length === 0) {
                        // M5: a switched-off semester folds into one thin line.
                        return (
                            <div key={code} {...rowDrop} className="sem-row" data-fold="true" data-blocked={Boolean(block)} data-above={above} data-below={below}>
                                <span className="sem-gutter"><span className="sem-mark"><Bead state="not-started" tone="sparkle" size={7} /></span></span>
                                <span className="sem-code-fold">{code}{summer ? i18n.t(' · hè') : ''}</span>
                                <Checkbox checked={!summer} onChange={e => toggleOff(code, e.target.checked)}>
                                    <span className="hint">{summer ? i18n.t('Học hè kỳ này') : i18n.t('Đang nghỉ kỳ này')}</span>
                                </Checkbox>
                            </div>
                        );
                    }
                    const isGrad = code === grad;
                    const next = code === firstActive && !isGrad;
                    return (
                        <div key={code} {...rowDrop} className="sem-row" data-ok={Boolean(okHint || over === code)} data-blocked={Boolean(block)}
                            data-above={above} data-below={below} data-grad={isGrad || undefined}>
                            {/* Brand accent place #3: the next semester's sparkle ("where you are going"). */}
                            <span className="sem-gutter"><span className="sem-mark">
                                {afterGrad ? <Bead state="not-started" tone="sparkle" size={7} />
                                    : <SparkleMark variant={isGrad ? 'grad' : next ? 'next' : 'future'} />}
                            </span></span>
                            <div className="sem-head">
                                <div className="sem-title">
                                    <span className="sem-code">{code}</span>
                                    {summer && <Tag color="orange">{i18n.t('Hè')}</Tag>}
                                    <span className="hint">{load}{target != null ? ` / ${target}` : ''}{' '}{i18n.t('TC')}</span>
                                </div>
                                {next && <span className="sem-next">{i18n.t('Kỳ tới')}</span>}
                                {isGrad && <span className="sem-grad">{i18n.t('Ra trường')}</span>}
                                {total !== null && <span className="sem-total">→ <b>{total}</b>/{totalCredits}{' '}{i18n.t('TC')}</span>}
                                <div className="sem-controls">
                                    <Checkbox checked={summer ? !off : off} onChange={e => toggleOff(code, e.target.checked)}>
                                        <span className="hint">{summer ? i18n.t('học hè') : i18n.t('nghỉ')}</span>
                                    </Checkbox>
                                    <span className="sem-target">
                                        <span className="hint">{i18n.t('muốn')}</span>
                                        <InputNumber size="small" variant="borderless" className="sem-target-input"
                                            min={1} max={30} placeholder="—" value={target ?? null} aria-label={i18n.t('Số TC muốn ở {{code}}', { code: code })}
                                            onChange={v => setTarget(code, v == null ? null : Number(v))} />
                                        <span className="hint">{i18n.t('TC')}</span>
                                    </span>
                                </div>
                            </div>
                            <div className="sem-lane">
                                {(notes.length > 0 || blocked.length > 0) && (
                                    <div className="sem-notes">
                                        {notes.map(warningLine)}
                                        {blocked.length > 0 && (
                                            <div>
                                                {blocked.map(n => (
                                                    <Tag key={n.course_code} closable icon={<LuCalendarX />}
                                                        onClose={() => set({ notOffered: scenario.notOffered.filter(x => x !== n) }, i18n.t('{{course_code}} mở lại ở {{code}}', { course_code: n.course_code, code: code }))}>
                                                        {n.course_code}{' '}{i18n.t('không mở')}
                                                    </Tag>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {failedHere.map(f => failedBead(f.course, code))}
                                {list.map(([key, c]) => bead(key, c.course, code, c.moved))}
                                {list.length === 0 && failedHere.length === 0 && <span className="hint">{i18n.t('Chưa có môn')}</span>}
                                {okHint && (
                                    <span className="sem-move">
                                        <IOutLinedBtn size="small" onClick={() => move(code)}>{i18n.t('Chuyển vào đây')}</IOutLinedBtn>
                                        {okHint.soft && <span className="sem-soft">{okHint.soft}</span>}
                                    </span>
                                )}
                                {block && <span className="sem-why">{block}</span>}
                                {expanded.map(key => {
                                    const card = cards.get(key);
                                    return card && card.semester === code ? detail(key, card.course, code, card.moved) : null;
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
            {hiddenAfter.length > 0 && (
                <p className="sem-after">
                    {i18n.t('Sau kỳ ra trường: {{codes}} — không có môn, đã ẩn', { codes: hiddenAfter.join(', ') })}
                </p>
            )}
            <p className="hint sem-legend">
                {i18n.t('Bấm vào môn để mở chi tiết ngay bên dưới (mở được nhiều môn cùng lúc). Chuyển kỳ…: hàng sáng lên là chuyển vào được, hàng mờ là không; cũng có thể kéo thả. Dấu • cạnh mã: đã chuyển, chưa giải. Trang chỉ kiểm nhanh; bấm Giải để bộ giải kiểm đầy đủ.')}
            </p>
        </div>
    );
};

export default SemesterBoard;
