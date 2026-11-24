import {
    COURSE_GROUP_SCOPE,
    STUDENT_COURSE_STATUS,
    type CourseGroup,
    type CourseSummary,
    type CurriculumCourse,
    type StudentCourseStatus,
} from '@/types';

/**
 * Chưa học (chưa khai hoặc khai "Chưa học"): mới lên kế hoạch được.
 * "Đã lên kế hoạch" = chưa học + có học kỳ dự kiến; suy ra từ dữ liệu sẵn có, không lưu riêng.
 */
export const canPlan = (status: StudentCourseStatus | null) => status === null || status === STUDENT_COURSE_STATUS.NOT_STARTED;

export const termLabel = (term: number) => (term === 3 ? 'Học kỳ hè' : `Học kỳ ${term}`);

export interface SemesterBlock {
    key: string;
    year: number;
    term: number;
    courses: CourseSummary[];
    /** Khối tự chọn nên bắt đầu học ở kỳ này. */
    groups: CourseGroup[];
}

export interface CurriculumStructure {
    semesters: SemesterBlock[];
    /** Môn không xếp kỳ và không thuộc khối tự chọn nào. */
    unscheduled: CourseSummary[];
    /** Khối gốc (xét tốt nghiệp) không gắn kỳ gợi ý. */
    floatingGroups: CourseGroup[];
    rootGroups: CourseGroup[];
    /** Môn không thuộc khối liệt kê nào: phải học đủ. */
    standalone: CourseSummary[];
    /** Mọi môn của chương trình, xếp theo mã. */
    allCourses: CourseSummary[];
    curriculumCourseIds: Set<string>;
    /** Vị trí môn trong chương trình, để hiện ở chi tiết. */
    placementById: Map<string, string>;
    groupNamesById: Map<string, string[]>;
}

const byCode = (a: CourseSummary, b: CourseSummary) => a.code.localeCompare(b.code);

/** Sắp xếp dữ liệu chương trình thành các kỳ của kế hoạch giảng dạy và các khối kiến thức. */
export const buildStructure = (courses: CurriculumCourse[], groups: CourseGroup[]): CurriculumStructure => {
    const rootGroups = groups.filter(group => group.specialization_id === null);
    const pooled = new Set<string>();
    const groupNamesById = new Map<string, string[]>();
    for (const group of rootGroups) {
        for (const member of group.members) {
            if (group.pool_scope === COURSE_GROUP_SCOPE.LISTED) pooled.add(member.course_id);
            groupNamesById.set(member.course_id, [...(groupNamesById.get(member.course_id) ?? []), group.name]);
        }
    }

    const blocks = new Map<string, SemesterBlock>();
    const block = (year: number, term: number) => {
        const key = `${year}-${term}`;
        if (!blocks.has(key)) blocks.set(key, { key, year, term, courses: [], groups: [] });
        return blocks.get(key)!;
    };

    const placementById = new Map<string, string>();
    const unscheduled: CourseSummary[] = [];
    for (const item of courses) {
        if (item.recommended_year !== null && item.recommended_term !== null) {
            block(item.recommended_year, item.recommended_term).courses.push(item.course);
            placementById.set(item.course_id, `Năm ${item.recommended_year} · ${termLabel(item.recommended_term)}`);
        } else if (!pooled.has(item.course_id)) {
            unscheduled.push(item.course);
            placementById.set(item.course_id, 'Chưa xếp kỳ');
        } else {
            placementById.set(item.course_id, 'Môn tự chọn trong khối');
        }
    }

    const floatingGroups: CourseGroup[] = [];
    for (const group of rootGroups) {
        if (group.recommended_year !== null && group.recommended_term !== null) {
            block(group.recommended_year, group.recommended_term).groups.push(group);
        } else {
            floatingGroups.push(group);
        }
    }

    const semesters = [...blocks.values()].sort((a, b) => a.year - b.year || a.term - b.term);
    semesters.forEach(item => item.courses.sort(byCode));

    return {
        semesters,
        unscheduled: unscheduled.sort(byCode),
        floatingGroups,
        rootGroups,
        standalone: courses.filter(item => !pooled.has(item.course_id)).map(item => item.course).sort(byCode),
        allCourses: courses.map(item => item.course).sort(byCode),
        curriculumCourseIds: new Set(courses.map(item => item.course_id)),
        placementById,
        groupNamesById,
    };
};

/** Thành viên của khối, xếp theo mã. */
export const groupCourses = (group: CourseGroup): CourseSummary[] => (
    group.members.map(member => member.course).sort(byCode)
);
