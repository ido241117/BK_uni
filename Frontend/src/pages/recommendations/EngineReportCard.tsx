import { Card, Collapse, Space, Table, Tag, Typography } from 'antd';
import type { EngineReport } from '@/types';
import { semesterLabel } from '@/pages/courses/analysis/semester';

const { Text } = Typography;

/** Tên các mức mục tiêu của engine ASP (pipeline/engine/asp/core/optimize.lp). */
const OBJECTIVE_LABEL: Record<string, string> = {
    gaps: 'Kỳ chính bị bỏ trống',
    last_semester: 'Kỳ cuối (chỉ số kỳ)',
    retakes: 'Học lại môn rớt (chỉ số kỳ, càng nhỏ càng sớm)',
    offering_history: 'Lệch lịch mở lớp (tổng %)',
    cost: 'Học phí (đơn vị của policy.lp)',
    typical_term: 'Lệch kỳ điển hình',
    level_order: 'Môn cấp 1–2 học muộn',
    balance: 'Kỳ nặng nhất (TC)',
    taste: 'Sở thích',
};

const REQUIREMENT_LABEL: Record<string, string> = {
    social_work_days: 'Ngày công tác xã hội (web chưa có dữ liệu)',
};

interface EngineReportCardProps {
    report: EngineReport;
    courseName: (code: string) => string;
}

/** Thông tin thêm chỉ bộ giải Clingo (engine ASP) trả về: GPA, điều kiện tốt nghiệp, chuyên ngành, lịch mở lớp, tag. */
const EngineReportCard = ({ report, courseName }: EngineReportCardProps) => {
    const gpa10 = report.gpa.score_10;
    const gpa4 = report.gpa.gpa_4;
    const tags = Object.entries(report.course_tags ?? {});

    return (
        <Card title="Thông tin thêm từ bộ giải Clingo (engine ASP)">
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <Space orientation="vertical" size={4}>
                    <Text strong>GPA (từ điểm trong file tiến độ myBK)</Text>
                    {gpa10 === undefined && gpa4 === undefined ? (
                        <Text type="secondary">Chưa có điểm: tải file PDF tiến độ myBK ở trang Môn học (file Excel không có điểm).</Text>
                    ) : (
                        <Space wrap>
                            {gpa10 !== undefined && <Tag>Hệ 10: {gpa10.toFixed(2)}</Tag>}
                            {gpa4 !== undefined && <Tag>Hệ 4: {gpa4.toFixed(2)}</Tag>}
                            {report.gpa_required_avg !== undefined && !report.gpa_already_satisfied && (
                                <Tag color="blue">Trung bình cần đạt ở các môn còn lại (hệ 4): {report.gpa_required_avg.toFixed(2)}</Tag>
                            )}
                            {report.gpa_already_satisfied && <Tag color="green">Đã đủ GPA tốt nghiệp</Tag>}
                            {report.gpa_requirement_impossible && <Tag color="red">Không thể đạt GPA tốt nghiệp với các môn còn lại</Tag>}
                        </Space>
                    )}
                </Space>

                <Space orientation="vertical" size={4}>
                    <Text strong>Điều kiện tốt nghiệp ngoài môn học</Text>
                    {report.graduation_blocked.length === 0 && report.external_pending.length === 0
                        && report.external_missed.length === 0 ? (
                            <Text type="secondary">Không có điều kiện nào đang thiếu theo dữ liệu hiện có.</Text>
                        ) : (
                            <Space wrap>
                                {report.graduation_blocked.map(r => <Tag key={r} color="red">Chưa đạt: {REQUIREMENT_LABEL[r] ?? r}</Tag>)}
                                {report.external_missed.map(m => (
                                    <Tag key={`${m.requirement}-${m.year}`} color="red">
                                        Trễ hạn năm {m.year}: {REQUIREMENT_LABEL[m.requirement] ?? m.requirement}
                                    </Tag>
                                ))}
                                {report.external_pending.map(m => (
                                    <Tag key={`${m.requirement}-${m.year}`} color="orange">
                                        Cần thêm {m.missing} trước hết năm {m.year}: {REQUIREMENT_LABEL[m.requirement] ?? m.requirement}
                                    </Tag>
                                ))}
                            </Space>
                        )}
                </Space>

                {report.majors.length > 0 && (
                    <Space orientation="vertical" size={4}>
                        <Text strong>Chuyên ngành (số môn của chuyên ngành có trong bảng điểm và lộ trình)</Text>
                        <Space wrap>
                            {report.majors.map(m => (
                                <Tag key={m.code} color={m.earned ? 'green' : undefined}>{m.code}: {m.count} môn{m.earned ? ' · đủ' : ''}</Tag>
                            ))}
                        </Space>
                    </Space>
                )}

                {report.offering_misses.length > 0 && (
                    <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                        <Text strong>Môn xếp vào kỳ ít khi mở lớp (theo lịch sử mở lớp)</Text>
                        <Table
                            size="small"
                            rowKey={r => `${r.course}-${r.semester}`}
                            pagination={false}
                            dataSource={report.offering_misses}
                            columns={[
                                { title: 'Mã', dataIndex: 'course', width: 110 },
                                { title: 'Môn', key: 'name', render: (_v, r) => courseName(r.course) },
                                { title: 'Kỳ', key: 'semester', width: 160, render: (_v, r) => semesterLabel(r.semester) },
                                {
                                    title: 'Không mở ở',
                                    key: 'missed',
                                    width: 140,
                                    render: (_v, r) => `${r.missed_percent}% kỳ cùng loại`,
                                },
                            ]}
                        />
                    </Space>
                )}

                {tags.length > 0 && (
                    <Space orientation="vertical" size={4}>
                        <Text strong>Tag của môn trong lộ trình</Text>
                        <Space wrap>
                            {tags.map(([code, list]) => (
                                <Text key={code}>{code} {list.map(t => <Tag key={t}>{t}</Tag>)}</Text>
                            ))}
                        </Space>
                    </Space>
                )}

                <Collapse
                    items={[{
                        key: 'objective',
                        label: 'Giá trị các mục tiêu (theo thứ tự ưu tiên)',
                        children: (
                            <Space orientation="vertical" size={2}>
                                {report.objective.map(o => (
                                    <Text key={o.level}>@{o.priority} {OBJECTIVE_LABEL[o.level] ?? o.level}: {o.value}</Text>
                                ))}
                                {report.ground_and_solve_ms !== undefined && (
                                    <Text type="secondary">Grounding và giải: {report.ground_and_solve_ms} ms</Text>
                                )}
                            </Space>
                        ),
                    }]}
                />
            </Space>
        </Card>
    );
};

export default EngineReportCard;
