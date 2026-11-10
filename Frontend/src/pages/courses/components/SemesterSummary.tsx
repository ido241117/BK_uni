import { useMemo } from 'react';
import { Alert, Card, Typography } from 'antd';
import type { Curriculum } from '@/types';
import type { CourseRow } from '../types';

const { Paragraph } = Typography;

interface SemesterTotal {
    semesterCode: string;
    credits: number;
    courseCount: number;
}

interface SemesterSummaryProps {
    rows: CourseRow[];
    /** Dùng để cảnh báo học kỳ vượt/dưới mức tín chỉ của chương trình. */
    curriculum: Curriculum | undefined;
}

/** Tổng tín chỉ theo học kỳ dự kiến, kèm cảnh báo học kỳ chưa cân đối. */
const SemesterSummary = ({ rows, curriculum }: SemesterSummaryProps) => {
    const totals = useMemo<SemesterTotal[]>(() => {
        const bySemester = new Map<string, SemesterTotal>();
        rows.forEach(row => {
            if (!row.plannedSemester) return;
            const current = bySemester.get(row.plannedSemester)
                ?? { semesterCode: row.plannedSemester, credits: 0, courseCount: 0 };
            current.credits += row.credits;
            current.courseCount += 1;
            bySemester.set(row.plannedSemester, current);
        });
        return [...bySemester.values()].sort((a, b) => a.semesterCode.localeCompare(b.semesterCode));
    }, [rows]);

    return (
        <Card title="Kế hoạch theo học kỳ" size="small">
            {totals.length === 0 ? (
                <Paragraph type="secondary" style={{ margin: 0 }}>
                    Chưa có môn nào được xếp vào học kỳ. Bấm “Sửa” ở một môn và nhập học kỳ dự kiến (ví dụ 252).
                </Paragraph>
            ) : (
                <div className="stat-row">
                    {totals.map(total => (
                        <Card key={total.semesterCode} size="small" variant="outlined">
                            <div className="hint">Học kỳ {total.semesterCode}</div>
                            <div style={{ fontSize: 20, fontWeight: 700, margin: '2px 0' }}>{total.credits} TC</div>
                            <div className="hint">{total.courseCount} môn</div>
                        </Card>
                    ))}
                </div>
            )}

            {curriculum && totals.map(total => {
                const over = total.credits > curriculum.max_semester_credits;
                const under = total.credits < curriculum.min_semester_credits;
                if (!over && !under) return null;

                return (
                    <Alert
                        key={total.semesterCode}
                        type="warning"
                        showIcon
                        style={{ marginTop: 12 }}
                        title={`Học kỳ ${total.semesterCode}: ${total.credits} TC — chưa cân đối`}
                        description={over
                            ? `Vượt mức tối đa ${curriculum.max_semester_credits} TC/học kỳ của chương trình.`
                            : `Dưới mức tối thiểu ${curriculum.min_semester_credits} TC/học kỳ của chương trình.`}
                    />
                );
            })}
        </Card>
    );
};

export default SemesterSummary;
