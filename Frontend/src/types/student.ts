import type { BaseRecord } from './common';
import type { CourseSummary } from './course';

export const STUDENT_COURSE_STATUS = {
    NOT_STARTED: 'not-started',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    /** Đã học nhưng không đạt: vẫn thỏa điều kiện học trước (HT). */
    FAILED: 'failed',
} as const;

export type StudentCourseStatus = (typeof STUDENT_COURSE_STATUS)[keyof typeof STUDENT_COURSE_STATUS];

export const STUDENT_COURSE_STATUS_LABEL: Record<StudentCourseStatus, string> = {
    'not-started': 'Chưa học',
    'in-progress': 'Đang học',
    completed: 'Đã hoàn thành',
    failed: 'Chưa đạt',
};

/** Màu Tag của từng trạng thái, dùng chung cho mọi bảng/trang. */
export const STUDENT_COURSE_STATUS_COLOR: Record<StudentCourseStatus, string> = {
    'not-started': 'default',
    'in-progress': 'blue',
    completed: 'green',
    failed: 'red',
};

export const STUDENT_REGULATION_STATUS = {
    NOT_STARTED: 'not-started',
    COMPLETED: 'completed',
} as const;

export type StudentRegulationStatus = (typeof STUDENT_REGULATION_STATUS)[keyof typeof STUDENT_REGULATION_STATUS];

export const STUDENT_REGULATION_STATUS_LABEL: Record<StudentRegulationStatus, string> = {
    'not-started': 'Chưa đạt',
    completed: 'Đã đạt',
};

export interface StudentProfile extends BaseRecord {
    user_id: string;
    full_name: string | null;
    student_number: string | null;
    phone: string | null;
    birth_date: string | null;
    admission_year: number | null;
    address: string | null;
    curriculum_id: string | null;
    credit_target: number | null;
    /** Chuyên ngành muốn hướng tới (không bắt buộc), thuộc `curriculum_id`. */
    target_specialization_id?: string | null;
}

/** Mọi trường đều tùy chọn; gửi `null` để xoá giá trị. */
export interface StudentProfilePayload {
    full_name?: string | null;
    student_number?: string | null;
    phone?: string | null;
    birth_date?: string | null;
    admission_year?: number | null;
    address?: string | null;
    curriculum_id?: string | null;
    credit_target?: number | null;
}

export interface StudentCourse extends BaseRecord {
    user_id: string;
    course_id: string;
    status: StudentCourseStatus;
    course: CourseSummary;
}

export interface StudentPlanCourse {
    id: string;
    curriculum_id: string;
    course_id: string;
    semester_code: string;
    course: CourseSummary;
}

export interface StudentRegulationStatusRecord extends BaseRecord {
    user_id: string;
    regulation_id: string;
    status: StudentRegulationStatus;
}
