import {
    COURSE_GROUP_SCOPE,
    COURSE_RELATION_TYPE,
    COURSE_RELATION_TYPE_LABEL,
    STUDENT_COURSE_STATUS,
    STUDENT_REGULATION_STATUS,
    type CourseGroup,
    type CourseRelation,
    type Curriculum,
    type CurriculumCourse,
    type CurriculumOpenedSemester,
    type CurriculumRegulation,
    type CourseRelationType,
    type CurriculumSpecialization,
    type OutlineSummary,
    type StudentCourse,
    type StudentCourseStatus,
    type StudentPlanCourse,
    type StudentProfile,
    type StudentRegulationStatusRecord,
} from '@/types';
import {
    computeCurriculumBlocks,
    groupRequiredCount,
    type CompletedCourse,
    type CurriculumBlockProgress,
} from '@/utils/curriculum-credits';
import {
    countMainSemesters,
    currentSemester,
    nextMainSemester,
    parseSemester,
    recommendedSemester,
    toSemesterCode,
} from './semester';

export interface AnalysisInput {
    today?: Date;
    curriculum: Curriculum;
    profile: StudentProfile;
    courses: CurriculumCourse[];
    groups: CourseGroup[];
    specializations: CurriculumSpecialization[];
    relations: CourseRelation[];
    statuses: StudentCourse[];
    plan: StudentPlanCourse[];
    opened: CurriculumOpenedSemester[];
    regulations: CurriculumRegulation[];
    regulationStatuses: StudentRegulationStatusRecord[];
    /** Tóm tắt đề cương (bản áp dụng cho học kỳ tới) theo mã môn; thiếu thì bỏ qua phần dựa trên đề cương. */
    outlines?: OutlineSummary[];
}

/** Một môn của chương trình kèm mọi dữ liệu của sinh viên liên quan tới môn đó. */
export interface CourseInfo {
    id: string;
    code: string;
    name: string;
    credits: number;
    /** `null` với môn thuộc pool tự chọn (không xếp kỳ cố định). */
    recommendedSemester: string | null;
    recommendedLabel: string | null;
    status: StudentCourseStatus | null;
    plannedSemester: string | null;
    /** Khối tự chọn gốc chứa môn; `null` là môn bắt buộc. */
    groupId: string | null;
    openedSemesters: string[];
    lastOpened: string | null;
    /** Mã chuyên ngành có môn này trong danh sách. */
    specializationCodes: string[];
    /** Đề cương áp dụng cho học kỳ tới; `null` khi chưa có. */
    outline: OutlineSummary | null;
}

/** Điều kiện chỉ có trong đề cương (chương trình không khai) mà sinh viên chưa đáp ứng. */
export interface OutlineCondition {
    code: string;
    type: CourseRelationType;
}

export interface CourseCheck {
    course: CourseInfo;
    /** Mã các môn còn thiếu để được học (tiên quyết/học trước). */
    missing: string[];
    /** Môn song hành chưa học: phải học cùng kỳ. */
    corequisites: string[];
    /** `true` mở ở kỳ đó, `false` chưa từng mở ở kỳ đó, `null` không có dữ liệu mở lớp. */
    offered: boolean | null;
    overdue: boolean;
    /**
     * Chỉ để lưu ý, KHÔNG chặn đăng ký: điều kiện kiểm tra theo chương trình đào tạo (`missing`);
     * đây là điều kiện đề cương ghi thêm mà chương trình không có.
     */
    outlineMissing: OutlineCondition[];
}

export interface BlockRow {
    key: string;
    name: string;
    kind: 'required' | 'listed' | 'any';
    needCredits: number;
    needCount: number;
    doneCount: number;
    done: number;
    inProgress: number;
    planned: number;
    remaining: number;
    remainingCount: number;
}

export interface TimelineColumn {
    code: string;
    label: string;
    done: number;
    inProgress: number;
    planned: number;
    remaining: number;
    isPast: boolean;
    isCurrent: boolean;
}

export interface ElectiveOption {
    block: BlockRow;
    group: CourseGroup;
    candidates: CourseCheck[];
}

export interface SpecializationOption {
    specialization: CurriculumSpecialization;
    isTarget: boolean;
    need: number;
    doneInList: number;
    /** Môn của khối gốc đã học/đang học nhưng không thuộc danh sách chuyên ngành. */
    outsideList: CourseInfo[];
    candidatesLeft: number;
    achievable: boolean;
}

export interface RoadmapItem {
    key: string;
    code: string;
    name: string;
    credits: number;
    /** Môn sinh viên đã tự xếp vào kỳ này. */
    fromPlan: boolean;
    kind: 'required' | 'elective' | 'free' | 'outside';
    groupName?: string;
}

export interface RoadmapSemester {
    code: string;
    items: RoadmapItem[];
    credits: number;
    /** Tổng giờ học tập theo đề cương của các môn có đề cương trong kỳ. */
    studyHours: number;
    /** Số môn trong kỳ có số giờ học tập từ đề cương. */
    hoursKnown: number;
    /** Số môn có thí nghiệm hoặc đồ án/luận văn/thực tập (theo đề cương). */
    heavyCount: number;
}

export interface Warning {
    level: 'error' | 'warning' | 'info';
    title: string;
    detail: string;
}

export interface Bottleneck {
    course: CourseInfo;
    unlocks: string[];
}

export interface Analysis {
    current: string;
    next: string;
    admissionYear: number;
    studyYear: number;
    standardGraduation: string;
    overview: {
        totalCredits: number;
        completedCredits: number;
        inProgressCredits: number;
        plannedCredits: number;
        remainingCredits: number;
        requiredCourses: number;
        completedCourses: number;
        elapsedSemesters: number;
        averagePerSemester: number | null;
        semestersLeft: number;
        neededPerSemester: number | null;
        capacity: number;
        failedCount: number;
        undeclaredPast: number;
        outsideUncountedCredits: number;
    };
    blocks: BlockRow[];
    timeline: TimelineColumn[];
    overdue: CourseCheck[];
    requiredLeft: CourseCheck[];
    failed: CourseInfo[];
    electives: ElectiveOption[];
    specializations: SpecializationOption[];
    eligibleNext: CourseCheck[];
    blockedNext: CourseCheck[];
    bottlenecks: Bottleneck[];
    roadmap: RoadmapSemester[];
    unplaced: CourseInfo[];
    projectedGraduation: string | null;
    warnings: Warning[];
    unmetRegulations: CurriculumRegulation[];
    regulationCount: number;
    /** Số môn của chương trình có đề cương / tổng số môn. */
    outlineCoverage: { withOutline: number; total: number };
}

/** Kỳ có từ chừng này môn thí nghiệm/đồ án trở lên thì cảnh báo nặng. */
const HEAVY_COURSES_PER_SEMESTER = 3;

const MAX_ROADMAP_SEMESTERS = 14;

/** Thứ tự ưu tiên: môn có kỳ khuyến nghị sớm trước, môn pool tự chọn sau, rồi theo mã. */
const byRecommended = (a: CourseInfo, b: CourseInfo) => (
    (a.recommendedSemester ?? '999').localeCompare(b.recommendedSemester ?? '999') || a.code.localeCompare(b.code)
);

export const analyzeStudent = (input: AnalysisInput): Analysis => {
    const { curriculum, profile } = input;
    const current = currentSemester(input.today);
    const next = nextMainSemester(current);
    const currentParts = parseSemester(current)!;
    const admissionYear = profile.admission_year ?? curriculum.cohort;
    const studyYear = currentParts.year - admissionYear + 1;
    const standardGraduation = toSemesterCode(admissionYear + curriculum.duration_years - 1, 2);

    /* ------------------------------ Chỉ mục dữ liệu ------------------------------ */

    const statusById = new Map(input.statuses.map(item => [item.course_id, item.status]));
    const planById = new Map(input.plan.map(item => [item.course_id, item.semester_code]));
    const openedById = new Map<string, string[]>();
    input.opened.forEach(item => openedById.set(item.course_id, [...(openedById.get(item.course_id) ?? []), item.semester_code]));

    const rootGroups = input.groups.filter(group => group.specialization_id === null);
    const listedGroups = rootGroups.filter(group => group.pool_scope === COURSE_GROUP_SCOPE.LISTED);
    const groupById = new Map(rootGroups.map(group => [group.id, group]));
    const groupIdByCourse = new Map<string, string>();
    listedGroups.forEach(group => group.members.forEach(member => {
        if (!groupIdByCourse.has(member.course_id)) groupIdByCourse.set(member.course_id, group.id);
    }));

    const specCodesByCourse = new Map<string, string[]>();
    input.specializations.forEach(spec => spec.groups.forEach(group => group.members.forEach(member => {
        const codes = specCodesByCourse.get(member.course_id) ?? [];
        if (!codes.includes(spec.code)) specCodesByCourse.set(member.course_id, [...codes, spec.code]);
    })));

    const outlineByCode = new Map((input.outlines ?? []).map(outline => [outline.course_code.toUpperCase(), outline]));

    const info = new Map<string, CourseInfo>();
    input.courses.forEach(item => {
        const opened = (openedById.get(item.course_id) ?? []).sort();
        const hasSchedule = item.recommended_year !== null && item.recommended_term !== null;
        info.set(item.course_id, {
            id: item.course_id,
            code: item.course.code,
            name: item.course.name,
            credits: item.course.credits,
            recommendedSemester: hasSchedule
                ? recommendedSemester(admissionYear, item.recommended_year!, item.recommended_term!)
                : null,
            recommendedLabel: hasSchedule ? `Năm ${item.recommended_year} · Kỳ ${item.recommended_term}` : null,
            status: statusById.get(item.course_id) ?? null,
            plannedSemester: planById.get(item.course_id) ?? null,
            groupId: groupIdByCourse.get(item.course_id) ?? null,
            openedSemesters: opened,
            lastOpened: opened.at(-1) ?? null,
            specializationCodes: specCodesByCourse.get(item.course_id) ?? [],
            outline: outlineByCode.get(item.course.code.toUpperCase()) ?? null,
        });
    });
    const codeOf = (id: string) => info.get(id)?.code ?? '?';
    // Đề cương ghi điều kiện bằng mã môn: tra id qua chương trình và các môn sinh viên đã khai (kể cả ngoài chương trình).
    const idByCode = new Map<string, string>();
    input.statuses.forEach(item => { if (item.course?.code) idByCode.set(item.course.code.toUpperCase(), item.course_id); });
    info.forEach(course => idByCode.set(course.code.toUpperCase(), course.id));

    const isStatus = (id: string, ...statuses: StudentCourseStatus[]) => {
        const status = statusById.get(id);
        return status !== undefined && statuses.includes(status);
    };
    const completed = new Set(input.statuses.filter(item => item.status === STUDENT_COURSE_STATUS.COMPLETED).map(item => item.course_id));
    const inProgress = new Set(input.statuses.filter(item => item.status === STUDENT_COURSE_STATUS.IN_PROGRESS).map(item => item.course_id));
    const studied = new Set(input.statuses
        .filter(item => item.status !== STUDENT_COURSE_STATUS.NOT_STARTED)
        .map(item => item.course_id));

    /** Quan hệ cứng của từng môn (TQ, HT, SHT); "khuyến nghị" không chặn việc đăng ký. */
    const relationsByCourse = new Map<string, CourseRelation[]>();
    input.relations.forEach(relation => {
        if (relation.type === COURSE_RELATION_TYPE.RECOMMENDED) return;
        relationsByCourse.set(relation.course_id, [...(relationsByCourse.get(relation.course_id) ?? []), relation]);
    });

    /**
     * Kiểm tra điều kiện học một môn.
     * @param passed môn coi như đã đạt (thỏa tiên quyết)
     * @param taken môn coi như đã học, kể cả chưa đạt (thỏa học trước / song hành)
     */
    const checkCourse = (course: CourseInfo, passed: Set<string>, taken: Set<string>, term: number): CourseCheck => {
        const missing: string[] = [];
        const corequisites: string[] = [];
        (relationsByCourse.get(course.id) ?? []).forEach(relation => {
            const related = relation.related_course_id;
            if (relation.type === COURSE_RELATION_TYPE.PREREQUISITE && !passed.has(related)) missing.push(codeOf(related));
            if (relation.type === COURSE_RELATION_TYPE.PRIOR && !taken.has(related)) missing.push(codeOf(related));
            if (relation.type === COURSE_RELATION_TYPE.COREQUISITE && !taken.has(related)) corequisites.push(codeOf(related));
        });
        const offered = course.openedSemesters.length
            ? course.openedSemesters.some(code => parseSemester(code)?.term === term)
            : null;

        // Điều kiện chỉ có trong đề cương: chương trình đã khai quan hệ với môn đó thì theo chương trình.
        const declared = new Set((relationsByCourse.get(course.id) ?? []).map(relation => codeOf(relation.related_course_id).toUpperCase()));
        const outlineMissing: OutlineCondition[] = [];
        (course.outline?.prerequisites ?? []).forEach(item => {
            const code = item.related_course_code.toUpperCase();
            if (!item.type || item.type === COURSE_RELATION_TYPE.RECOMMENDED || declared.has(code)) return;
            const id = idByCode.get(code);
            const satisfied = item.type === COURSE_RELATION_TYPE.PREREQUISITE
                ? Boolean(id && passed.has(id))
                : Boolean(id && taken.has(id));
            if (!satisfied && !outlineMissing.some(existing => existing.code === code)) outlineMissing.push({ code, type: item.type });
        });

        return {
            course,
            missing: [...new Set(missing)],
            corequisites: [...new Set(corequisites)],
            offered,
            overdue: course.recommendedSemester !== null && course.recommendedSemester < current,
            outlineMissing,
        };
    };

    /* ------------------------------ Tiến độ theo khối ------------------------------ */

    const toCredited = (ids: Iterable<string>): CompletedCourse[] => [...ids].map(id => {
        const declared = input.statuses.find(item => item.course_id === id)?.course
            ?? input.plan.find(item => item.course_id === id)?.course;
        return { course_id: id, credits: info.get(id)?.credits ?? declared?.credits ?? 0 };
    });
    const plannedIds = input.plan.map(item => item.course_id).filter(id => !completed.has(id) && !inProgress.has(id));

    const blocksDone = computeCurriculumBlocks(input.courses, input.groups, toCredited(completed));
    const blocksProgress = computeCurriculumBlocks(input.courses, input.groups, toCredited([...completed, ...inProgress]));
    const blocksPlanned = computeCurriculumBlocks(
        input.courses,
        input.groups,
        toCredited([...completed, ...inProgress, ...plannedIds]),
    );

    const blockName = (block: CurriculumBlockProgress) => block.group?.name ?? 'Môn bắt buộc';
    const blocks: BlockRow[] = blocksDone.map((block, index) => {
        const progress = blocksProgress[index];
        const planned = blocksPlanned[index];
        return {
            key: block.group?.id ?? 'required',
            name: blockName(block),
            kind: block.group === null ? 'required' : block.group.pool_scope === COURSE_GROUP_SCOPE.ANY ? 'any' : 'listed',
            needCredits: block.needCredits,
            needCount: block.needCount,
            doneCount: block.doneCount,
            done: block.doneCredits,
            inProgress: Math.max(0, progress.doneCredits - block.doneCredits),
            planned: Math.max(0, planned.doneCredits - progress.doneCredits),
            remaining: Math.max(0, block.needCredits - planned.doneCredits),
            remainingCount: Math.max(0, block.needCount - progress.doneCount),
        };
    });
    const sum = (key: keyof Pick<BlockRow, 'needCredits' | 'done' | 'inProgress' | 'planned' | 'remaining' | 'needCount' | 'doneCount'>) =>
        blocks.reduce((total, block) => total + block[key], 0);

    // Môn đã hoàn thành nhưng không được tính (ngoài chương trình, hoặc dư so với khối).
    const countedDone = new Set(blocksDone.flatMap(block => block.countedCourseIds));
    const outsideUncountedCredits = toCredited(completed)
        .filter(course => !countedDone.has(course.course_id))
        .reduce((total, course) => total + course.credits, 0);

    /* ------------------------------ Khung chương trình ------------------------------ */

    const timelineMap = new Map<string, TimelineColumn>();
    input.courses.forEach(item => {
        const course = info.get(item.course_id)!;
        if (!course.recommendedSemester || course.groupId) return;
        const column = timelineMap.get(course.recommendedSemester) ?? {
            code: course.recommendedSemester,
            label: `N${item.recommended_year}·K${item.recommended_term}`,
            done: 0, inProgress: 0, planned: 0, remaining: 0,
            isPast: course.recommendedSemester < current,
            isCurrent: course.recommendedSemester === current,
        };
        if (completed.has(course.id)) column.done += course.credits;
        else if (inProgress.has(course.id)) column.inProgress += course.credits;
        else if (course.plannedSemester) column.planned += course.credits;
        else column.remaining += course.credits;
        timelineMap.set(course.recommendedSemester, column);
    });
    const timeline = [...timelineMap.values()].sort((a, b) => a.code.localeCompare(b.code));

    /* ------------------------------ Môn còn thiếu ------------------------------ */

    const nextTerm = parseSemester(next)!.term;
    const passedForNext = new Set([...completed, ...inProgress]);
    const takenForNext = new Set([...studied]);

    const standaloneLeft = [...info.values()]
        .filter(course => !course.groupId && !completed.has(course.id) && !inProgress.has(course.id))
        .sort(byRecommended)
        .map(course => checkCourse(course, passedForNext, takenForNext, nextTerm));
    const overdue = standaloneLeft.filter(check => check.overdue);
    const requiredLeft = standaloneLeft.filter(check => !check.overdue);
    const failed = [...info.values()].filter(course => isStatus(course.id, STUDENT_COURSE_STATUS.FAILED)).sort(byRecommended);

    /* ------------------------------ Lựa chọn tự chọn ------------------------------ */

    const electives: ElectiveOption[] = [];
    blocks.forEach((block, index) => {
        const group = blocksDone[index].group;
        if (!group || group.pool_scope !== COURSE_GROUP_SCOPE.LISTED) return;
        if (block.remainingCount === 0 && blocksProgress[index].doneCredits >= block.needCredits) return;
        const candidates = group.members
            .map(member => info.get(member.course_id))
            .filter((course): course is CourseInfo => Boolean(course) && course!.groupId === group.id)
            .filter(course => !completed.has(course.id) && !inProgress.has(course.id))
            .map(course => checkCourse(course, passedForNext, takenForNext, nextTerm))
            .sort((a, b) => (
                a.missing.length - b.missing.length
                || Number(b.offered === true) - Number(a.offered === true)
                || b.course.openedSemesters.length - a.course.openedSemesters.length
                || a.course.code.localeCompare(b.course.code)
            ));
        electives.push({ block, group, candidates });
    });

    /* ------------------------------ Chuyên ngành ------------------------------ */

    const specializations: SpecializationOption[] = input.specializations.map(specialization => {
        let need = 0;
        let doneInList = 0;
        let candidatesLeft = 0;
        let achievable = true;
        const outsideList: CourseInfo[] = [];
        specialization.groups.forEach(child => {
            const parent = child.parent_group_id ? groupById.get(child.parent_group_id) : undefined;
            if (!parent) return;
            const childNeed = groupRequiredCount(parent);
            const listIds = new Set(child.members.map(member => member.course_id));
            const takenInParent = parent.members
                .map(member => member.course_id)
                .filter(id => completed.has(id) || inProgress.has(id));
            const inList = takenInParent.filter(id => listIds.has(id)).length;
            takenInParent.filter(id => !listIds.has(id)).forEach(id => outsideList.push(info.get(id)!));
            const left = child.members.filter(member => !completed.has(member.course_id) && !inProgress.has(member.course_id)).length;
            need += childNeed;
            doneInList += Math.min(inList, childNeed);
            candidatesLeft += left;
            if (childNeed - Math.min(inList, childNeed) > left) achievable = false;
        });
        return {
            specialization,
            isTarget: specialization.id === profile.target_specialization_id,
            need,
            doneInList,
            outsideList,
            candidatesLeft,
            achievable: achievable && outsideList.length === 0,
        };
    }).sort((a, b) => Number(b.isTarget) - Number(a.isTarget) || (b.doneInList / (b.need || 1)) - (a.doneInList / (a.need || 1)));

    /* ------------------------------ Học kỳ tới ------------------------------ */

    const nextCandidates = [...standaloneLeft, ...electives.flatMap(option => option.candidates)];
    const eligibleNext = nextCandidates.filter(check => check.missing.length === 0 && check.offered !== false);
    const blockedNext = nextCandidates.filter(check => check.missing.length > 0);

    /* ------------------------------ Môn "nút thắt" ------------------------------ */

    const dependents = new Map<string, Set<string>>();
    input.relations.forEach(relation => {
        if (relation.type !== COURSE_RELATION_TYPE.PREREQUISITE && relation.type !== COURSE_RELATION_TYPE.PRIOR) return;
        const set = dependents.get(relation.related_course_id) ?? new Set<string>();
        set.add(relation.course_id);
        dependents.set(relation.related_course_id, set);
    });
    const unlocksOf = (id: string): string[] => {
        const seen = new Set<string>();
        const stack = [...(dependents.get(id) ?? [])];
        while (stack.length) {
            const dependent = stack.pop()!;
            if (seen.has(dependent) || completed.has(dependent)) continue;
            seen.add(dependent);
            stack.push(...(dependents.get(dependent) ?? []));
        }
        return [...seen].map(codeOf).sort();
    };
    const bottlenecks = [...info.values()]
        .filter(course => !completed.has(course.id))
        .map(course => ({ course, unlocks: unlocksOf(course.id) }))
        .filter(item => item.unlocks.length > 0)
        .sort((a, b) => b.unlocks.length - a.unlocks.length || byRecommended(a.course, b.course))
        .slice(0, 8);

    /* ------------------------------ Lộ trình đề xuất ------------------------------ */

    const capacity = Math.min(
        curriculum.max_semester_credits,
        Math.max(curriculum.min_semester_credits, profile.credit_target ?? curriculum.max_semester_credits),
    );
    const targetSpec = input.specializations.find(spec => spec.id === profile.target_specialization_id);
    const targetListIds = new Set(targetSpec?.groups.flatMap(group => group.members.map(member => member.course_id)) ?? []);

    // Môn tự chọn cần chọn thêm: ưu tiên môn đã lên kế hoạch, môn của chuyên ngành mục tiêu, môn hay mở lớp.
    const electivePicks: { course: CourseInfo; groupName: string }[] = [];
    blocks.forEach((block, index) => {
        const group = blocksDone[index].group;
        if (!group || group.pool_scope !== COURSE_GROUP_SCOPE.LISTED) return;
        const progress = blocksProgress[index];
        let count = progress.doneCount;
        let credits = progress.doneCredits;
        const ranked = (electives.find(option => option.group.id === group.id)?.candidates ?? [])
            .map(check => check.course)
            .sort((a, b) => (
                Number(Boolean(b.plannedSemester)) - Number(Boolean(a.plannedSemester))
                || Number(targetListIds.has(b.id)) - Number(targetListIds.has(a.id))
                || b.openedSemesters.length - a.openedSemesters.length
                || a.code.localeCompare(b.code)
            ));
        for (const course of ranked) {
            if (count >= block.needCount && credits >= block.needCredits) break;
            electivePicks.push({ course, groupName: group.name });
            count += 1;
            credits += course.credits;
        }
    });

    interface Pending { item: RoadmapItem; course: CourseInfo | null; waited: number }
    const pending: Pending[] = [
        ...standaloneLeft.map(check => ({
            item: { key: check.course.id, code: check.course.code, name: check.course.name, credits: check.course.credits, fromPlan: false, kind: 'required' as const },
            course: check.course,
            waited: 0,
        })),
        ...electivePicks.map(({ course, groupName }) => ({
            item: { key: course.id, code: course.code, name: course.name, credits: course.credits, fromPlan: false, kind: 'elective' as const, groupName },
            course,
            waited: 0,
        })),
    ];
    // Tự chọn tự do: chưa biết môn cụ thể nên xếp chỗ trống theo số tín chỉ còn thiếu.
    blocks.forEach((block, index) => {
        const group = blocksDone[index].group;
        if (!group || group.pool_scope !== COURSE_GROUP_SCOPE.ANY) return;
        const unit = group.pool_course_credits ?? 3;
        let left = Math.max(0, block.needCredits - block.done - block.inProgress);
        let n = 0;
        while (left > 0) {
            n += 1;
            pending.push({
                item: { key: `${group.id}-${n}`, code: '—', name: `${group.name} (môn tự chọn bất kỳ)`, credits: unit, fromPlan: false, kind: 'free', groupName: group.name },
                course: null,
                waited: 0,
            });
            left -= unit;
        }
    });

    // Môn sinh viên đã xếp vào học kỳ tương lai được giữ nguyên kỳ.
    const fixedBySemester = new Map<string, RoadmapItem[]>();
    input.plan.forEach(entry => {
        if (completed.has(entry.course_id) || inProgress.has(entry.course_id) || entry.semester_code < next) return;
        const course = info.get(entry.course_id);
        const item: RoadmapItem = {
            key: entry.course_id,
            code: entry.course.code,
            name: entry.course.name,
            credits: entry.course.credits,
            fromPlan: true,
            kind: course ? (course.groupId ? 'elective' : 'required') : 'outside',
            groupName: course?.groupId ? groupById.get(course.groupId)?.name : undefined,
        };
        fixedBySemester.set(entry.semester_code, [...(fixedBySemester.get(entry.semester_code) ?? []), item]);
        // Môn tự do ngoài chương trình đã lên kế hoạch thay cho một chỗ trống tự chọn tự do.
        if (!course) {
            const freeIndex = pending.findIndex(candidate => candidate.item.kind === 'free');
            if (freeIndex >= 0) pending.splice(freeIndex, 1);
        }
    });
    const fixedIds = new Set([...fixedBySemester.values()].flat().map(item => item.key));
    const queue = pending.filter(entry => !fixedIds.has(entry.item.key));

    const unlockCount = new Map([...info.keys()].map(id => [id, unlocksOf(id).length]));
    const priority = (entry: Pending) => {
        if (!entry.course) return 'zzzz';
        const unlock = String(99 - Math.min(99, unlockCount.get(entry.course.id) ?? 0)).padStart(2, '0');
        return `${entry.course.recommendedSemester ?? '900'}-${unlock}-${entry.course.code}`;
    };
    queue.sort((a, b) => priority(a).localeCompare(priority(b)));

    const passedPlan = new Set([...completed, ...inProgress]);
    const takenPlan = new Set([...studied]);
    const roadmap: RoadmapSemester[] = [];
    let semester = next;
    let idle = 0;
    while ((queue.length || [...fixedBySemester.keys()].some(code => code >= semester)) && roadmap.length < MAX_ROADMAP_SEMESTERS && idle < 3) {
        const term = parseSemester(semester)!.term;
        const items = [...(fixedBySemester.get(semester) ?? [])];
        let credits = items.reduce((total, item) => total + item.credits, 0);
        const placedNow: string[] = items.map(item => item.key);
        // Kỳ hè chỉ giữ môn sinh viên tự xếp, không tự thêm môn.
        for (let index = 0; term !== 3 && index < queue.length;) {
            const entry = queue[index];
            const fits = credits + entry.item.credits <= capacity || (items.length === 0 && entry.item.credits > capacity);
            let ok = fits;
            if (ok && entry.course) {
                const check = checkCourse(entry.course, passedPlan, takenPlan, term);
                const coreqOk = check.corequisites.every(code => placedNow.some(id => info.get(id)?.code === code));
                // Môn chưa từng mở ở kỳ này: chờ kỳ khác, trừ khi đã chờ quá lâu (dữ liệu mở lớp có thể thiếu).
                ok = check.missing.length === 0 && coreqOk && (check.offered !== false || entry.waited >= 3);
            }
            if (ok) {
                items.push(entry.item);
                placedNow.push(entry.item.key);
                credits += entry.item.credits;
                queue.splice(index, 1);
            } else {
                entry.waited += 1;
                index += 1;
            }
        }
        placedNow.forEach(id => { passedPlan.add(id); takenPlan.add(id); });
        const outlines = items.map(item => info.get(item.key)?.outline).filter((outline): outline is OutlineSummary => Boolean(outline));
        roadmap.push({
            code: semester,
            items,
            credits,
            studyHours: Math.round(outlines.reduce((total, outline) => total + (outline.total_study_hours ?? 0), 0)),
            hoursKnown: outlines.filter(outline => outline.total_study_hours).length,
            heavyCount: outlines.filter(outline => outline.has_lab || outline.has_project).length,
        });
        idle = items.length ? 0 : idle + 1;
        // Kỳ hè chỉ xuất hiện khi sinh viên đã tự xếp môn vào đó.
        const parts = parseSemester(semester)!;
        const summer = toSemesterCode(parts.year, 3);
        semester = parts.term === 2 && fixedBySemester.has(summer) ? summer : nextMainSemester(semester);
    }
    while (roadmap.length && roadmap.at(-1)!.items.length === 0) roadmap.pop();
    const unplaced = queue.map(entry => entry.course).filter((course): course is CourseInfo => Boolean(course));
    const projectedGraduation = queue.length ? null : roadmap.at(-1)?.code ?? (sum('remaining') === 0 ? current : null);

    /* ------------------------------ Nhịp học ------------------------------ */

    const completedCredits = sum('done');
    const elapsedSemesters = Math.max(0, countMainSemesters(toSemesterCode(admissionYear, 1), current) - 1);
    const semestersLeft = countMainSemesters(next, standardGraduation);
    const leftAfterProgress = Math.max(0, sum('needCredits') - completedCredits - sum('inProgress'));

    /* ------------------------------ Cảnh báo ------------------------------ */

    const warnings: Warning[] = [];
    if (overdue.length) {
        warnings.push({
            level: 'error',
            title: `${overdue.length} môn bắt buộc đã quá kỳ khuyến nghị`,
            detail: `${overdue.slice(0, 8).map(check => check.course.code).join(', ')}${overdue.length > 8 ? '…' : ''}. Nên ưu tiên đăng ký sớm, nhất là môn là điều kiện của môn khác.`,
        });
    }
    if (failed.length) {
        warnings.push({
            level: 'error',
            title: `${failed.length} môn chưa đạt cần học lại`,
            detail: failed.map(course => course.code).join(', '),
        });
    }
    if (semestersLeft > 0 && leftAfterProgress / semestersLeft > curriculum.max_semester_credits) {
        warnings.push({
            level: 'error',
            title: 'Không kịp tốt nghiệp đúng hạn với mức tín chỉ tối đa',
            detail: `Còn ${leftAfterProgress} TC trong ${semestersLeft} học kỳ chính (≈ ${(leftAfterProgress / semestersLeft).toFixed(1)} TC/kỳ), vượt mức ${curriculum.max_semester_credits} TC/kỳ. Cân nhắc học kỳ hè.`,
        });
    }
    const plannedBySemester = new Map<string, StudentPlanCourse[]>();
    input.plan.forEach(entry => plannedBySemester.set(entry.semester_code, [...(plannedBySemester.get(entry.semester_code) ?? []), entry]));
    const planPassed = new Set([...completed, ...inProgress]);
    const planTaken = new Set([...studied]);
    [...plannedBySemester.keys()].sort().forEach(code => {
        const entries = plannedBySemester.get(code)!;
        const term = parseSemester(code)?.term ?? 1;
        entries.forEach(entry => {
            const course = info.get(entry.course_id);
            if (completed.has(entry.course_id)) {
                warnings.push({ level: 'warning', title: `${entry.course.code} đã hoàn thành nhưng vẫn nằm trong kế hoạch HK ${code}`, detail: 'Có thể xoá khỏi kế hoạch để giải phóng tín chỉ.' });
                return;
            }
            if (code < current && !inProgress.has(entry.course_id)) {
                warnings.push({ level: 'warning', title: `${entry.course.code} xếp ở HK ${code} đã qua`, detail: 'Môn chưa được khai là đã học/đang học. Cập nhật trạng thái hoặc dời sang kỳ khác.' });
            }
            if (!course) return;
            const check = checkCourse(course, planPassed, planTaken, term);
            if (check.missing.length) {
                warnings.push({ level: 'error', title: `${course.code} (HK ${code}) chưa đủ điều kiện`, detail: `Cần học trước: ${check.missing.join(', ')} — chưa hoàn thành và chưa xếp ở kỳ sớm hơn.` });
            }
            if (check.offered === false) {
                warnings.push({ level: 'warning', title: `${course.code} chưa từng mở ở kỳ ${term}`, detail: `Các kỳ đã mở: ${course.openedSemesters.join(', ')}. Kế hoạch HK ${code} có thể không đăng ký được.` });
            }
        });
        entries.forEach(entry => { planPassed.add(entry.course_id); planTaken.add(entry.course_id); });
        const credits = entries.reduce((total, entry) => total + entry.course.credits, 0);
        if (credits > curriculum.max_semester_credits) {
            warnings.push({ level: 'warning', title: `HK ${code}: ${credits} TC vượt mức tối đa`, detail: `Tối đa ${curriculum.max_semester_credits} TC/kỳ.` });
        }
    });
    blocks.forEach((block, index) => {
        const group = blocksDone[index].group;
        if (!group || group.pool_scope !== COURSE_GROUP_SCOPE.LISTED) return;
        const chosen = group.members.filter(member => (
            completed.has(member.course_id) || inProgress.has(member.course_id) || planById.has(member.course_id)
        ));
        const extra = chosen.length - block.needCount;
        if (extra > 0 && block.needCount > 0) {
            warnings.push({ level: 'info', title: `${group.name}: chọn dư ${extra} môn`, detail: `Khối chỉ tính ${block.needCount} môn; môn dư không được chuyển sang khối khác.` });
        }
    });
    const undeclaredPast = [...info.values()].filter(course => (
        !course.groupId && course.status === null && course.recommendedSemester !== null && course.recommendedSemester < current
    )).length;
    if (undeclaredPast) {
        warnings.push({ level: 'info', title: `${undeclaredPast} môn đã qua kỳ khuyến nghị nhưng chưa khai trạng thái`, detail: 'Nếu đã học, khai trạng thái để phân tích chính xác hơn.' });
    }
    if (outsideUncountedCredits > 0) {
        warnings.push({ level: 'info', title: `${outsideUncountedCredits} TC đã hoàn thành không được tính vào chuẩn tốt nghiệp`, detail: 'Gồm môn ngoài chương trình không khớp khối tự chọn tự do hoặc môn dư của khối tự chọn.' });
    }

    const metRegulations = new Set(input.regulationStatuses
        .filter(item => item.status === STUDENT_REGULATION_STATUS.COMPLETED)
        .map(item => item.regulation_id));
    const unmetRegulations = input.regulations.filter(regulation => !metRegulations.has(regulation.id));
    if (unmetRegulations.length) {
        warnings.push({ level: 'info', title: `${unmetRegulations.length}/${input.regulations.length} điều kiện tốt nghiệp chưa đạt`, detail: unmetRegulations.map(item => item.name).join('; ') });
    }

    // Đề cương: điều kiện chương trình không khai, và kỳ dồn nhiều môn thí nghiệm/đồ án.
    const outlineNotes = eligibleNext.filter(check => check.outlineMissing.length);
    if (outlineNotes.length) {
        warnings.push({
            level: 'warning',
            title: `${outlineNotes.length} môn đủ điều kiện theo chương trình nhưng đề cương ghi thêm điều kiện bạn chưa đáp ứng`,
            detail: `${outlineNotes.slice(0, 8).map(check => `${check.course.code} (${check.outlineMissing.map(item => `${COURSE_RELATION_TYPE_LABEL[item.type].toLowerCase()} ${item.code}`).join(', ')})`).join('; ')}${outlineNotes.length > 8 ? '…' : ''}. Hệ thống xét theo chương trình đào tạo; nên hỏi lại khoa trước khi đăng ký.`,
        });
    }
    roadmap.filter(semester => semester.heavyCount >= HEAVY_COURSES_PER_SEMESTER).slice(0, 3).forEach(semester => {
        warnings.push({
            level: 'info',
            title: `HK ${semester.code}: ${semester.heavyCount} môn có thí nghiệm hoặc đồ án`,
            detail: `Theo đề cương, lộ trình đề xuất xếp nhiều môn thực hành nặng vào cùng kỳ${semester.hoursKnown ? ` (≈ ${semester.studyHours} giờ học tập cho ${semester.hoursKnown} môn có đề cương)` : ''}. Cân nhắc dời bớt sang kỳ khác.`,
        });
    });

    const order = { error: 0, warning: 1, info: 2 };
    warnings.sort((a, b) => order[a.level] - order[b.level]);

    return {
        current,
        next,
        admissionYear,
        studyYear,
        standardGraduation,
        overview: {
            totalCredits: sum('needCredits'),
            completedCredits,
            inProgressCredits: sum('inProgress'),
            plannedCredits: sum('planned'),
            remainingCredits: sum('remaining'),
            requiredCourses: sum('needCount'),
            completedCourses: sum('doneCount'),
            elapsedSemesters,
            averagePerSemester: elapsedSemesters > 0 ? completedCredits / elapsedSemesters : null,
            semestersLeft,
            neededPerSemester: semestersLeft > 0 ? leftAfterProgress / semestersLeft : null,
            capacity,
            failedCount: failed.length,
            undeclaredPast,
            outsideUncountedCredits,
        },
        blocks,
        timeline,
        overdue,
        requiredLeft,
        failed,
        electives,
        specializations,
        eligibleNext,
        blockedNext,
        bottlenecks,
        roadmap,
        unplaced,
        projectedGraduation,
        warnings,
        unmetRegulations,
        regulationCount: input.regulations.length,
        outlineCoverage: {
            withOutline: [...info.values()].filter(course => course.outline).length,
            total: info.size,
        },
    };
};
