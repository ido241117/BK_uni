/** Hợp đồng `POST /api/plans/solve` (docs/2026-11-18-luong-du-lieu-bo-giai.md, mục 1.4 và 5). */

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
