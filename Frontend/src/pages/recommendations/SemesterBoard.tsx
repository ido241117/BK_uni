import { type DragEvent, useState } from 'react';
import { Button, Card, Empty, InputNumber, Modal, Popover, Select, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import { LuCalendarX, LuLock, LuPin, LuPinOff, LuSettings2, LuTriangleAlert } from 'react-icons/lu';
import type { CourseAtSemester, PlanCourse, PlanResult, PlanWarningItem } from '@/types';
import { semesterLabel } from '@/pages/courses/analysis/semester';

const { Text } = Typography;

/**
 * Sprint 11 (T45, 22/11): bảng các kỳ của lộ trình. Mọi thứ sinh viên chỉnh ở đây là yêu cầu bộ giải phải theo:
 * - ghim môn vào kỳ (kéo thẻ sang kỳ khác, chọn "Chuyển tới", hoặc bấm ghim) → `locked` (ghim tuyệt đối);
 * - ô khối: chọn môn trong khối → ghim môn đó vào kỳ của ô;
 * - từng kỳ: số TC muốn (ô ngay đầu kỳ), nghỉ kỳ (kỳ chính) / học hè (kỳ hè), khóa kỳ (không xếp thêm);
 * - môn không mở ở kỳ (nút trên thẻ môn, hỏi xác nhận; chip ở đầu kỳ, bấm × để bỏ) → `not_offered`;
 * - cảnh báo gắn vào đúng môn / kỳ; cảnh báo chỉ là nhắc thì sinh viên tự xác nhận được (22/11).
 * Giao diện giữ design system hiện tại (người duyệt: làm chức năng trước, tỉa giao diện sau).
 */
export interface BoardSettings {
    locked: CourseAtSemester[];
    skipped: string[];
    frozen: string[];
    summers: string[];
    targets: Record<string, number>;
    notOffered: CourseAtSemester[];
}

/** Lựa chọn trong ô khối: nhóm theo khối con (chuyên ngành) nếu có. */
export interface BlockChoice {
    group: string;
    options: { value: string; label: string; credits: number }[];
}

interface Props {
    result: PlanResult;
    semesters: string[];
    settings: BoardSettings;
    onChange: (next: BoardSettings, message: string) => void;
    courseName: (code: string) => string;
    blockChoices: Map<string, BlockChoice[]>;
    /** Mã môn đã đạt và tiên quyết từng môn: để làm mờ môn chưa đủ tiên quyết trong ô khối. */
    passed: Set<string>;
    prerequisites: Map<string, string[]>;
    /** Cảnh báo có cấu trúc của bộ giải (`warning_items`). */
    warnings: PlanWarningItem[];
    /** Sinh viên tự xác nhận điều kiện (vd đã đạt chuẩn tiếng Anh). */
    onConfirm: (item: PlanWarningItem) => void;
}

const isSummer = (code: string) => code.endsWith('3');

const SemesterSettings = ({ code, settings, onChange }: { code: string; settings: BoardSettings; onChange: Props['onChange'] }) => {
    const summer = isSummer(code);
    const off = summer ? !settings.summers.includes(code) : settings.skipped.includes(code);
    const set = (patch: Partial<BoardSettings>, message: string) => onChange({ ...settings, ...patch }, message);
    return (
        <Space orientation="vertical" style={{ width: 240 }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>{summer ? 'Học hè kỳ này' : 'Nghỉ kỳ này'}</Text>
                <Switch
                    size="small"
                    checked={summer ? !off : off}
                    onChange={v => (summer
                        ? set({ summers: v ? [...settings.summers, code] : settings.summers.filter(s => s !== code) },
                            v ? `Học hè ${code}` : `Không học hè ${code}`)
                        : set({ skipped: v ? [...settings.skipped, code] : settings.skipped.filter(s => s !== code) },
                            v ? `Nghỉ ${code}` : `Học lại ${code}`))}
                />
            </Space>
            {!off && (
                <>
                    <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                        <Tooltip title="Giữ đúng các môn đã ghim ở kỳ này, bộ giải không xếp thêm"><Text>Khóa kỳ</Text></Tooltip>
                        <Switch
                            size="small" checked={settings.frozen.includes(code)}
                            onChange={v => set({ frozen: v ? [...settings.frozen, code] : settings.frozen.filter(s => s !== code) },
                                v ? `Khóa ${code}` : `Mở khóa ${code}`)}
                        />
                    </Space>
                </>
            )}
        </Space>
    );
};

const SemesterBoard = ({
    result, semesters, settings, onChange, courseName, blockChoices, passed, prerequisites, warnings, onConfirm,
}: Props) => {
    const [dragging, setDragging] = useState<string | null>(null);
    const [over, setOver] = useState<string | null>(null);
    const bySemester = new Map(result.semesters.map(s => [s.semester_code, s]));
    const planned = new Map(result.semesters.flatMap(s => s.courses.map(c => [c.code, s.semester_code] as const)));
    const pinnedAt = new Map(settings.locked.map(l => [l.course_code, l.semester_code]));
    const firstActive = semesters.find(code => (isSummer(code) ? settings.summers.includes(code) : !settings.skipped.includes(code)));
    const semesterOptions = semesters.map(code => ({ value: code, label: semesterLabel(code) }));

    const pin = (code: string, semester: string, message: string) => onChange({
        ...settings, locked: [...settings.locked.filter(l => l.course_code !== code), { course_code: code, semester_code: semester }],
    }, message);
    const unpin = (code: string) => onChange({ ...settings, locked: settings.locked.filter(l => l.course_code !== code) }, `Bỏ ghim ${code}`);

    const markNotOffered = (code: string, semester: string) => Modal.confirm({
        title: `${code} không mở ở ${semesterLabel(semester)}?`,
        content: 'Bộ giải sẽ xếp môn này sang kỳ khác.',
        okText: 'Đúng vậy', cancelText: 'Hủy',
        onOk: () => onChange({
            ...settings,
            locked: settings.locked.filter(l => !(l.course_code === code && l.semester_code === semester)),
            notOffered: [...settings.notOffered.filter(n => !(n.course_code === code && n.semester_code === semester)),
                { course_code: code, semester_code: semester }],
        }, `${code} không mở ở ${semester}`),
    });
    const setTarget = (code: string, v: number | null) => {
        const targets = { ...settings.targets };
        if (v == null) delete targets[code]; else targets[code] = v;
        onChange({ ...settings, targets }, v == null ? `Bỏ số TC muốn ở ${code}` : `Muốn ${v} TC ở ${code}`);
    };
    const warningsOf = (course: string | undefined, semester: string) => warnings
        .filter(w => w.semester === semester && (course ? w.course === course : !w.course));
    const warningTag = (items: PlanWarningItem[]) => items.length > 0 && (
        <Popover
            trigger="click"
            content={(
                <Space orientation="vertical" style={{ maxWidth: 260 }}>
                    {items.map(w => (
                        <Space key={w.text} orientation="vertical" size={4}>
                            <Text>{w.message}</Text>
                            {w.confirm && <Button size="small" onClick={() => onConfirm(w)}>Mình đạt rồi</Button>}
                        </Space>
                    ))}
                </Space>
            )}
        >
            <Tag color="warning" icon={<LuTriangleAlert />} style={{ cursor: 'pointer' }}>Lưu ý</Tag>
        </Popover>
    );

    const missingPrereqs = (code: string, semester: string) => (prerequisites.get(code) ?? [])
        .filter(p => !passed.has(p) && !((planned.get(p) ?? '999') < semester));

    const drop = (event: DragEvent, semester: string) => {
        event.preventDefault();
        setOver(null);
        const code = event.dataTransfer.getData('text/plain') || dragging;
        setDragging(null);
        if (code) pin(code, semester, `Ghim ${code} vào ${semester}`);
    };

    const courseRow = (c: PlanCourse, semester: string) => {
        const pinned = pinnedAt.get(c.code) === semester;
        const choices = c.slot && c.block ? blockChoices.get(c.block) : undefined;
        return (
            <div
                key={c.code}
                draggable
                onDragStart={e => { e.dataTransfer.setData('text/plain', c.code); setDragging(c.code); }}
                onDragEnd={() => setDragging(null)}
                style={{ border: '1px solid var(--border-soft)', borderRadius: 8, padding: '6px 8px', cursor: 'grab',
                    borderLeft: pinned ? '3px solid var(--brand)' : undefined, background: 'var(--bg-surface)' }}
            >
                <Space style={{ justifyContent: 'space-between', width: '100%' }} align="start">
                    <div style={{ minWidth: 0 }}>
                        {choices ? (
                            <>
                                <Text type="secondary" style={{ fontSize: 12 }}>{c.block} · {c.credits} TC</Text>
                                <Select<string>
                                    size="small" showSearch style={{ width: '100%', marginTop: 4 }} placeholder="Chọn môn trong khối"
                                    value={undefined}
                                    optionFilterProp="label"
                                    options={choices.map(g => ({
                                        label: g.group,
                                        options: g.options.map(o => {
                                            const missing = missingPrereqs(o.value, semester);
                                            return { value: o.value, label: missing.length ? `${o.label} (cần ${missing.join(', ')} trước)` : o.label,
                                                disabled: missing.length > 0 };
                                        }),
                                    }))}
                                    onChange={code => pin(code, semester, `Chọn ${code} cho ${semester}`)}
                                />
                                <Text type="secondary" style={{ fontSize: 11 }}>Bộ giải tạm xếp {c.code}</Text>
                            </>
                        ) : (
                            <>
                                <Text type="secondary" style={{ fontSize: 12 }}>{c.reason === 'free_elective' ? 'Tự chọn tự do' : c.code}</Text>
                                <div>{c.reason === 'free_elective' ? 'Một môn tự chọn tự do bất kỳ' : courseName(c.code)}</div>
                            </>
                        )}
                        <Space size={4} wrap style={{ marginTop: 2 }}>
                            {warningTag(warningsOf(c.code, semester))}
                            {passed.has(c.code) && <Tag color="purple">học cải thiện</Tag>}
                        </Space>
                    </div>
                    <Space orientation="vertical" size={2} align="end">
                        <Tag style={{ marginInlineEnd: 0 }}>{c.credits} TC</Tag>
                        {c.reason !== 'free_elective' && (
                            <Space size={0}>
                                <Tooltip title="Không mở kỳ này">
                                    <Button size="small" type="text" icon={<LuCalendarX />} aria-label={`${c.code} không mở kỳ này`}
                                        onClick={() => markNotOffered(c.code, semester)} />
                                </Tooltip>
                                <Tooltip title={pinned ? 'Bỏ ghim' : 'Ghim vào kỳ này'}>
                                    <Button size="small" type="text" icon={pinned ? <LuPinOff /> : <LuPin />}
                                        onClick={() => (pinned ? unpin(c.code) : pin(c.code, semester, `Ghim ${c.code} vào ${semester}`))} />
                                </Tooltip>
                            </Space>
                        )}
                    </Space>
                </Space>
                {c.reason !== 'free_elective' && (
                    <Select<string>
                        size="small" variant="borderless" style={{ width: '100%', fontSize: 12 }} placeholder="Chuyển tới kỳ…"
                        value={undefined} options={semesterOptions.filter(o => o.value !== semester)}
                        onChange={to => pin(c.code, to, `Ghim ${c.code} vào ${to}`)}
                    />
                )}
            </div>
        );
    };

    return (
        <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {semesters.map(code => {
                    const summer = isSummer(code);
                    const off = summer ? !settings.summers.includes(code) : settings.skipped.includes(code);
                    const semester = bySemester.get(code);
                    const target = settings.targets[code];
                    return (
                        <Card
                            key={code}
                            size="small"
                            style={{ width: 280, flex: '0 0 280px', outline: over === code ? '2px solid var(--brand)' : undefined,
                                opacity: off ? 0.75 : 1 }}
                            title={(
                                <Space size={6} wrap>
                                    <Text strong>{semesterLabel(code)}</Text>
                                    {summer && <Tag color="orange">Hè</Tag>}
                                    {code === firstActive && <Tag color="magenta">Kỳ tới</Tag>}
                                    {settings.frozen.includes(code) && <Tooltip title="Kỳ đã khóa"><LuLock /></Tooltip>}
                                </Space>
                            )}
                            extra={(
                                <Space size={4}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>{semester?.credits ?? 0} /</Text>
                                    <Tooltip title="Số tín chỉ bạn muốn học kỳ này (để trống: tự xếp)">
                                        <InputNumber
                                            size="small" style={{ width: 64 }} min={1} max={summer ? 12 : 25} placeholder="TC"
                                            value={target ?? null} disabled={off} aria-label={`Số TC muốn ở ${code}`}
                                            onChange={v => setTarget(code, v == null ? null : Number(v))}
                                        />
                                    </Tooltip>
                                    <Popover trigger="click" placement="bottomRight"
                                        content={<SemesterSettings code={code} settings={settings} onChange={onChange} />}>
                                        <Button size="small" type="text" icon={<LuSettings2 />} aria-label={`Cài đặt ${code}`} />
                                    </Popover>
                                </Space>
                            )}
                            onDragOver={e => { e.preventDefault(); setOver(code); }}
                            onDragLeave={() => setOver(o => (o === code ? null : o))}
                            onDrop={e => drop(e, code)}
                        >
                            {(() => {
                                const blocked = settings.notOffered.filter(n => n.semester_code === code);
                                const semWarnings = warningsOf(undefined, code);
                                return (blocked.length > 0 || semWarnings.length > 0) && (
                                    <Space size={4} wrap style={{ marginBottom: 8 }}>
                                        {blocked.map(n => (
                                            <Tag key={n.course_code} closable icon={<LuCalendarX />}
                                                onClose={() => onChange({ ...settings, notOffered: settings.notOffered.filter(x => x !== n) },
                                                    `${n.course_code} mở lại ở ${code}`)}>
                                                {n.course_code} không mở
                                            </Tag>
                                        ))}
                                        {warningTag(semWarnings)}
                                    </Space>
                                );
                            })()}
                            {off
                                ? <Text type="secondary">{summer ? 'Không học hè (bật trong ⚙ để học)' : 'Nghỉ kỳ này'}</Text>
                                : semester?.courses.length
                                    ? <Space orientation="vertical" style={{ width: '100%' }}>{semester.courses.map(c => courseRow(c, code))}</Space>
                                    : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Kéo môn vào đây" />}
                        </Card>
                    );
                })}
            </div>
        </div>
    );
};

export default SemesterBoard;
