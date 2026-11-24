import { useState } from 'react';
import { Descriptions, Drawer, Input, Radio, Space, Tag, Typography } from 'antd';
import { LuExternalLink } from 'react-icons/lu';
import { Link } from 'react-router';
import { IOutLinedBtn } from '@/components';
import { STUDENT_COURSE_STATUS, STUDENT_COURSE_STATUS_LABEL, type CourseSummary, type StudentCourseStatus } from '@/types';
import { currentSemester } from '@/utils/semester';
import type { CourseDraft } from './useCourseDraft';

const { Text } = Typography;

/** Mã học kỳ dạng YYK: 2 số cuối năm học + kỳ 1..3 (ví dụ 251, 252, 253). */
const SEMESTER_CODE_PATTERN = /^\d{2}[123]$/;

const STATUS_CHOICES: { value: StudentCourseStatus | 'none'; label: string }[] = [
    { value: 'none', label: 'Chưa khai' },
    ...Object.values(STUDENT_COURSE_STATUS).map(value => ({ value, label: STUDENT_COURSE_STATUS_LABEL[value] })),
];

export interface CourseContext {
    /** Ví dụ "Năm 2 · Học kỳ 1", "Ngoài chương trình". */
    placement: string;
    groups: string[];
}

interface CourseDrawerProps {
    course: CourseSummary | null;
    context: CourseContext | null;
    draft: CourseDraft;
    onClose: () => void;
}

const SemesterInput = ({ course, draft }: { course: CourseSummary; draft: CourseDraft }) => {
    const saved = draft.planMap.get(course.id) ?? '';
    const [value, setValue] = useState(saved);
    const trimmed = value.trim();
    const minSemester = currentSemester();
    const malformed = trimmed !== '' && !SEMESTER_CODE_PATTERN.test(trimmed);
    // Giữ được học kỳ cũ đã lưu (chỉ chặn khi nhập mới một kỳ đã qua).
    const past = !malformed && trimmed !== '' && trimmed !== saved && trimmed < minSemester;
    const invalid = malformed || past;

    const apply = () => {
        if (invalid || trimmed === saved) return;
        draft.setPlannedSemester(course.id, trimmed || null, course);
    };

    return (
        <div>
            <Input
                maxLength={3}
                placeholder="Chưa lên kế hoạch"
                value={value}
                status={invalid ? 'error' : undefined}
                onChange={event => setValue(event.target.value)}
                onBlur={apply}
                onPressEnter={apply}
                aria-label="Học kỳ dự kiến"
                style={{ maxWidth: 160 }}
            />
            <div className="hint" style={{ marginTop: 4, color: invalid ? 'var(--status-failed)' : undefined }}>
                {malformed
                    ? 'Mã học kỳ phải có dạng YYK, ví dụ 252.'
                    : past
                        ? `Không lên kế hoạch vào học kỳ đã qua (sớm nhất HK ${minSemester}).`
                        : 'Dạng YYK, ví dụ 251, 252, 253 (hè). Để trống để bỏ khỏi kế hoạch.'}
            </div>
        </div>
    );
};

/** Chi tiết một môn; mọi thay đổi chỉ ghi vào nháp, lưu cùng nút "Lưu" của trang. */
const CourseDrawer = ({ course, context, draft, onClose }: CourseDrawerProps) => {
    const status = course ? draft.statusMap.get(course.id) ?? null : null;
    return (
        <Drawer
            open={course !== null}
            onClose={onClose}
            title={course ? `${course.code} · ${course.name}` : ''}
            destroyOnHidden
        >
            {course && (
                <Space orientation="vertical" size={20} style={{ width: '100%' }}>
                    <Descriptions column={1} size="small" bordered>
                        <Descriptions.Item label="Tín chỉ">{course.credits} TC</Descriptions.Item>
                        {context && <Descriptions.Item label="Vị trí">{context.placement}</Descriptions.Item>}
                        {context && context.groups.length > 0 && (
                            <Descriptions.Item label="Khối">
                                <Space wrap size={[4, 4]}>{context.groups.map(name => <Tag key={name}>{name}</Tag>)}</Space>
                            </Descriptions.Item>
                        )}
                    </Descriptions>
                    {course.description && <Text type="secondary">{course.description}</Text>}

                    <div>
                        <Text strong>Trạng thái học tập</Text>
                        <Radio.Group
                            style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
                            value={status ?? 'none'}
                            onChange={event => {
                                const value = event.target.value as StudentCourseStatus | 'none';
                                draft.setStatus(course.id, value === 'none' ? null : value, course);
                            }}
                            options={STATUS_CHOICES}
                        />
                    </div>

                    <div>
                        <Text strong>Học kỳ dự kiến</Text>
                        <div style={{ marginTop: 8 }}>
                            <SemesterInput key={course.id} course={course} draft={draft} />
                        </div>
                    </div>

                    <Link to={`/courses/${encodeURIComponent(course.code)}`} state={{ from: '/courses' }}>
                        <IOutLinedBtn icon={<LuExternalLink />}>Xem đề cương, điều kiện môn học</IOutLinedBtn>
                    </Link>
                </Space>
            )}
        </Drawer>
    );
};

export default CourseDrawer;
