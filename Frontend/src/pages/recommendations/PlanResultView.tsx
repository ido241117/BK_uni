import { Alert, Button, Card, Collapse, Empty, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { LuCircleCheck, LuCircleX, LuLock } from 'react-icons/lu';
import { IOutLinedBtn } from '@/components';
import type { ReactNode } from 'react';
import type { PlanCourse, PlanCourseReason, PlanFix, PlanRequest, PlanResult } from '@/types';
import { semesterLabel } from '@/utils/semester';
import EngineReportCard from './EngineReportCard';

const { Text } = Typography;

const REASON: Record<PlanCourseReason, { label: string; color: string }> = {
    required: { label: 'Bắt buộc', color: 'blue' },
    elective: { label: 'Tự chọn', color: 'purple' },
    wanted: { label: 'Bạn muốn học', color: 'gold' },
    retake: { label: 'Học lại', color: 'red' },
    free_elective: { label: 'Ô tự chọn tự do', color: 'cyan' },
};

const PREFERENCE_LABEL: Record<string, string> = {
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
};

const STATUS_ALERT: Record<string, { type: 'success' | 'info' | 'warning' | 'error'; title: string }> = {
    OPTIMAL: { type: 'success', title: 'Đã tìm được lộ trình tốt nhất theo các lựa chọn của bạn' },
    SAT_NOT_PROVEN_OPTIMAL: { type: 'info', title: 'Đã có lộ trình hợp lệ, nhưng có thể còn lộ trình tốt hơn (hết thời gian trước khi chứng minh)' },
    UNSAT: { type: 'error', title: 'Không có lộ trình với các lựa chọn hiện tại' },
    TIMEOUT: { type: 'warning', title: 'Hết thời gian mà chưa tìm được lộ trình. Thử lại hoặc chọn bộ giải CP-SAT' },
    INPUT_ERROR: { type: 'error', title: 'Dữ liệu chưa hợp lệ' },
};

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
}

/** Bảng `requests` (sprint 11): mỗi yêu cầu của sinh viên được đáp ứng tới đâu, không im lặng bỏ yêu cầu nào. */
const REQUEST_STATUS: Record<PlanRequest['status'], { color: string; label: string }> = {
    met: { color: 'green', label: 'Đáp ứng' },
    warning: { color: 'gold', label: 'Giữ, nhưng trái luật' },
    partial: { color: 'orange', label: 'Một phần' },
    unmet: { color: 'red', label: 'Chưa đáp ứng' },
};
const REQUEST_KIND: Record<PlanRequest['kind'], string> = {
    pin: 'Ghim', target: 'Số TC muốn', skip: 'Nghỉ kỳ', frozen: 'Khóa kỳ', wanted: 'Môn muốn học',
    graduate_by: 'Hạn tốt nghiệp', not_offered: 'Môn không mở', assumed_fail: 'Giả định rớt', offered: 'Báo có mở',
};
const RequestsCard = ({ requests }: { requests: PlanRequest[] }) => (
    <Card size="small" title="Yêu cầu của bạn">
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
const Delta = ({ text, good }: { text: string; good: boolean }) => (
    <span style={{
        fontSize: 13, fontWeight: 600, padding: '2px 10px', borderRadius: 999,
        background: good ? '#EAF1FF' : '#FFF1E6', color: good ? '#1D4ED8' : '#9A3F07',
    }}>{text}</span>
);

const signed = (n: number) => `${n > 0 ? '+' : ''}${n} TC`;

const KpiStrip = ({ result, previous, stale }: { result: PlanResult; previous?: PlanResult | null; stale?: boolean }) => {
    const now = summarize(result);
    const before = previous && previous.semesters.length > 0 ? summarize(previous) : null;
    const gradChanged = before && before.graduation && now.graduation && before.graduation !== now.graduation;
    const items = [
        {
            label: 'Ra trường',
            value: now.graduation ? semesterLabel(now.graduation) : '—',
            delta: gradChanged
                ? <Delta text={`trước: ${before!.graduation}`} good={now.graduation! < before!.graduation!} />
                : null,
        },
        {
            label: 'Kỳ chính nặng nhất',
            value: `${now.heaviest} TC`,
            delta: before && before.heaviest !== now.heaviest
                ? <Delta text={signed(now.heaviest - before.heaviest)} good={now.heaviest < before.heaviest} />
                : null,
        },
        {
            label: 'Học hè',
            value: `${now.summer} TC`,
            delta: before && before.summer !== now.summer
                ? <Delta text={signed(now.summer - before.summer)} good={now.summer < before.summer} />
                : null,
        },
    ];
    return (
        <div style={{ opacity: stale ? 0.45 : 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                {items.map((k, i) => (
                    <div key={k.label} style={{ padding: i ? '2px 20px' : '2px 20px 2px 0', borderLeft: i ? '1px solid var(--border-soft)' : undefined }}>
                        <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em' }}>{k.label}</Text>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                            <span style={{ fontSize: i ? 26 : 32, fontWeight: 700, color: i ? undefined : 'var(--brand)' }}>{k.value}</span>
                            {k.delta}
                        </div>
                    </div>
                ))}
            </div>
            <Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: 13 }}>
                Còn {now.total} TC phải học. Nhãn màu so với lần giải ngay trước.{stale ? ' Đã sửa sau lần giải này: bấm Giải để cập nhật.' : ''}
            </Text>
        </div>
    );
};

const PlanResultView = ({
    result, courseName, previous, recommendationsFirst, onPreferRecommendations, stale, onApplyFix, board,
}: PlanResultViewProps) => {
    const alert = STATUS_ALERT[result.status] ?? STATUS_ALERT.INPUT_ERROR;
    const s6 = result.preferences_report?.find(p => p.id === 'S6');
    const fixes = result.status === 'UNSAT' ? result.infeasible_fixes ?? [] : [];

    return (
        <div className="stack">
            {result.semesters.length > 0 && <KpiStrip result={result} previous={previous} stale={stale} />}

            <Alert
                type={alert.type}
                showIcon
                title={alert.title}
                description={result.status === 'UNSAT'
                    ? (
                        <Space orientation="vertical" size={6}>
                            <span>{result.infeasible_reason}</span>
                            {fixes.length > 0 && onApplyFix && (
                                <Space wrap size={6}>
                                    <Text strong>Cách gỡ:</Text>
                                    {fixes.map(f => <Button key={f.label} size="small" onClick={() => onApplyFix(f)}>{f.label}</Button>)}
                                </Space>
                            )}
                        </Space>
                    )
                    : result.status === 'INPUT_ERROR' ? result.error : undefined}
            />

            {result.violations.length > 0 && (
                <Alert
                    type="error"
                    showIcon
                    title="Bộ giải có lỗi: lộ trình vi phạm ràng buộc. Đừng dùng lộ trình này"
                    description={<ul>{result.violations.map(v => <li key={v}>{v}</li>)}</ul>}
                />
            )}

            {(result.requests?.length ?? 0) > 0 && <RequestsCard requests={result.requests!} />}

            {(result.warnings?.length ?? 0) > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    title="Cần lưu ý"
                    description={<ul>{result.warnings!.map(w => <li key={w}>{w}</li>)}</ul>}
                />
            )}

            {result.engine_report && <EngineReportCard report={result.engine_report} courseName={courseName} />}

            {board ?? result.semesters.map(semester => (
                <Card
                    key={semester.semester_code}
                    size="small"
                    title={(
                        <Space>
                            <Text strong>{semesterLabel(semester.semester_code)}</Text>
                            {semester.semester_code.endsWith('3') && <Tag color="orange">Kỳ hè</Tag>}
                        </Space>
                    )}
                    extra={<Tag>{semester.credits} TC</Tag>}
                >
                    <Table<PlanCourse>
                        size="small"
                        rowKey="code"
                        pagination={false}
                        dataSource={semester.courses}
                        columns={[
                            { title: 'Mã', dataIndex: 'code', width: 110 },
                            {
                                title: 'Môn',
                                key: 'name',
                                render: (_v, c) => (
                                    <Space>
                                        {c.locked && <Tooltip title="Bạn đã khóa môn vào kỳ này"><LuLock /></Tooltip>}
                                        <span>{c.reason === 'free_elective' ? 'Một môn tự chọn tự do bất kỳ' : courseName(c.code)}</span>
                                    </Space>
                                ),
                            },
                            { title: 'TC', dataIndex: 'credits', width: 60 },
                            {
                                title: 'Lý do',
                                key: 'reason',
                                width: 150,
                                render: (_v, c) => <Tag color={REASON[c.reason]?.color}>{REASON[c.reason]?.label ?? c.reason}</Tag>,
                            },
                        ]}
                    />
                </Card>
            ))}

            {(result.preferences_report?.length ?? 0) > 0 && (
                <Card title="Mong muốn của bạn có được đáp ứng không">
                    <Space orientation="vertical" style={{ width: '100%' }}>
                        {result.preferences_report!.map(p => (
                            <Space key={`${p.id}-${p.detail}`} align="start">
                                {p.satisfied
                                    ? <LuCircleCheck color="#389e0d" />
                                    : <LuCircleX color="#cf1322" />}
                                <span>
                                    <Text strong>{PREFERENCE_LABEL[p.id] ?? p.id}</Text>
                                    {!p.satisfied && <Text type="danger"> · Không đáp ứng được</Text>}
                                    <br />
                                    <Text type="secondary">{p.detail}</Text>
                                </span>
                            </Space>
                        ))}
                        {s6 && !s6.satisfied && !recommendationsFirst && onPreferRecommendations && (
                            <IOutLinedBtn onClick={onPreferRecommendations}>
                                Ưu tiên giữ khuyến nghị (có thể lùi kỳ tốt nghiệp)
                            </IOutLinedBtn>
                        )}
                    </Space>
                </Card>
            )}

            <Collapse
                items={[
                    {
                        key: 'assumptions',
                        label: 'Giả định của lộ trình này',
                        children: <ul>{(result.assumptions ?? []).map(a => <li key={a}>{a}</li>)}</ul>,
                    },
                    {
                        key: 'data',
                        label: 'Độ tin cậy của dữ liệu tiên quyết',
                        children: (
                            <Space orientation="vertical">
                                <Text>
                                    {result.inferred_relations?.length
                                        ? `${result.inferred_relations.length} quan hệ được suy ra từ chương trình khác (bản chụp ${result.relations_snapshot}):`
                                        : 'Không có quan hệ nào phải suy ra từ chương trình khác.'}
                                </Text>
                                {result.inferred_relations?.map(r => (
                                    <Text key={`${r.course_code}-${r.related_course_code}`} type="secondary">
                                        {r.course_code} {r.type === 'prerequisite' ? 'cần đạt' : 'song hành với'} {r.related_course_code} ({r.inferred_from})
                                    </Text>
                                ))}
                                <Text type="secondary">
                                    {result.unverified_prerequisites?.length ?? 0} môn không có thông tin tiên quyết ở nguồn nào
                                    (có thể thật sự không có tiên quyết, hoặc dữ liệu còn thiếu).
                                </Text>
                            </Space>
                        ),
                    },
                ]}
            />

            {result.semesters.length === 0 && result.status === 'OPTIMAL' && (
                <Empty description="Bạn không còn môn nào phải học trong chương trình." />
            )}
        </div>
    );
};

export default PlanResultView;
