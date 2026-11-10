import type { BaseRecord, PageParams } from './common';

/** Thông tin môn tối thiểu mà các endpoint khác nhúng kèm. */
export interface CourseSummary {
    id: string;
    code: string;
    name: string;
    credits: number;
    description: string | null;
}

export interface Course extends BaseRecord {
    code: string;
    name: string;
    credits: number;
    /** Mô tả ngắn hiển thị dưới tên môn. */
    description: string | null;
}

export interface CourseOpenedSemester extends BaseRecord {
    course_id: string;
    semester_code: string;
}

export interface CourseQueryParams extends PageParams {
    search?: string;
}

export interface CoursePayload {
    code: string;
    name: string;
    credits: number;
    description?: string | null;
}
