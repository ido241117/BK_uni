import { Alert, Card, Collapse, Empty, Space, Statistic, Table, Tag, Tooltip, Typography } from 'antd';
import { LuCircleCheck, LuCircleX, LuLock } from 'react-icons/lu';
import { IOutLinedBtn, ISolidBtn } from '@/components';
import type { PlanCourse, PlanCourseReason, PlanResult } from '@/types';
import { semesterLabel } from '@/pages/courses/analysis/semester';
import { comparePlans, isSameAsBaseline, type PlanDiff } from './whatIf';

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
    /** Kỳ tốt nghiệp của lần giải trước, để so sánh khi đổi tùy chọn. */
    previousGraduation?: string | null;
    recommendationsFirst: boolean;
    onPreferRecommendations?: () => void;
    /** What-if (T17): lộ trình mốc đã lưu. */
    baseline?: { savedAt: string; result: PlanResult } | null;
    onSaveBaseline?: () => void;
    onRestoreBaseline?: () => void;
    onClearBaseline?: () => void;
}

const graduationText = (d: PlanDiff) => {
    const from = d.graduationFrom ? semesterLabel(d.graduationFrom) : '—';
    const to = d.graduationTo ? semesterLabel(d.graduationTo) : '—';
    if (d.graduationFrom === d.graduationTo) return `Vẫn học xong ở ${to}, như mốc.`;
    if (d.mainSemesterShift === null) return `Học xong đổi từ ${from} sang ${to}.`;
    const n = Math.abs(d.mainSemesterShift);
    return `Học xong ${d.mainSemesterShift > 0 ? 'muộn' : 'sớm'} hơn ${n} kỳ chính: ${from} → ${to}.`;
};

const WhatIfCard = ({
    result, baseline, courseName, onSaveBaseline, onRestoreBaseline, onClearBaseline,
}: Pick<PlanResultViewProps, 'result' | 'baseline' | 'courseName' | 'onSaveBaseline' | 'onRestoreBaseline' | 'onClearBaseline'>) => {
    const usable = result.semesters.length > 0 && result.violations.length === 0
        && (result.status === 'OPTIMAL' || result.status === 'SAT_NOT_PROVEN_OPTIMAL');

    if (!baseline) {
        return usable && onSaveBaseline ? (
            <Card size="small">
                <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
                    <Text type="secondary">
                        Muốn thử "nếu… thì sao"? Lưu lộ trình này làm mốc, rồi đổi kịch bản bên trái: trang sẽ chỉ ra
                        môn nào dời kỳ và kỳ tốt nghiệp đổi ra sao.
                    </Text>
                    <ISolidBtn onClick={onSaveBaseline}>Lưu làm mốc</ISolidBtn>
                </Space>
            </Card>
        ) : null;
    }

    const isBaseline = baseline.result === result;
    const diff = comparePlans(baseline.result, result);
    const same = isSameAsBaseline(diff);
    const savedAt = new Date(baseline.savedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
    const name = (code: string) => `${code} · ${courseName(code)}`;

    return (
        <Card
            size="small"
            title={isBaseline ? 'Đang xem lộ trình mốc' : 'So với lộ trình mốc'}
            extra={<Text type="secondary">Mốc lưu lúc {savedAt} (trên trình duyệt này)</Text>}
        >
            <Space orientation="vertical" style={{ width: '100%' }}>
                {result.semesters.length === 0
                    ? <Text>Kịch bản này không có lộ trình. Mốc vẫn được giữ nguyên.</Text>
                    : isBaseline
                        ? <Text type="secondary">Đổi kịch bản bên trái rồi bấm Giải lộ trình để so với mốc này.</Text>
                        : same
                            ? <Text><LuCircleCheck color="#389e0d" /> Giống hệt mốc.</Text>
                            : (
                                <>
                                    <Text strong>{graduationText(diff)}</Text>
                                    {diff.moved.length > 0 && (
                                        <div>
                                            <Text>{diff.moved.length} môn dời kỳ:</Text>
                                            <ul>{diff.moved.map(m => (
                                                <li key={m.code}>{name(m.code)}: {semesterLabel(m.from)} → {semesterLabel(m.to)}</li>
                                            ))}</ul>
                                        </div>
                                    )}
                                    {diff.added.length > 0 && (
                                        <div>
                                            <Text>{diff.added.length} môn mới so với mốc:</Text>
                                            <ul>{diff.added.map(m => <li key={m.code}>{name(m.code)} ở {semesterLabel(m.to)}</li>)}</ul>
                                        </div>
                                    )}
                                    {diff.removed.length > 0 && (
                                        <div>
                                            <Text>{diff.removed.length} môn không còn trong lộ trình:</Text>
                                            <ul>{diff.removed.map(m => <li key={m.code}>{name(m.code)} (mốc: {semesterLabel(m.from)})</li>)}</ul>
                                        </div>
                                    )}
                                </>
                            )}
                <Space wrap>
                    {!isBaseline && onRestoreBaseline && <IOutLinedBtn onClick={onRestoreBaseline}>Về mốc</IOutLinedBtn>}
                    {!isBaseline && usable && onSaveBaseline && (
                        <IOutLinedBtn onClick={onSaveBaseline}>Lấy lộ trình này làm mốc mới</IOutLinedBtn>
                    )}
                    {onClearBaseline && <IOutLinedBtn onClick={onClearBaseline}>Xóa mốc</IOutLinedBtn>}
                </Space>
            </Space>
        </Card>
    );
};

const PlanResultView = ({
    result, courseName, previousGraduation, recommendationsFirst, onPreferRecommendations,
    baseline, onSaveBaseline, onRestoreBaseline, onClearBaseline,
}: PlanResultViewProps) => {
    const alert = STATUS_ALERT[result.status] ?? STATUS_ALERT.INPUT_ERROR;
    const totalCredits = result.semesters.reduce((sum, s) => sum + s.credits, 0);
    const s6 = result.preferences_report?.find(p => p.id === 'S6');
    const diff = baseline && baseline.result !== result ? comparePlans(baseline.result, result) : null;
    const movedFrom = new Map(diff?.moved.map(m => [m.code, m.from]) ?? []);
    const added = new Set(diff?.added.map(m => m.code) ?? []);

    return (
        <div className="stack">
            <Alert
                type={alert.type}
                showIcon
                title={alert.title}
                description={result.status === 'UNSAT' ? result.infeasible_reason
                    : result.status === 'INPUT_ERROR' ? result.error : undefined}
            />

            <WhatIfCard
                result={result}
                baseline={baseline}
                courseName={courseName}
                onSaveBaseline={onSaveBaseline}
                onRestoreBaseline={onRestoreBaseline}
                onClearBaseline={onClearBaseline}
            />

            {result.violations.length > 0 && (
                <Alert
                    type="error"
                    showIcon
                    title="Bộ giải có lỗi: lộ trình vi phạm ràng buộc. Đừng dùng lộ trình này"
                    description={<ul>{result.violations.map(v => <li key={v}>{v}</li>)}</ul>}
                />
            )}

            {result.semesters.length > 0 && (
                <Card>
                    <Space size={48} wrap>
                        <Statistic title="Học xong dự kiến" value={result.graduation_semester ? semesterLabel(result.graduation_semester) : '—'} />
                        <Statistic title="Tín chỉ còn phải học" value={totalCredits} suffix="TC" />
                        <Statistic title="Số kỳ còn lại" value={result.semesters.length} />
                        <Statistic title="Bộ giải" value={`${result.solver} · ${result.solve_ms ?? '?'} ms`} />
                    </Space>
                    {!baseline && previousGraduation && previousGraduation !== result.graduation_semester && (
                        <Alert
                            style={{ marginTop: 12 }}
                            type="info"
                            showIcon
                            title={`Kỳ tốt nghiệp đổi từ ${previousGraduation} sang ${result.graduation_semester}`}
                        />
                    )}
                </Card>
            )}

            {(result.warnings?.length ?? 0) > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    title="Cần lưu ý"
                    description={<ul>{result.warnings!.map(w => <li key={w}>{w}</li>)}</ul>}
                />
            )}

            {result.semesters.map(semester => (
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
                                        {movedFrom.has(c.code) && <Tag color="orange">dời từ {movedFrom.get(c.code)}</Tag>}
                                        {added.has(c.code) && <Tag color="green">mới so với mốc</Tag>}
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
