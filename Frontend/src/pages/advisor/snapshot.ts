import type { Curriculum } from '@/types';
import type { Analysis, CourseCheck, CourseInfo } from '@/pages/courses/analysis/analyze';

/**
 * Bản gọn của kết quả "Phân tích học tập" gửi cho AI làm context.
 * Khóa snake_case khớp `ANALYSIS_SECTIONS` ở `Backend/src/advisor/advisor.tools.ts`.
 */
export type AdvisorSnapshot = Record<string, unknown>;

/** Mỗi khối tự chọn chỉ gửi tối đa chừng này môn ứng viên để giữ request nhỏ. */
const MAX_CANDIDATES = 60;

/** Đề cương rút gọn mỗi môn (vài chục byte): đủ để AI cân tải và nói về cách thi; chi tiết gọi get_course_outline. */
const outline = (info: CourseInfo) => {
    const summary = info.outline;
    if (!summary) return null;
    const exam = summary.final_exam
        ? [summary.final_exam.format, summary.final_exam.duration_minutes ? `${summary.final_exam.duration_minutes} phút` : null].filter(Boolean).join(' ')
        : null;
    return {
        study_hours: summary.total_study_hours ? Math.round(summary.total_study_hours) : null,
        lab: summary.has_lab,
        project: summary.has_project,
        final_exam: exam || null,
    };
};

const course = (info: CourseInfo) => ({
    code: info.code,
    name: info.name,
    credits: info.credits,
    recommended: info.recommendedLabel,
    status: info.status,
    planned: info.plannedSemester,
    specializations: info.specializationCodes,
    last_opened: info.lastOpened,
    outline: outline(info),
});

const check = (row: CourseCheck) => ({
    ...course(row.course),
    elective: row.course.groupId !== null,
    overdue: row.overdue,
    missing: row.missing,
    corequisites: row.corequisites,
    /** Đã từng mở ở kỳ cùng loại (kỳ 1/kỳ 2) với học kỳ tới; `null` là chưa có dữ liệu. */
    offered_same_term: row.offered,
    /** Điều kiện chỉ có trong đề cương (chương trình không khai) mà sinh viên chưa đáp ứng; chỉ để lưu ý. */
    outline_missing: row.outlineMissing.map(item => `${item.type}:${item.code}`),
});

export const buildAdvisorSnapshot = (analysis: Analysis, curriculum: Curriculum, creditTarget: number | null): AdvisorSnapshot => {
    const target = analysis.specializations.find(option => option.isTarget);
    return {
        current: analysis.current,
        next: analysis.next,
        admission_year: analysis.admissionYear,
        study_year: analysis.studyYear,
        standard_graduation: analysis.standardGraduation,
        projected_graduation: analysis.projectedGraduation,
        curriculum: {
            code: curriculum.code,
            name: curriculum.name,
            min_semester_credits: curriculum.min_semester_credits,
            max_semester_credits: curriculum.max_semester_credits,
        },
        profile: {
            credit_target: creditTarget,
            target_specialization: target ? target.specialization.code : null,
        },
        overview: {
            total_credits: analysis.overview.totalCredits,
            completed_credits: analysis.overview.completedCredits,
            in_progress_credits: analysis.overview.inProgressCredits,
            planned_credits: analysis.overview.plannedCredits,
            remaining_credits: analysis.overview.remainingCredits,
            completed_courses: analysis.overview.completedCourses,
            required_courses: analysis.overview.requiredCourses,
            elapsed_semesters: analysis.overview.elapsedSemesters,
            average_per_semester: analysis.overview.averagePerSemester,
            semesters_left: analysis.overview.semestersLeft,
            needed_per_semester: analysis.overview.neededPerSemester,
            capacity: analysis.overview.capacity,
            failed_count: analysis.overview.failedCount,
            undeclared_past: analysis.overview.undeclaredPast,
            outside_uncounted_credits: analysis.overview.outsideUncountedCredits,
            blocks: analysis.blocks.map(block => ({
                name: block.name,
                kind: block.kind,
                need_credits: block.needCredits,
                need_count: block.needCount,
                done: block.done,
                in_progress: block.inProgress,
                planned: block.planned,
                remaining: block.remaining,
            })),
        },
        warnings: analysis.warnings,
        overdue: analysis.overdue.map(check),
        required_left: analysis.requiredLeft.map(check),
        failed: analysis.failed.map(course),
        electives: analysis.electives.map(option => ({
            group: option.group.name,
            remaining_count: option.block.remainingCount,
            remaining_credits: Math.max(0, option.block.needCredits - option.block.done - option.block.inProgress),
            candidate_count: option.candidates.length,
            candidates: option.candidates.slice(0, MAX_CANDIDATES).map(check),
        })),
        specializations: analysis.specializations.map(option => ({
            code: option.specialization.code,
            name: option.specialization.name,
            is_target: option.isTarget,
            need: option.need,
            done_in_list: option.doneInList,
            candidates_left: option.candidatesLeft,
            achievable: option.achievable,
            outside_list: option.outsideList.map(item => item.code),
        })),
        eligible_next: analysis.eligibleNext.map(check),
        blocked_next: analysis.blockedNext.map(check),
        bottlenecks: analysis.bottlenecks.map(item => ({ code: item.course.code, name: item.course.name, unlocks: item.unlocks })),
        roadmap: analysis.roadmap.map(semester => ({
            semester: semester.code,
            credits: semester.credits,
            /** Tổng giờ học tập theo đề cương của `hours_known` môn có đề cương. */
            study_hours: semester.studyHours,
            hours_known: semester.hoursKnown,
            lab_or_project_courses: semester.heavyCount,
            items: semester.items.map(item => ({
                code: item.code,
                name: item.name,
                credits: item.credits,
                kind: item.kind,
                from_plan: item.fromPlan,
                group: item.groupName ?? null,
            })),
        })),
        unplaced: analysis.unplaced.map(item => item.code),
        regulations: analysis.unmetRegulations.map(item => item.name),
        outline_coverage: {
            semester: analysis.next,
            with_outline: analysis.outlineCoverage.withOutline,
            total: analysis.outlineCoverage.total,
        },
    };
};
