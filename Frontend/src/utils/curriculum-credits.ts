import { COURSE_GROUP_SCOPE, type CourseGroup, type CurriculumCourse } from '@/types';

/**
 * Tín chỉ mà một khối yêu cầu.
 * - Có `required_credits` thì dùng trực tiếp (nhóm C: 15, tự chọn tự do: 9).
 * - Không có thì tính từ `required_count`: khối bắt buộc đủ môn (số môn cần = số thành viên) cộng
 *   tín chỉ thực của các môn; khối còn lại nhân số môn với tín chỉ một môn trong khối.
 */
export const groupRequiredCredits = (group: CourseGroup): number => {
    if (group.required_credits !== null) return group.required_credits;
    if (group.required_count === null) return 0;

    if (group.pool_scope === COURSE_GROUP_SCOPE.LISTED && group.required_count === group.members.length) {
        return group.members.reduce((total, member) => total + member.course.credits, 0);
    }

    const unitCredits = group.members[0]?.course.credits ?? 0;
    return group.required_count * unitCredits;
};

export interface CurriculumCreditSummary {
    /** Tín chỉ của môn không nằm trong khối tự chọn nào (môn bắt buộc có lộ trình). */
    standaloneCredits: number;
    /** Tổng yêu cầu của các khối (A/B/C/D, tự chọn tự do…). */
    groupCredits: number;
    /** Chuẩn tốt nghiệp = standalone + group. */
    totalCredits: number;
}

/**
 * Tổng tín chỉ chuẩn tốt nghiệp của chương trình.
 *
 * Mỗi môn chỉ được tính một lần: môn thuộc một khối liệt kê được tính qua yêu cầu của khối,
 * môn còn lại cộng trực tiếp. Nhờ vậy pool 44 môn của nhóm C (132 TC) không còn bị cộng dồn
 * thành "tổng 254 tín chỉ".
 */
export const summarizeCurriculumCredits = (
    courses: CurriculumCourse[],
    allGroups: CourseGroup[],
): CurriculumCreditSummary => {
    // Khối chuyên ngành chỉ thu hẹp khối gốc, không cộng thêm tín chỉ.
    const groups = allGroups.filter(group => group.specialization_id === null);
    const pooledCourseIds = new Set<string>();
    for (const group of groups) {
        if (group.pool_scope !== COURSE_GROUP_SCOPE.LISTED) continue;
        for (const member of group.members) pooledCourseIds.add(member.course_id);
    }

    const standaloneCredits = courses
        .filter(item => !pooledCourseIds.has(item.course_id))
        .reduce((total, item) => total + item.course.credits, 0);
    const groupCredits = groups.reduce((total, group) => total + groupRequiredCredits(group), 0);

    return {
        standaloneCredits,
        groupCredits,
        totalCredits: standaloneCredits + groupCredits,
    };
};

/**
 * Số môn mà một khối yêu cầu.
 * - Có `required_count` thì dùng trực tiếp.
 * - Khối chỉ ràng buộc tín chỉ thì quy ra số môn: chia cho tín chỉ một môn
 *   (`pool_course_credits` với khối `any`, tín chỉ môn đầu tiên với khối liệt kê).
 */
export const groupRequiredCount = (group: CourseGroup): number => {
    if (group.required_count !== null) return group.required_count;
    if (group.required_credits === null) return 0;

    const unitCredits = group.pool_scope === COURSE_GROUP_SCOPE.ANY
        ? group.pool_course_credits
        : group.members[0]?.course.credits;
    return unitCredits ? Math.ceil(group.required_credits / unitCredits) : 0;
};

/** Môn sinh viên đã hoàn thành (chỉ cần mã môn và số tín chỉ). */
export interface CompletedCourse {
    course_id: string;
    credits: number;
}

export interface CurriculumProgress {
    /** Số môn phải học để đạt chuẩn tốt nghiệp: môn không thuộc khối + số môn mỗi khối yêu cầu. */
    requiredCourses: number;
    /** Chuẩn tốt nghiệp (tín chỉ), cùng cách tính với `summarizeCurriculumCredits`. */
    totalCredits: number;
    /** Số môn đã hoàn thành được tính vào chuẩn tốt nghiệp. */
    completedCourses: number;
    /** Số tín chỉ đã hoàn thành được tính vào chuẩn tốt nghiệp. */
    completedCredits: number;
}

/** Một khối xét tốt nghiệp: môn bắt buộc không thuộc khối nào, một khối liệt kê, hoặc một khối `any`. */
export interface CurriculumBlockProgress {
    /** `null` với khối "môn bắt buộc" (môn không thuộc khối tự chọn nào). */
    group: CourseGroup | null;
    needCount: number;
    needCredits: number;
    /** Đã được tính (giới hạn đúng mức khối yêu cầu). */
    doneCount: number;
    doneCredits: number;
    /** Các môn được tính cho khối này (đã giới hạn), theo thứ tự xét. */
    countedCourseIds: string[];
}

/**
 * Tiến độ từng khối với một tập môn "được tính" (thường là môn đã hoàn thành; trang phân tích còn
 * gọi với môn đang học / đã lên kế hoạch để dự phóng).
 *
 * Chỉ tính đúng mức khối yêu cầu. Ví dụ học 7 môn nhóm C (yêu cầu 5 môn, 15 TC) thì chỉ được tính 5 môn, 15 TC.
 * - Môn không thuộc khối nào: tính đủ.
 * - Khối liệt kê: tính các môn thành viên, giới hạn theo số môn và tín chỉ yêu cầu.
 *   Môn thuộc nhiều khối chỉ được tính cho khối đầu tiên chứa nó.
 * - Khối `any` (tự chọn tự do): nhận môn ngoài chương trình (đúng `pool_course_credits` nếu có).
 *   Môn dư của khối liệt kê không được chuyển sang khối này.
 */
export const computeCurriculumBlocks = (
    courses: CurriculumCourse[],
    allGroups: CourseGroup[],
    credited: CompletedCourse[],
): CurriculumBlockProgress[] => {
    const groups = allGroups.filter(group => group.specialization_id === null);
    const listedGroups = groups.filter(group => group.pool_scope === COURSE_GROUP_SCOPE.LISTED);
    const anyGroups = groups.filter(group => group.pool_scope === COURSE_GROUP_SCOPE.ANY);

    const groupIndexByCourseId = new Map<string, number>();
    listedGroups.forEach((group, index) => group.members.forEach(member => {
        if (!groupIndexByCourseId.has(member.course_id)) groupIndexByCourseId.set(member.course_id, index);
    }));
    const standalone = courses.filter(item => !groupIndexByCourseId.has(item.course_id));
    const standaloneIds = new Set(standalone.map(item => item.course_id));

    const standaloneDone: CompletedCourse[] = [];
    const creditedByGroup = listedGroups.map(() => [] as CompletedCourse[]);
    const outsideCurriculum: CompletedCourse[] = [];
    for (const course of credited) {
        const groupIndex = groupIndexByCourseId.get(course.course_id);
        if (groupIndex !== undefined) creditedByGroup[groupIndex].push(course);
        else if (standaloneIds.has(course.course_id)) standaloneDone.push(course);
        else outsideCurriculum.push(course);
    }

    // Lấy dần các môn cho tới khi đủ số môn và đủ tín chỉ khối yêu cầu.
    const fillGroup = (group: CourseGroup, candidates: CompletedCourse[]): CurriculumBlockProgress => {
        const needCount = groupRequiredCount(group);
        const needCredits = groupRequiredCredits(group);
        const taken: CompletedCourse[] = [];
        let credits = 0;
        for (const course of candidates) {
            if (taken.length >= needCount && credits >= needCredits) break;
            taken.push(course);
            credits += course.credits;
        }
        return {
            group,
            needCount,
            needCredits,
            doneCount: Math.min(taken.length, needCount),
            doneCredits: Math.min(credits, needCredits),
            countedCourseIds: taken.map(course => course.course_id),
        };
    };

    const blocks: CurriculumBlockProgress[] = [{
        group: null,
        needCount: standalone.length,
        needCredits: standalone.reduce((total, item) => total + item.course.credits, 0),
        doneCount: standaloneDone.length,
        doneCredits: standaloneDone.reduce((total, course) => total + course.credits, 0),
        countedCourseIds: standaloneDone.map(course => course.course_id),
    }];
    listedGroups.forEach((group, index) => blocks.push(fillGroup(group, creditedByGroup[index])));

    let freeCandidates = outsideCurriculum;
    for (const group of anyGroups) {
        const eligible = freeCandidates.filter(course => (
            group.pool_course_credits === null || course.credits === group.pool_course_credits
        ));
        const block = fillGroup(group, eligible);
        const taken = new Set(block.countedCourseIds);
        freeCandidates = freeCandidates.filter(course => !taken.has(course.course_id));
        blocks.push(block);
    }
    return blocks;
};

/** Tiến độ tốt nghiệp của sinh viên theo chương trình (tổng của `computeCurriculumBlocks`). */
export const summarizeCurriculumProgress = (
    courses: CurriculumCourse[],
    allGroups: CourseGroup[],
    completed: CompletedCourse[],
): CurriculumProgress => {
    const blocks = computeCurriculumBlocks(courses, allGroups, completed);
    return {
        requiredCourses: blocks.reduce((total, block) => total + block.needCount, 0),
        totalCredits: summarizeCurriculumCredits(courses, allGroups).totalCredits,
        completedCourses: blocks.reduce((total, block) => total + block.doneCount, 0),
        completedCredits: blocks.reduce((total, block) => total + block.doneCredits, 0),
    };
};
