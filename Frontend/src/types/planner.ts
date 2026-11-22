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
        /** Sprint 11: thứ tự ưu tiên do sinh viên sắp, chỉ gồm mục đang bật. */
        order?: PlanPriorityId[];
    };
    student_flags?: { english_grad_reading?: boolean; mos?: boolean };
    use_inferred_relations?: boolean;
    previous_plan?: Record<string, string>;
    /** Kỳ sinh viên nghỉ (bảo lưu, đi làm…): môn không ghim không xếp vào (22/11). */
    skip_semesters?: string[];
    /** Kỳ khóa: giữ đúng các môn đã ghim, không xếp thêm (22/11). */
    frozen_semesters?: string[];
    /** Số TC muốn từng kỳ; bộ giải được lệch tới 2 TC và báo lại (22/11). */
    semester_targets?: Record<string, number>;
}

/** Mục ưu tiên sinh viên sắp (sprint 11): S1 ra trường sớm, S6 kế hoạch giảng dạy, S4 môn mình chọn,
 *  S5 đều tải, S10 hạn chế hè, OH lịch sử mở lớp, S3 giữ gần mốc. */
export type PlanPriorityId = 'S1' | 'S6' | 'S4' | 'S5' | 'S10' | 'OH' | 'S3';

/** Một yêu cầu của sinh viên và bộ giải đáp ứng tới đâu (bảng `requests`, 22/11). */
export interface PlanRequest {
    kind: 'pin' | 'target' | 'skip' | 'frozen' | 'wanted' | 'graduate_by' | 'not_offered';
    item: string;
    status: 'met' | 'warning' | 'partial' | 'unmet';
    detail: string;
}

export interface PlanCourse {
    code: string;
    credits: number;
    reason: PlanCourseReason;
    locked: boolean;
    /** Khối tự chọn chứa môn (22/11). */
    block?: string | null;
    /** `true`: môn bộ giải tạm chọn trong khối (sinh viên chưa ghim/chọn) → hiện thành ô khối. */
    slot?: boolean;
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
    /** 22/11: cảnh báo gắn với môn / kỳ, lời nhẹ nhàng; `confirm` = sinh viên tự xác nhận được. */
    warning_items?: PlanWarningItem[];
    unverified_prerequisites?: string[];
    inferred_relations?: { course_code: string; related_course_code: string; type: string; inferred_from: string }[];
    relations_snapshot?: string | null;
    violations: string[];
    diff_vs_previous?: string[];
    infeasible_reason?: string | null;
    /** Mỗi yêu cầu của sinh viên: đáp ứng / trái luật nhưng giữ / một phần / không, kèm lý do. */
    requests?: PlanRequest[];
    /** Chỉ bộ giải Clingo (engine ASP), xem pipeline/planner/ASP-ADAPTER.md mục 6. */
    engine_report?: EngineReport | null;
}

export interface EngineReport {
    objective: { level: string; priority: number; value: number }[];
    gaps: string[];
    gpa: Record<string, number>;
    gpa_required_avg?: number;
    gpa_best_case?: number;
    gpa_already_satisfied?: boolean;
    gpa_requirement_impossible?: boolean;
    majors: { code: string; count: number; earned: boolean }[];
    graduation_blocked: string[];
    external_missed: { requirement: string; year: number }[];
    external_pending: { requirement: string; year: number; missing: number }[];
    offering_misses: { course: string; semester: string; missed_percent: number }[];
    fees: Record<string, number>;
    course_tags?: Record<string, string[]>;
    degree_complete: boolean;
    ready_to_graduate: boolean;
    ground_and_solve_ms?: number;
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
    /** Dòng không có trong file (môn thêm tay trên web, hoặc PE1003/PE1005 suy từ CCGDTC). */
    outside_file?: boolean;
}

export interface MybkProgressBlock {
    name: string;
    kind: string;
    required_credits: number;
    earned_credits: number;
    courses: MybkProgressCourse[];
}

/** Thông tin sinh viên in trên đầu PDF tiến độ (của chính người tải file). */
export interface MybkStudentInfo {
    faculty: string | null;
    full_name: string | null;
    student_number: string | null;
    class_code: string | null;
    applied_from_year: string | null;
    gpa_10: string | null;
    gpa_4: string | null;
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
    student?: MybkStudentInfo;
    checks?: { id: string; ok: boolean; detail: string }[];
}

/** `POST /api/plans/mybk/review` (T32): xem trước file, không ghi gì. */
export interface MybkReview {
    file: MybkProgressData;
    program: {
        official_program_code: string | null;
        matched: {
            id: string; code: string; name: string; cohort: number;
            source_code: string | null; source_version: string | null; total_credits: number | null; course_count: number;
        } | null;
        /** `code` là mã nội bộ của web, không hiện cho người dùng; hiện `source_code` (mã myBK). */
        profile: { id: string; code: string; name: string; source_code?: string | null } | null;
        same_as_profile: boolean;
    };
    /** Mã chứng chỉ myBK tương ứng môn trên web (CCGDTC → PE1003, PE1005); lúc lưu ghi trạng thái theo chứng chỉ. */
    equivalents: { file_code: string; passed: boolean; courses: { code: string; name: string }[] }[];
    conflicts: { id: string; level: 'error' | 'warning' | 'info'; title: string; codes?: string[] }[];
    /** `file: null`: môn đang có trên web mà file không nhắc tới, lưu sẽ xóa (mặc định Chưa học). */
    status_changes: { code: string; name: string; web: string | null; file: string | null }[];
    has_previous_import: boolean;
    can_confirm: boolean;
}

export interface PlanWarningItem {
    kind: 'english' | 'mos' | 'limit' | 'corequisite' | 'low_credits' | string;
    course?: string;
    semester?: string;
    confirm?: 'english' | 'mos';
    /** Câu cũ (trùng một dòng trong `warnings`). */
    text: string;
    /** Lời nhắc ngắn, nhẹ nhàng để hiện trên thẻ. */
    message: string;
}

/** `GET /api/plans/mybk/progress`: `data` = null khi chưa tải file. */
export interface MybkProgress {
    imported_at: string | null;
    data: MybkProgressData | null;
    /** Học kỳ hiện tại (vd "261"): sinh viên khai ở Hiệu chỉnh (`student`) hoặc tính theo ngày (`auto`). */
    current_semester: string;
    current_semester_source: 'student' | 'auto';
    /** Ghi chú riêng của sinh viên theo mã môn (22/11), sửa ở Hiệu chỉnh; khác ghi chú trong file myBK. */
    notes: Record<string, string>;
    /** T46 (22/11): khối sinh viên tự chọn cho môn, {mã môn: id khối}; không có thì theo chương trình. */
    block_choices?: Record<string, string>;
}

/** `PUT /api/plans/mybk/adjustments` (nút Hiệu chỉnh). */
export interface MybkAdjustPayload {
    current_semester?: string;
    items: { course_id: string; status: StudentCourseStatus }[];
    /** Xóa trạng thái các môn này (môn ngoài file thêm nhầm). */
    remove_course_ids?: string[];
    /** Ghi chú riêng của sinh viên; `note` rỗng thì xóa (22/11). */
    notes?: { code: string; note: string }[];
    /** T46: khối sinh viên chọn cho môn; `group_id` null thì về khối mặc định. */
    block_choices?: { code: string; group_id: string | null }[];
}

/** `POST /api/plans/mybk/import`: tiến độ vừa lưu + số môn đã ghi trạng thái. */
export interface MybkImportResult extends MybkProgress {
    written_courses: number;
    unknown_codes: string[];
    /** Chương trình vừa đặt vào hồ sơ (khi gửi `apply_curriculum`). */
    curriculum: { id: string; code: string; name: string; source_code: string | null } | null;
}
