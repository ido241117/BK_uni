import type { BaseRecord, PageParams } from './common';
import type { CourseSummary } from './course';

export const COURSE_GROUP_KIND = {
    REQUIRED: 'required',
    ELECTIVE: 'elective',
} as const;

export type CourseGroupKind = (typeof COURSE_GROUP_KIND)[keyof typeof COURSE_GROUP_KIND];

export const COURSE_GROUP_KIND_LABEL: Record<CourseGroupKind, string> = {
    required: 'Bắt buộc',
    elective: 'Tự chọn',
};

export const COURSE_GROUP_SCOPE = {
    LISTED: 'listed',
    ANY: 'any',
} as const;

export type CourseGroupScope = (typeof COURSE_GROUP_SCOPE)[keyof typeof COURSE_GROUP_SCOPE];

export const COURSE_GROUP_SCOPE_LABEL: Record<CourseGroupScope, string> = {
    listed: 'Danh sách môn',
    any: 'Chọn tự do',
};

/** Theo ghi chú kế hoạch giảng dạy: TQ, HT, SHT, KN. */
export const COURSE_RELATION_TYPE = {
    PREREQUISITE: 'prerequisite',
    PRIOR: 'prior',
    COREQUISITE: 'corequisite',
    RECOMMENDED: 'recommended',
} as const;

export type CourseRelationType = (typeof COURSE_RELATION_TYPE)[keyof typeof COURSE_RELATION_TYPE];

export const COURSE_RELATION_TYPE_LABEL: Record<CourseRelationType, string> = {
    prerequisite: 'Tiên quyết',
    prior: 'Học trước',
    corequisite: 'Song hành',
    recommended: 'Khuyến nghị',
};

export interface Curriculum extends BaseRecord {
    code: string;
    name: string;
    major: string;
    faculty: string;
    cohort: number;
    duration_years: number;
    min_semester_credits: number;
    max_semester_credits: number;
    description: string | null;
}

export interface CurriculumPayload {
    code: string;
    name: string;
    major: string;
    faculty: string;
    cohort: number;
    duration_years: number;
    min_semester_credits: number;
    max_semester_credits: number;
    description?: string | null;
}

export interface CurriculumCourse extends BaseRecord {
    curriculum_id: string;
    course_id: string;
    /** `null` = môn thuộc pool tự chọn, chưa xếp kỳ cố định. */
    recommended_year: number | null;
    recommended_term: number | null;
    course: CourseSummary;
}

export interface CurriculumCoursePayload {
    course_id: string;
    recommended_year?: number | null;
    recommended_term?: number | null;
}

export interface CourseGroupMember {
    id: string;
    curriculum_id: string;
    group_id: string;
    course_id: string;
    course: CourseSummary;
}

export interface CourseGroup extends BaseRecord {
    curriculum_id: string;
    name: string;
    kind: CourseGroupKind;
    /** Số môn phải chọn; `null` khi khối chỉ ràng buộc theo tín chỉ. */
    required_count: number | null;
    /** Số tín chỉ tối thiểu phải đạt; `null` khi khối chỉ ràng buộc theo số môn. */
    required_credits: number | null;
    pool_scope: CourseGroupScope;
    /** Khối `any`: chỉ nhận môn đúng số tín chỉ này; `null` là không lọc. */
    pool_course_credits: number | null;
    /** `null` với khối gốc (xét tốt nghiệp); có giá trị với khối chuyên ngành (không cộng tín chỉ). */
    specialization_id: string | null;
    /** Khối gốc mà khối chuyên ngành thu hẹp. */
    parent_group_id: string | null;
    members: CourseGroupMember[];
}

export interface CourseGroupPayload {
    name: string;
    kind: CourseGroupKind;
    required_count?: number | null;
    required_credits?: number | null;
    pool_scope?: CourseGroupScope;
    pool_course_credits?: number | null;
    course_ids?: string[];
}

/**
 * Nhóm học phần **mô tả** của một chương trình: tên do admin tự đặt,
 * không ràng buộc số môn/tín chỉ. Cùng một môn có thể mang tên nhóm khác nhau
 * ở các chương trình khác nhau.
 */
export interface CurriculumCategoryMember {
    id: string;
    curriculum_id: string;
    category_id: string;
    course_id: string;
    course: CourseSummary;
}

export interface CurriculumCategory extends BaseRecord {
    curriculum_id: string;
    name: string;
    members: CurriculumCategoryMember[];
}

export interface CurriculumCategoryPayload {
    name: string;
    course_ids?: string[];
}

/** Chuyên ngành không bắt buộc: thu hẹp một số khối tự chọn gốc qua các khối con trong `groups`. */
export interface CurriculumSpecialization extends BaseRecord {
    curriculum_id: string;
    code: string;
    name: string;
    description: string | null;
    groups: CourseGroup[];
}

/** Một lần mở lớp của một môn trong chương trình. */
export interface CurriculumOpenedSemester {
    course_id: string;
    semester_code: string;
}

export interface CourseRelation {
    id: string;
    curriculum_id: string;
    course_id: string;
    course_code: string;
    related_course_id: string;
    related_course_code: string;
    type: CourseRelationType;
}

export interface CourseRelationsPayload {
    prerequisite_course_ids?: string[];
    prior_course_ids?: string[];
    corequisite_course_ids?: string[];
    recommended_course_ids?: string[];
}

export interface CurriculumRegulation extends BaseRecord {
    curriculum_id: string;
    name: string;
    detail: string | null;
}

export interface CurriculumRegulationPayload {
    name: string;
    detail?: string | null;
}

export interface CurriculumQueryParams extends PageParams {
    search?: string;
}
