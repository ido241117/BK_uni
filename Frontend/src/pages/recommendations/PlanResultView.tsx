import { Card, Collapse, Empty, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { LuCircleCheck, LuCircleX, LuLock } from 'react-icons/lu';
import { IOutLinedBtn, StatusLine } from '@/components';
import type { ReactNode } from 'react';
import type { PlanCourse, PlanCourseReason, PlanFix, PlanRequest, PlanResult } from '@/types';
import { semesterLabel } from '@/utils/semester';
import EngineReportCard from './EngineReportCard';
import i18n from '@/i18n';
import { trLive } from '@/i18n/live';

const { Text } = Typography;

const REASON: Record<PlanCourseReason, { label: string; color: string }> = trLive({
    required: { label: 'Bắt buộc', color: 'blue' },
    elective: { label: 'Tự chọn', color: 'purple' },
    wanted: { label: 'Bạn muốn học', color: 'gold' },
    retake: { label: 'Học lại', color: 'red' },
    free_elective: { label: 'Ô tự chọn tự do', color: 'cyan' },
});

const PREFERENCE_LABEL: Record<string, string> = trLive({
    S1: 'Học xong sớm nhất',
    S6: 'Giữ khuyến nghị học trước',
    S4: 'Môn bạn muốn học',
    S9: 'Kỳ hè ưu tiên môn đại cương, cơ sở ngành',
    S7: 'Kỳ hè có học thì 6–9 TC',
    S2: 'Không học thừa tín chỉ',
    S11: 'Kỳ chính đủ 11 TC (không học thừa để đủ)',
    S8: 'Kỳ chính 15–18 TC',
    S5: 'Các kỳ đều tải',
    S3: 'Ít đổi so với lộ trình trước',
    S10: 'Ưu tiên kỳ chính hơn kỳ hè',
});

const STATUS_ALERT: Record<string, { type: 'success' | 'info' | 'warning' | 'error'; title: string }> = trLive({
    OPTIMAL: { type: 'success', title: 'Đã tìm được lộ trình tốt nhất theo các lựa chọn của bạn' },
    SAT_NOT_PROVEN_OPTIMAL: { type: 'info', title: 'Đã có lộ trình hợp lệ, nhưng có thể còn lộ trình tốt hơn (hết thời gian trước khi chứng minh)' },
    UNSAT: { type: 'error', title: 'Không có lộ trình với các lựa chọn hiện tại' },
    TIMEOUT: { type: 'warning', title: 'Hết thời gian mà chưa tìm được lộ trình. Thử lại hoặc chọn bộ giải CP-SAT' },
    INPUT_ERROR: { type: 'error', title: 'Dữ liệu chưa hợp lệ' },
});

interface PlanResultViewProps {
    result: PlanResult;
    courseName: (code: string) => string;
    /** Kết quả lần giải trước: dải số đầu trang so với nó để sinh viên thấy thay đổi vừa rồi kéo theo gì. */
    previous?: PlanResult | null;
    recommendationsFirst: boolean;
    onPreferRecommendations?: () => void;
    /** Giai đoạn 12 (M1): có sửa chưa giải → dải chỉ số mờ đi. */
    stale?: boolean;
    /** M11: áp dụng một cách gỡ khi không giải được (trang tự giải lại). */
    onApplyFix?: (fix: PlanFix) => void;
    /** Sprint 11: bảng các kỳ (kéo thả, ghim, cài đặt từng kỳ) thay cho danh sách kỳ chỉ đọc. */
    board?: ReactNode;
    /** The solver is running: the status says so and the previous result stays below, dimmed. */
    solving?: boolean;
    /** Edits since this result (status line "Đã sửa N chỗ, chưa kiểm", feedback.html). */
    dirty?: number;
    lastChange?: string | null;
}

/** Bảng `requests` (sprint 11): mỗi yêu cầu của sinh viên được đáp ứng tới đâu, không im lặng bỏ yêu cầu nào. */
const REQUEST_STATUS: Record<PlanRequest['status'], { color: string; label: string }> = trLive({
    met: { color: 'green', label: 'Đáp ứng' },
    warning: { color: 'gold', label: 'Giữ, nhưng trái luật' },
    partial: { color: 'orange', label: 'Một phần' },
    unmet: { color: 'red', label: 'Chưa đáp ứng' },
});
const REQUEST_KIND: Record<PlanRequest['kind'], string> = trLive({
    pin: 'Ghim', target: 'Số TC muốn', skip: 'Nghỉ kỳ', frozen: 'Khóa kỳ', wanted: 'Môn muốn học',
    graduate_by: 'Hạn tốt nghiệp', not_offered: 'Môn không mở', assumed_fail: 'Giả định rớt', offered: 'Báo có mở',
});
const RequestsCard = ({ requests }: { requests: PlanRequest[] }) => (
    <Card size="small" title={i18n.t('Yêu cầu của bạn')}>
        <Space orientation="vertical" style={{ width: '100%' }} size={6}>
            {requests.map((r, i) => (
                <Space key={`${r.kind}-${r.item}-${i}`} align="start" wrap>
                    <Tag color={REQUEST_STATUS[r.status].color}>{REQUEST_STATUS[r.status].label}</Tag>
                    <Text strong>{REQUEST_KIND[r.kind]} {r.item}</Text>
                    <Text type="secondary">{r.detail}</Text>
                </Space>
            ))}
        </Space>
    </Card>
);

/** Mẫu 1 (23/11): ba con số chính của lộ trình. Kỳ hè có mã tận cùng bằng 3. */
const summarize = (r: PlanResult) => {
    const isSummer = (code: string) => code.endsWith('3');
    const main = r.semesters.filter(s => !isSummer(s.semester_code)).map(s => s.credits);
    return {
        graduation: r.graduation_semester ?? null,
        heaviest: main.length ? Math.max(...main) : 0,
        summer: r.semesters.filter(s => isSummer(s.semester_code)).reduce((sum, s) => sum + s.credits, 0),
        total: r.semesters.reduce((sum, s) => sum + s.credits, 0),
    };
};

/** Nhãn thay đổi: xanh = tốt hơn, cam = tệ hơn (phân biệt cả độ sáng, không chỉ màu). */
/** Change versus the previous result: sage when better, terracotta when worse (data-display.html `.delta-pill`). */
const Delta = ({ text, good }: { text: string; good: boolean }) => (
    <span className="delta-pill" data-good={good}>{text}</span>
);

const signed = (n: number) => i18n.t('{{v0}}{{n}} TC', { v0: n > 0 ? '+' : '', n: n });

const KpiStrip = ({ result, previous, stale }: { result: PlanResult; previous?: PlanResult | null; stale?: boolean }) => {
    const now = summarize(result);
    const before = previous && previous.semesters.length > 0 ? summarize(previous) : null;
    const gradChanged = before && before.graduation && now.graduation && before.graduation !== now.graduation;
    const gradCode = now.graduation ? i18n.t('HK {{code}}', { code: now.graduation }) : '—';
    const items = [
        {
            label: i18n.t('Ra trường'),
            value: gradCode,
            // The rest of "HK 271 (kỳ 1 2027-2028)" goes in the small unit next to the serif count.
            unit: now.graduation ? semesterLabel(now.graduation).slice(gradCode.length).trim() : '',
            delta: gradChanged
                ? <Delta text={i18n.t('trước: {{graduation}}', { graduation: before!.graduation })} good={now.graduation! < before!.graduation!} />
                : null,
        },
        {
            label: i18n.t('Kỳ chính nặng nhất'),
            value: String(now.heaviest),
            unit: i18n.t('TC'),
            delta: before && before.heaviest !== now.heaviest
                ? <Delta text={signed(now.heaviest - before.heaviest)} good={now.heaviest < before.heaviest} />
                : null,
        },
        {
            label: i18n.t('Học hè'),
            value: String(now.summer),
            unit: i18n.t('TC'),
            delta: before && before.summer !== now.summer
                ? <Delta text={signed(now.summer - before.summer)} good={now.summer < before.summer} />
                : null,
        },
    ];
    /* Template info panel (tien-do-hoc-tap-page.html): small uppercase label, serif count with a small unit. */
    return (
        <div className="kpi-strip" data-stale={stale || undefined}>
            <div className="kpi-grid">
                {items.map(k => (
                    <div key={k.label} className="kpi-cell">
                        <div className="kpi-label">{k.label}</div>
                        <div className="kpi-value">
                            <span className="kpi-count">{k.value}</span>
                            {k.unit && <span className="kpi-unit">{k.unit}</span>}
                            {k.delta}
                        </div>
                    </div>
                ))}
            </div>
            <Text type="secondary" className="kpi-note">
                {i18n.t('Còn')}{' '}{now.total}{' '}{i18n.t('TC phải học. Nhãn màu so với lần giải ngay trước.')}{stale ? i18n.t(' Đã sửa sau lần giải này: bấm Giải để cập nhật.') : ''}
            </Text>
        </div>
    );
};

const PlanResultView = ({
    result, courseName, previous, recommendationsFirst, onPreferRecommendations, stale, onApplyFix, board, solving, dirty = 0, lastChange,
}: PlanResultViewProps) => {
    const alert = STATUS_ALERT[result.status] ?? STATUS_ALERT.INPUT_ERROR;
    const s6 = result.preferences_report?.find(p => p.id === 'S6');
    const fixes = result.status === 'UNSAT' ? result.infeasible_fixes ?? [] : [];

    const warningsList = result.warnings ?? [];
    /** One status between the KPI strip and the board, in this order: solving > edited > error > warnings > ok. */
    const planStatus = () => {
        if (solving) {
            return (
                <StatusLine tone="loading" detail={i18n.t('Bộ giải có thể chạy vài chục giây. Bên dưới vẫn là lần giải trước.')}>
                    {i18n.t('Đang giải…')}
                </StatusLine>
            );
        }
        if (stale) {
            return (
                <StatusLine tone="rose" detail={(
                    <>
                        {i18n.t('Bấm Giải để kiểm và xếp lại phần còn lại. Môn bạn chuyển được giữ nguyên (ghim).')}
                        {lastChange && <div>{i18n.t('Gần nhất: {{lastChange}}', { lastChange: lastChange })}</div>}
                    </>
                )}>
                    {i18n.t('Đã sửa {{dirty}} chỗ, chưa kiểm.', { dirty: Math.max(dirty, 1) })}
                </StatusLine>
            );
        }
        if (result.violations.length > 0) {
            return (
                <StatusLine tone="err" detail={<ul>{result.violations.map(v => <li key={v}>{v}</li>)}</ul>}>
                    {i18n.t('Bộ giải có lỗi: lộ trình vi phạm ràng buộc. Đừng dùng lộ trình này')}
                </StatusLine>
            );
        }
        if (result.status === 'UNSAT' || result.status === 'INPUT_ERROR') {
            return (
                <StatusLine tone="err" detail={(
                    <ul>
                        <li>{result.status === 'UNSAT' ? result.infeasible_reason : result.error}</li>
                        {fixes.length > 0 && onApplyFix && (
                            <li>
                                <Text strong style={{ fontSize: 12 }}>{i18n.t('Cách gỡ:')}</Text>
                                {fixes.map(f => <IOutLinedBtn key={f.label} size="small" onClick={() => onApplyFix(f)}>{f.label}</IOutLinedBtn>)}
                            </li>
                        )}
                    </ul>
                )}>
                    {alert.title}
                </StatusLine>
            );
        }
        if (warningsList.length > 0 || alert.type === 'warning') {
            return (
                <StatusLine tone="warn" detail={warningsList.length > 0 ? <ul>{warningsList.map(w => <li key={w}>{w}</li>)}</ul> : undefined}>
                    {warningsList.length > 0
                        ? i18n.t('Giải được, có {{count}} cảnh báo', { count: warningsList.length })
                        : alert.title}
                </StatusLine>
            );
        }
        return <StatusLine tone={alert.type === 'success' ? 'good' : 'info'}>{alert.title}</StatusLine>;
    };

    return (
        <div className="stack">
            {result.semesters.length > 0 && <KpiStrip result={result} previous={previous} stale={stale} />}

            {planStatus()}

            {(result.requests?.length ?? 0) > 0 && <RequestsCard requests={result.requests!} />}

            {result.engine_report && <EngineReportCard report={result.engine_report} courseName={courseName} />}

            {board ?? result.semesters.map(semester => (
                <Card
                    key={semester.semester_code}
                    size="small"
                    title={(
                        <Space>
                            <Text strong>{semesterLabel(semester.semester_code)}</Text>
                            {semester.semester_code.endsWith('3') && <Tag color="orange">{i18n.t('Kỳ hè')}</Tag>}
                        </Space>
                    )}
                    extra={<Tag>{semester.credits}{' '}{i18n.t('TC')}</Tag>}
                >
                    <Table<PlanCourse>
                        size="small"
                        rowKey="code"
                        pagination={false}
                        dataSource={semester.courses}
                        columns={[
                            { title: i18n.t('Mã'), dataIndex: 'code', width: 110 },
                            {
                                title: i18n.t('Môn'),
                                key: 'name',
                                render: (_v, c) => (
                                    <Space>
                                        {c.locked && <Tooltip title={i18n.t('Bạn đã khóa môn vào kỳ này')}><LuLock /></Tooltip>}
                                        <span>{c.reason === 'free_elective' ? i18n.t('Một môn tự chọn tự do bất kỳ') : courseName(c.code)}</span>
                                    </Space>
                                ),
                            },
                            { title: i18n.t('TC'), dataIndex: 'credits', width: 60 },
                            {
                                title: i18n.t('Lý do'),
                                key: 'reason',
                                width: 150,
                                render: (_v, c) => <Tag color={REASON[c.reason]?.color}>{REASON[c.reason]?.label ?? c.reason}</Tag>,
                            },
                        ]}
                    />
                </Card>
            ))}

            {(result.preferences_report?.length ?? 0) > 0 && (
                <Card title={i18n.t('Mong muốn của bạn có được đáp ứng không')}>
                    <Space orientation="vertical" style={{ width: '100%' }}>
                        {result.preferences_report!.map(p => (
                            <Space key={`${p.id}-${p.detail}`} align="start">
                                {p.satisfied
                                    ? <LuCircleCheck color="var(--sem-good)" />
                                    : <LuCircleX color="var(--sem-err)" />}
                                <span>
                                    <Text strong>{PREFERENCE_LABEL[p.id] ?? p.id}</Text>
                                    {!p.satisfied && <Text type="danger">{' '}{i18n.t('· Không đáp ứng được')}</Text>}
                                    <br />
                                    <Text type="secondary">{p.detail}</Text>
                                </span>
                            </Space>
                        ))}
                        {s6 && !s6.satisfied && !recommendationsFirst && onPreferRecommendations && (
                            <IOutLinedBtn onClick={onPreferRecommendations}>
                                {i18n.t('Ưu tiên giữ khuyến nghị (có thể lùi kỳ tốt nghiệp)')}
                            </IOutLinedBtn>
                        )}
                    </Space>
                </Card>
            )}

            <Collapse
                items={[
                    {
                        key: 'assumptions',
                        label: i18n.t('Giả định của lộ trình này'),
                        children: <ul>{(result.assumptions ?? []).map(a => <li key={a}>{a}</li>)}</ul>,
                    },
                    {
                        key: 'data',
                        label: i18n.t('Độ tin cậy của dữ liệu tiên quyết'),
                        children: (
                            <Space orientation="vertical">
                                <Text>
                                    {result.inferred_relations?.length
                                        ? i18n.t('{{length}} quan hệ được suy ra từ chương trình khác (bản chụp {{relations_snapshot}}):', { length: result.inferred_relations.length, relations_snapshot: result.relations_snapshot })
                                        : i18n.t('Không có quan hệ nào phải suy ra từ chương trình khác.')}
                                </Text>
                                {result.inferred_relations?.map(r => (
                                    <Text key={`${r.course_code}-${r.related_course_code}`} type="secondary">
                                        {r.course_code} {r.type === 'prerequisite' ? i18n.t('cần đạt') : i18n.t('song hành với')} {r.related_course_code} ({r.inferred_from})
                                    </Text>
                                ))}
                                <Text type="secondary">
                                    {result.unverified_prerequisites?.length ?? 0}{' '}{i18n.t('môn không có thông tin tiên quyết ở nguồn nào (có thể thật sự không có tiên quyết, hoặc dữ liệu còn thiếu).')}
                                </Text>
                            </Space>
                        ),
                    },
                ]}
            />

            {result.semesters.length === 0 && result.status === 'OPTIMAL' && (
                <Empty description={i18n.t('Bạn không còn môn nào phải học trong chương trình.')} />
            )}
        </div>
    );
};

export default PlanResultView;
