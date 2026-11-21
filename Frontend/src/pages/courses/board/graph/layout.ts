import {
    COURSE_GROUP_SCOPE,
    COURSE_RELATION_TYPE,
    STUDENT_COURSE_STATUS,
    type CourseGroup,
    type CourseRelation,
    type CourseRelationType,
    type CourseSummary,
    type CurriculumCourse,
    type StudentCourseStatus,
} from '@/types';
import { canPlan } from '../structure';

/** Cột cuối cho môn không có kỳ gợi ý (môn tự chọn không gắn kỳ). */
const ELECTIVE_COLUMN = 999;

export interface GraphColumn {
    key: number;
    label: string;
}

export interface GraphEdge {
    id: string;
    /** Môn phải có trước (related_course_id). */
    from: string;
    /** Môn đặt điều kiện (course_id). */
    to: string;
    type: CourseRelationType;
    /** Môn điều kiện lại nằm ở kỳ sau (song hành: kỳ khác) — lỗi dữ liệu hoặc kế hoạch. */
    backward: boolean;
    /** Sinh viên đang học/đã lên kế hoạch môn `to` mà điều kiện này chưa thỏa. */
    unmet: boolean;
}

export interface GraphNode {
    course: CourseSummary;
    column: number;
    row: number;
    status: StudentCourseStatus | null;
    plannedSemester: string | null;
    /** Đang học hoặc đã lên kế hoạch (để xét điều kiện). */
    active: boolean;
    unmetCount: number;
}

export interface PrerequisiteGraphData {
    columns: GraphColumn[];
    nodes: GraphNode[];
    edges: GraphEdge[];
    /** Số môn có ít nhất một quan hệ (trong toàn chương trình, không phụ thuộc bộ lọc). */
    relatedCount: number;
    totalCount: number;
}

const columnKey = (year: number, term: number) => (year - 1) * 3 + (term - 1);
const columnLabel = (key: number) => {
    if (key === ELECTIVE_COLUMN) return 'Tự chọn (không gắn kỳ)';
    const year = Math.floor(key / 3) + 1;
    const term = (key % 3) + 1;
    return `Năm ${year} · ${term === 3 ? 'Hè' : `HK${term}`}`;
};

/** Thứ tự thời gian của một môn trong kế hoạch cá nhân: đã học < đang học < kế hoạch theo mã học kỳ. */
const timeline = (status: StudentCourseStatus | null, planned: string | null): string | null => {
    if (status === STUDENT_COURSE_STATUS.COMPLETED || status === STUDENT_COURSE_STATUS.FAILED) return '000';
    if (status === STUDENT_COURSE_STATUS.IN_PROGRESS) return '001';
    if (canPlan(status) && planned) return planned;
    return null;
};

/**
 * Điều kiện `type` của môn đích có thỏa không, xét theo trạng thái và kế hoạch của sinh viên:
 * - Tiên quyết (TQ): môn trước đã đạt, hoặc sẽ học xong trước kỳ của môn đích (giả định sẽ đạt).
 * - Học trước (HT): như TQ nhưng chỉ cần đã học (chưa đạt vẫn tính).
 * - Song hành (SHT): môn kia đã học / đang học / xếp cùng kỳ hoặc sớm hơn.
 * - Khuyến nghị (KN): không bắt buộc, luôn coi là thỏa.
 */
const isSatisfied = (
    type: CourseRelationType,
    target: { status: StudentCourseStatus | null; planned: string | null },
    source: { status: StudentCourseStatus | null; planned: string | null },
): boolean => {
    if (type === COURSE_RELATION_TYPE.RECOMMENDED) return true;
    if (source.status === STUDENT_COURSE_STATUS.COMPLETED) return true;
    if (type === COURSE_RELATION_TYPE.PRIOR && source.status === STUDENT_COURSE_STATUS.FAILED) return true;
    const targetTime = timeline(target.status, target.planned);
    const sourceTime = source.status === STUDENT_COURSE_STATUS.FAILED && type === COURSE_RELATION_TYPE.PREREQUISITE
        ? null
        : timeline(source.status, source.planned);
    if (!targetTime || !sourceTime) return false;
    return type === COURSE_RELATION_TYPE.COREQUISITE ? sourceTime <= targetTime : sourceTime < targetTime;
};

interface BuildOptions {
    courses: CurriculumCourse[];
    groups: CourseGroup[];
    relations: CourseRelation[];
    statusMap: Map<string, StudentCourseStatus>;
    planMap: Map<string, string>;
    /** Loại quan hệ được vẽ. */
    types: Set<CourseRelationType>;
    /** Vẽ cả môn không có quan hệ nào. */
    showIsolated: boolean;
}

/**
 * Dựng đồ thị điều kiện theo cột học kỳ: cột = kỳ gợi ý của chương trình (môn tự chọn lấy kỳ của khối),
 * thứ tự trong cột sắp bằng heuristic barycenter vài lượt để giảm cạnh cắt nhau.
 */
export const buildPrerequisiteGraph = ({
    courses, groups, relations, statusMap, planMap, types, showIsolated,
}: BuildOptions): PrerequisiteGraphData => {
    const columnById = new Map<string, number>();
    for (const group of groups) {
        if (group.specialization_id !== null || group.pool_scope !== COURSE_GROUP_SCOPE.LISTED) continue;
        if (group.recommended_year === null || group.recommended_term === null) continue;
        const key = columnKey(group.recommended_year, group.recommended_term);
        group.members.forEach(member => { if (!columnById.has(member.course_id)) columnById.set(member.course_id, key); });
    }
    for (const item of courses) {
        if (item.recommended_year !== null && item.recommended_term !== null) {
            columnById.set(item.course_id, columnKey(item.recommended_year, item.recommended_term));
        }
    }
    const courseById = new Map(courses.map(item => [item.course_id, item.course]));
    const columnOf = (id: string) => columnById.get(id) ?? ELECTIVE_COLUMN;
    const stateOf = (id: string) => ({ status: statusMap.get(id) ?? null, planned: planMap.get(id) ?? null });
    const isActive = (id: string) => {
        const { status, planned } = stateOf(id);
        return status === STUDENT_COURSE_STATUS.IN_PROGRESS || (canPlan(status) && planned !== null);
    };

    const relatedIds = new Set<string>();
    const edges: GraphEdge[] = [];
    for (const relation of relations) {
        if (!courseById.has(relation.course_id) || !courseById.has(relation.related_course_id)) continue;
        relatedIds.add(relation.course_id);
        relatedIds.add(relation.related_course_id);
        if (!types.has(relation.type)) continue;
        const fromColumn = columnOf(relation.related_course_id);
        const toColumn = columnOf(relation.course_id);
        const comparable = fromColumn !== ELECTIVE_COLUMN && toColumn !== ELECTIVE_COLUMN;
        edges.push({
            id: relation.id,
            from: relation.related_course_id,
            to: relation.course_id,
            type: relation.type,
            backward: comparable && (relation.type === COURSE_RELATION_TYPE.COREQUISITE ? fromColumn > toColumn : fromColumn >= toColumn),
            unmet: isActive(relation.course_id)
                && !isSatisfied(relation.type, stateOf(relation.course_id), stateOf(relation.related_course_id)),
        });
    }

    const edgeIds = new Set(edges.flatMap(edge => [edge.from, edge.to]));
    const shownIds = courses
        .map(item => item.course_id)
        .filter(id => showIsolated || edgeIds.has(id));

    // Gom theo cột, thứ tự ban đầu theo mã môn.
    const byColumn = new Map<number, string[]>();
    for (const id of shownIds) byColumn.set(columnOf(id), [...(byColumn.get(columnOf(id)) ?? []), id]);
    const columnKeys = [...byColumn.keys()].sort((a, b) => a - b);
    byColumn.forEach(ids => ids.sort((a, b) => courseById.get(a)!.code.localeCompare(courseById.get(b)!.code)));

    const incoming = new Map<string, string[]>();
    const outgoing = new Map<string, string[]>();
    for (const edge of edges) {
        incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
        outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    }
    const rowOf = new Map<string, number>();
    const index = () => byColumn.forEach(ids => ids.forEach((id, row) => rowOf.set(id, row)));
    index();
    const reorder = (keys: number[], neighbours: Map<string, string[]>) => {
        for (const key of keys) {
            const ids = byColumn.get(key)!;
            const weight = new Map(ids.map(id => {
                const rows = (neighbours.get(id) ?? []).map(other => rowOf.get(other)).filter((row): row is number => row !== undefined);
                return [id, rows.length ? rows.reduce((total, row) => total + row, 0) / rows.length : rowOf.get(id)!];
            }));
            ids.sort((a, b) => weight.get(a)! - weight.get(b)!);
            ids.forEach((id, row) => rowOf.set(id, row));
        }
    };
    for (let pass = 0; pass < 4; pass += 1) {
        reorder(columnKeys, incoming);
        reorder([...columnKeys].reverse(), outgoing);
    }

    const unmetByTarget = new Map<string, number>();
    edges.forEach(edge => { if (edge.unmet) unmetByTarget.set(edge.to, (unmetByTarget.get(edge.to) ?? 0) + 1); });

    const nodes: GraphNode[] = shownIds.map(id => ({
        course: courseById.get(id)!,
        column: columnKeys.indexOf(columnOf(id)),
        row: rowOf.get(id) ?? 0,
        status: statusMap.get(id) ?? null,
        plannedSemester: planMap.get(id) ?? null,
        active: isActive(id),
        unmetCount: unmetByTarget.get(id) ?? 0,
    }));

    return {
        columns: columnKeys.map(key => ({ key, label: columnLabel(key) })),
        nodes,
        edges,
        relatedCount: relatedIds.size,
        totalCount: courses.length,
    };
};

/** Tất cả môn phía trước (phải học trước, theo chuỗi) và phía sau (được mở khóa) của một môn. */
export const chainOf = (courseId: string, edges: GraphEdge[]) => {
    const walk = (start: string, next: (id: string) => string[]) => {
        const seen = new Set<string>();
        const stack = [start];
        while (stack.length) {
            for (const other of next(stack.pop()!)) {
                if (!seen.has(other) && other !== courseId) { seen.add(other); stack.push(other); }
            }
        }
        return seen;
    };
    const before = walk(courseId, id => edges.filter(edge => edge.to === id).map(edge => edge.from));
    const after = walk(courseId, id => edges.filter(edge => edge.from === id).map(edge => edge.to));
    return { before, after };
};
