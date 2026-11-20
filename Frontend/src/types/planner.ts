/** Hợp đồng `POST /api/plans/solve` (docs/03-thiet-ke.md, mục 6). */
import type { StudentCourseStatus } from './student';

export type PlanSolver = 'cpsat' | 'clingo';
export type PlanStatus = 'OPTIMAL' | 'SAT_NOT_PROVEN_OPTIMAL' | 'UNSAT' | 'TIMEOUT' | 'INPUT_ERROR';
export type PlanCourseReason = 'required' | 'elective' | 'wanted' | 'retake' | 'free_elective';

export interface CourseAtSemester {
    course_code: string;
    semester_code: string;
}

export interface SolvePlanPayload {
    solver?: PlanSolver;
    max_credits?: number;
    semester_limits?: Record<string, { min?: number; max?: number }>;
    graduate_by?: string;
    in_progress_results?: Record<string, 'pass' | 'fail'>;
    locked?: CourseAtSemester[];
    not_offered?: CourseAtSemester[];
    summer_opt_in?: string[];
    preferences?: {
        wanted_courses?: string[];
        balanced_load?: boolean;
        recommendations_first?: boolean;
    };
    student_flags?: { english_grad_reading?: boolean; mos?: boolean };
    use_inferred_relations?: boolean;
    previous_plan?: Record<string, string>;
}

export interface PlanCourse {
    code: string;
    credits: number;
    reason: PlanCourseReason;
    locked: boolean;
}

export interface PlanSemester {
    semester_code: string;
    credits: number;
    courses: PlanCourse[];
}

export interface PlanPreferenceReport {
    id: string;
    detail: string;
    satisfied: boolean;
    broken?: { before: string; course: string }[];
}

export interface PlanResult {
    status: PlanStatus;
    solver: string;
    solve_ms?: number;
    error?: string;
    semesters: PlanSemester[];
    graduation_semester: string | null;
    preferences_report?: PlanPreferenceReport[];
    assumptions?: string[];
    warnings?: string[];
    unverified_prerequisites?: string[];
    inferred_relations?: { course_code: string; related_course_code: string; type: string; inferred_from: string }[];
    relations_snapshot?: string | null;
    violations: string[];
    diff_vs_previous?: string[];
    infeasible_reason?: string | null;
}

/* ------------------------- File tiến độ myBK (giai đoạn 8) ------------------------- */

export interface MybkCurriculumMatch {
    curriculum_id: string;
    code: string;
    name: string;
    cohort: number;
    /** Tỉ lệ môn đã đạt (trong CTĐT) có trong chương trình này, 0..1. */
    coverage: number;
}

export interface MybkCourseRow {
    course_id: string;
    code: string;
    name: string;
    credits: number;
    current_status: StudentCourseStatus | null;
    outside_curriculum?: boolean;
}

/** `POST /api/plans/mybk/preview`: chỉ đọc, không lưu gì. */
export interface MybkPreview {
    file: {
        format: string;
        total_required: number | null;
        total_earned: number | null;
        exported_semester: string | null;
        /** Khóa suy từ 2 chữ số đầu MSSV trong file (chỉ năm). */
        cohort_hint: number | null;
        /** Chỉ PDF: mã chương trình myBK và ngày myBK cập nhật (yyyy-mm-dd). */
        official_program_code: string | null;
        updated_at: string | null;
        checks: { id: string; ok: boolean; detail: string }[];
        /** Số môn file liệt kê (PDF: cả môn chưa đạt) và số môn đã đạt. */
        course_count: number;
        passed_count: number;
        graduation_conditions: { code: string; passed: boolean }[];
        blocks: { name: string; kind: string; required_credits: number; earned_credits: number; course_count: number }[];
        /** Excel chỉ liệt kê môn đã đạt; không biết môn đang học hay rớt. */
        lists_only_passed: boolean;
    };
    detection: {
        method: 'program_code' | 'course_overlap';
        best: MybkCurriculumMatch | null;
        chosen: MybkCurriculumMatch | null;
        candidates: MybkCurriculumMatch[];
        warning: string | null;
    };
    data_check: {
        not_in_curriculum: { code: string; block: string; in_catalog: boolean }[];
        credit_mismatches: { code: string; file_credits: number; web_credits: number }[];
        unknown_codes: string[];
        /** Chỉ PDF: môn chương trình của web có mà file myBK không liệt kê. */
        missing_in_file: string[];
    };
    passed: MybkCourseRow[];
    not_passed: MybkCourseRow[];
}

/* ------------------------- Tiến độ myBK đã lưu (giai đoạn 9, T28–T29) ------------------------- */

/** Một dòng môn trong file PDF tiến độ myBK. Điểm và ghi chú có lưu nhưng trang chưa hiện. */
export interface MybkProgressCourse {
    code: string;
    name: string | null;
    credits?: number;
    passed: boolean;
    free_elective?: boolean;
    score?: string | null;
    letter?: string | null;
    note?: string | null;
}

export interface MybkProgressBlock {
    name: string;
    kind: string;
    required_credits: number;
    earned_credits: number;
    courses: MybkProgressCourse[];
}

/** JSON của `python -m planner.mybk` (PDF) như đã lưu trong database. */
export interface MybkProgressData {
    format: string;
    official_program_code: string | null;
    specialization: string | null;
    total_required: number;
    total_earned: number;
    updated_at: string | null;
    blocks: MybkProgressBlock[];
    graduation_conditions: MybkProgressCourse[];
}

/** `GET /api/plans/mybk/progress`: `data` = null khi chưa tải file. */
export interface MybkProgress {
    imported_at: string | null;
    data: MybkProgressData | null;
}

/** `POST /api/plans/mybk/import`: tiến độ vừa lưu + số môn đã ghi trạng thái. */
export interface MybkImportResult extends MybkProgress {
    written_courses: number;
    unknown_codes: string[];
}
