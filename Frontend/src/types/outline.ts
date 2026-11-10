/** Đề cương môn học (khớp `Backend/src/outline` và `Scraper/OUTLINE-FORMAT.md`). */
import type { CourseRelationType } from './curriculum';

export type OutlineText = { vi: string | null; en: string | null } | null;

export interface OutlineCodeName {
    code: string | null;
    name: OutlineText;
}

export interface OutlineExam {
    format: OutlineCodeName | null;
    duration_minutes: number | null;
}

/** Khóa thành phần khối lượng/đánh giá; chỉ có các khóa khác 0. */
export type OutlineComponentKey =
    | 'theory' | 'exercise' | 'lab' | 'assignment' | 'project' | 'thesis' | 'thesis_proposal'
    | 'internship' | 'field_trip' | 'self_study' | 'other' | 'midterm' | 'final_exam' | 'theory_other';

export type OutlineComponents = Partial<Record<OutlineComponentKey, number>>;

export interface OutlineOutcome {
    /** Duy nhất trong đề cương: "<hệ>:<mã>", ví dụ "LO:L.O.1.1". */
    key: string;
    code: string;
    level: number;
    parent_code: string | null;
    framework: string;
    name: OutlineText;
    description: OutlineText;
    note: string | null;
}

export interface OutlineActivity {
    code: string;
    level: number;
    parent_code: string | null;
    category: OutlineCodeName | null;
    name: OutlineText;
    description: OutlineText;
}

export interface OutlineSessionItem {
    outcome_key: string | null;
    lecturer_activity: OutlineText;
    student_activity: OutlineText;
    assessment_codes: string[];
}

export interface OutlineSession {
    order: number;
    label: string | null;
    content: OutlineText;
    items: OutlineSessionItem[];
}

export interface OutlineContent {
    course_code: string;
    version: string;
    applies_from: string | null;
    updated_at: string | null;
    name: OutlineText;
    credits: number;
    credits_ects: number | null;
    level: OutlineCodeName | null;
    course_type: OutlineCodeName | null;
    is_graduation_course: boolean;
    faculty: { code: string | null; name: OutlineText } | null;
    department: { code: string | null; name: OutlineText } | null;
    programs: OutlineCodeName[];
    knowledge_blocks: string[];
    teaching_methods: OutlineCodeName[];
    objectives: OutlineText;
    summary: OutlineText;
    references: OutlineText;
    study_guide: OutlineText;
    notes: OutlineText;
    credit_breakdown: OutlineComponents;
    hours: { total_periods: number | null; total_study_hours: number | null; breakdown: OutlineComponents };
    assessment: {
        weights: OutlineComponents;
        includes: string[];
        midterm: OutlineExam | null;
        final_exam: OutlineExam | null;
        other: OutlineExam | null;
    };
    learning_outcomes: OutlineOutcome[];
    assessment_activities: OutlineActivity[];
    outcome_assessments: { outcome_key: string; activity_codes: string[] }[];
    sessions: OutlineSession[];
}

/** Thông tin một phiên bản (không kèm nội dung). */
export interface CourseOutlineVersion {
    id: string;
    course_code: string;
    version: string;
    applies_from: string | null;
    source_id: string | null;
    source_code: string | null;
    source_updated_at: string | null;
    name_vi: string | null;
    name_en: string | null;
    credits: number | null;
    level_code: string | null;
    course_type_code: string | null;
    faculty_code: string | null;
    created_at: string;
    updated_at: string;
}

export interface CourseOutlinePrerequisite {
    id: string;
    outline_id: string;
    type: CourseRelationType | null;
    type_raw: string | null;
    related_course_code: string;
}

export interface CourseOutlineDetail extends CourseOutlineVersion {
    content: OutlineContent;
    prerequisites: CourseOutlinePrerequisite[];
}

export interface CourseOutlineByCode {
    course_code: string;
    semester: string;
    /** Bản áp dụng cho `semester`; `null` khi môn chỉ có bản áp dụng từ học kỳ sau. */
    selected: CourseOutlineDetail | null;
    versions: CourseOutlineVersion[];
}

/** Tóm tắt đề cương của một môn cho trang Phân tích học tập (`GET /course-outlines/summaries`). */
export interface OutlineSummary {
    course_code: string;
    outline_id: string;
    version: string;
    applies_from: string | null;
    credits: number | null;
    total_periods: number | null;
    total_study_hours: number | null;
    has_lab: boolean;
    has_project: boolean;
    has_assignment: boolean;
    weights: OutlineComponents;
    midterm: { format: string | null; duration_minutes: number | null } | null;
    final_exam: { format: string | null; duration_minutes: number | null } | null;
    prerequisites: { type: CourseRelationType | null; related_course_code: string }[];
}

export interface OutlineSummaries {
    semester: string;
    items: OutlineSummary[];
}
