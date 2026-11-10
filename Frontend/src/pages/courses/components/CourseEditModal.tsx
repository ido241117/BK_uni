import { useEffect } from 'react';
import { Alert, Form, Input, Modal, Select, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import {
    removeMyCourse,
    removeMyPlanCourse,
    upsertMyCourse,
    upsertMyPlanCourse,
} from '@/apis/student';
import { useApiMutation } from '@/hooks';
import { STUDENT_COURSE_STATUS, STUDENT_COURSE_STATUS_LABEL, type StudentCourseStatus } from '@/types';
import type { CourseRow } from '../types';

const { Text } = Typography;

/** Mã học kỳ dạng YYK: 2 số cuối năm học + kỳ 1..3 (ví dụ 251, 252, 253). */
const SEMESTER_CODE_PATTERN = /^\d{2}[123]$/;

const STATUS_OPTIONS = Object.values(STUDENT_COURSE_STATUS).map(value => ({
    value,
    label: STUDENT_COURSE_STATUS_LABEL[value],
}));

interface EditValues {
    status?: StudentCourseStatus | null;
    planned_semester?: string;
}

interface CourseEditModalProps {
    /** `null` = đóng modal. */
    row: CourseRow | null;
    /** Chương trình trong hồ sơ; kế hoạch học tập lưu theo chương trình nên thiếu thì không lập kế hoạch được. */
    curriculumId: string | undefined;
    onClose: () => void;
}

/**
 * Sửa một môn của sinh viên: trạng thái học tập và học kỳ dự kiến.
 * Để trống trạng thái = bỏ khai báo; để trống học kỳ = bỏ môn khỏi kế hoạch. Chỉ gọi API cho phần đã đổi.
 */
const CourseEditModal = ({ row, curriculumId, onClose }: CourseEditModalProps) => {
    const queryClient = useQueryClient();
    const [form] = Form.useForm<EditValues>();

    useEffect(() => {
        if (!row) return;
        form.resetFields();
        form.setFieldsValue({ status: row.status, planned_semester: row.plannedSemester ?? '' });
    }, [form, row]);

    const save = useApiMutation({
        mutationFn: async (values: EditValues) => {
            if (!row) return;
            const status = values.status ?? null;
            if (status !== row.status) {
                if (status) await upsertMyCourse(row.courseId, status);
                else await removeMyCourse(row.courseId);
            }

            const semester = values.planned_semester?.trim() || null;
            if (curriculumId && semester !== row.plannedSemester) {
                if (semester) await upsertMyPlanCourse(curriculumId, row.courseId, semester);
                else await removeMyPlanCourse(curriculumId, row.courseId);
            }
        },
        successMessage: 'Đã cập nhật môn học.',
        onSuccess: () => onClose(),
        // Thành công hay lỗi giữa chừng đều tải lại để bảng khớp dữ liệu đã lưu.
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: ['student-courses'] });
            void queryClient.invalidateQueries({ queryKey: ['plan-courses'] });
        },
    });

    return (
        <Modal
            open={row !== null}
            title={row ? `Sửa ${row.code} · ${row.name}` : 'Sửa môn học'}
            okText="Lưu"
            cancelText="Huỷ"
            confirmLoading={save.isPending}
            onOk={() => form.submit()}
            onCancel={onClose}
            destroyOnHidden
        >
            <Form<EditValues> form={form} layout="vertical" onFinish={values => save.mutate(values)}>
                <Form.Item
                    name="status"
                    label="Trạng thái học tập"
                    extra="Để trống nếu muốn bỏ khai báo môn này."
                >
                    <Select<StudentCourseStatus>
                        allowClear
                        placeholder="Chưa khai"
                        options={STATUS_OPTIONS}
                    />
                </Form.Item>

                <Form.Item
                    name="planned_semester"
                    label="Học kỳ dự kiến"
                    extra="Mã học kỳ dạng YYK, ví dụ 251, 252, 253. Để trống để bỏ môn khỏi kế hoạch."
                    rules={[{
                        validator: (_rule, value: string | undefined) => (
                            !value?.trim() || SEMESTER_CODE_PATTERN.test(value.trim())
                                ? Promise.resolve()
                                : Promise.reject(new Error('Mã học kỳ phải có dạng YYK, ví dụ 252.'))
                        ),
                    }]}
                >
                    <Input maxLength={3} placeholder="Chưa lên kế hoạch" disabled={!curriculumId} />
                </Form.Item>

                {!curriculumId && (
                    <Alert
                        type="info"
                        showIcon
                        title="Chưa chọn chương trình đào tạo"
                        description={<Text>Chọn chương trình trong Hồ sơ cá nhân để lập kế hoạch học kỳ dự kiến.</Text>}
                    />
                )}
            </Form>
        </Modal>
    );
};

export default CourseEditModal;
