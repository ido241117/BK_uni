import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { bulkUpsertMyCourses, bulkUpsertMyPlanCourses } from '@/apis/student';
import type { CourseSummary, StudentCourse, StudentCourseStatus, StudentPlanCourse } from '@/types';

/**
 * Bản nháp của sinh viên ở trang môn học: chỉ ghi phần khác dữ liệu đã lưu.
 * `null` nghĩa là bỏ (bỏ khai trạng thái / bỏ khỏi kế hoạch).
 */
interface Draft {
    statuses: Record<string, StudentCourseStatus | null>;
    plan: Record<string, string | null>;
    /** Thông tin môn ngoài chương trình sinh viên thêm vào nháp (để hiển thị khi chưa lưu). */
    courses: Record<string, CourseSummary>;
}

const EMPTY_DRAFT: Draft = { statuses: {}, plan: {}, courses: {} };

const storageKey = (userId: string, curriculumId: string) => `bk-course-draft:${userId}:${curriculumId}`;

/** localStorage có thể bị chặn (chế độ riêng tư, quota): khi đó nháp chỉ sống trong bộ nhớ. */
const readDraft = (key: string): Draft => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return EMPTY_DRAFT;
        const parsed = JSON.parse(raw) as Partial<Draft>;
        return { statuses: parsed.statuses ?? {}, plan: parsed.plan ?? {}, courses: parsed.courses ?? {} };
    } catch {
        return EMPTY_DRAFT;
    }
};

const writeDraft = (key: string, draft: Draft) => {
    try {
        if (!Object.keys(draft.statuses).length && !Object.keys(draft.plan).length) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(draft));
    } catch {
        /* bỏ qua: nháp vẫn còn trong state */
    }
};

/** Bỏ các mục đã được lưu; mục người dùng sửa tiếp trong lúc đang lưu (giá trị khác bản đã gửi) thì giữ. */
const omitSaved = <T>(current: Record<string, T>, sent: Record<string, T>): Record<string, T> => {
    const next = { ...current };
    for (const [id, value] of Object.entries(sent)) {
        if (next[id] === value) delete next[id];
    }
    return next;
};

interface UseCourseDraftOptions {
    userId: string;
    curriculumId: string;
    serverStatuses: StudentCourse[] | undefined;
    serverPlan: StudentPlanCourse[] | undefined;
}

export interface SaveResult {
    ok: boolean;
    /** Phần nào lưu lỗi (phần lưu được đã xoá khỏi nháp). */
    failed: ('statuses' | 'plan')[];
}

/**
 * Trạng thái môn + học kỳ dự kiến được sửa hoàn toàn ở client (bấm thẻ là đổi ngay, không gọi API),
 * nháp giữ trong localStorage để tải lại trang không mất; chỉ ghi về server khi gọi `save()`.
 */
export const useCourseDraft = ({ userId, curriculumId, serverStatuses, serverPlan }: UseCourseDraftOptions) => {
    const queryClient = useQueryClient();
    const key = storageKey(userId, curriculumId);
    const [draft, setDraft] = useState<Draft>(() => readDraft(key));
    const [saving, setSaving] = useState(false);

    useEffect(() => { writeDraft(key, draft); }, [key, draft]);

    const savedStatus = useMemo(
        () => new Map((serverStatuses ?? []).map(item => [item.course_id, item.status])),
        [serverStatuses],
    );
    const savedPlan = useMemo(
        () => new Map((serverPlan ?? []).map(item => [item.course_id, item.semester_code])),
        [serverPlan],
    );

    /**
     * Thay đổi thật sự so với server. Server đổi từ chỗ khác (nhập file) mà trùng với nháp thì mục đó
     * tự hết "chưa lưu", không cần dọn tay.
     */
    const changes = useMemo(() => {
        const statuses = Object.entries(draft.statuses)
            .filter(([id, status]) => (savedStatus.get(id) ?? null) !== status);
        const plan = Object.entries(draft.plan)
            .filter(([id, semester]) => (savedPlan.get(id) ?? null) !== semester);
        return { statuses, plan, count: new Set([...statuses, ...plan].map(([id]) => id)).size };
    }, [draft, savedStatus, savedPlan]);

    const changedIds = useMemo(
        () => new Set([...changes.statuses, ...changes.plan].map(([id]) => id)),
        [changes],
    );

    /** Trạng thái hiệu lực (nháp đè lên dữ liệu đã lưu). */
    const statusMap = useMemo(() => {
        const map = new Map(savedStatus);
        for (const [id, status] of changes.statuses) {
            if (status) map.set(id, status);
            else map.delete(id);
        }
        return map;
    }, [savedStatus, changes]);

    const planMap = useMemo(() => {
        const map = new Map(savedPlan);
        for (const [id, semester] of changes.plan) {
            if (semester) map.set(id, semester);
            else map.delete(id);
        }
        return map;
    }, [savedPlan, changes]);

    /** Đặt trạng thái cho một hoặc nhiều môn; `course` để nhớ thông tin môn ngoài chương trình. */
    const setStatuses = useCallback((ids: string[], status: StudentCourseStatus | null, courses: CourseSummary[] = []) => {
        setDraft(current => {
            const statuses = { ...current.statuses };
            for (const id of ids) statuses[id] = status;
            const known = { ...current.courses };
            for (const course of courses) known[course.id] = course;
            return { ...current, statuses, courses: known };
        });
    }, []);

    const setStatus = useCallback(
        (id: string, status: StudentCourseStatus | null, course?: CourseSummary) => setStatuses([id], status, course ? [course] : []),
        [setStatuses],
    );

    const setPlannedSemester = useCallback((id: string, semester: string | null, course?: CourseSummary) => {
        setDraft(current => ({
            ...current,
            plan: { ...current.plan, [id]: semester },
            courses: course ? { ...current.courses, [course.id]: course } : current.courses,
        }));
    }, []);

    const discard = useCallback(() => setDraft(EMPTY_DRAFT), []);

    const save = useCallback(async (): Promise<SaveResult> => {
        if (!changes.count) return { ok: true, failed: [] };
        setSaving(true);
        // Gồm cả mục nháp đã trùng dữ liệu đã lưu: dọn luôn để sau này server đổi thì nháp cũ không đè lên.
        const sent = draft;
        const [statusResult, planResult] = await Promise.allSettled([
            changes.statuses.length
                ? bulkUpsertMyCourses(
                    changes.statuses.flatMap(([id, status]) => (status ? [{ course_id: id, status }] : [])),
                    changes.statuses.flatMap(([id, status]) => (status ? [] : [id])),
                )
                : Promise.resolve(null),
            changes.plan.length
                ? bulkUpsertMyPlanCourses(
                    curriculumId,
                    changes.plan.flatMap(([id, semester]) => (semester ? [{ course_id: id, semester_code: semester }] : [])),
                    changes.plan.flatMap(([id, semester]) => (semester ? [] : [id])),
                )
                : Promise.resolve(null),
        ]);
        setSaving(false);

        // Response là toàn bộ dữ liệu sau khi lưu (gồm cả GDTC backend tự nâng): ghi thẳng vào cache.
        if (statusResult.status === 'fulfilled' && statusResult.value) {
            queryClient.setQueryData(['student-courses'], statusResult.value);
        }
        if (planResult.status === 'fulfilled' && planResult.value) {
            queryClient.setQueryData(['plan-courses', curriculumId], planResult.value);
        }
        setDraft(current => ({
            ...current,
            statuses: statusResult.status === 'fulfilled' ? omitSaved(current.statuses, sent.statuses) : current.statuses,
            plan: planResult.status === 'fulfilled' ? omitSaved(current.plan, sent.plan) : current.plan,
        }));
        // Các trang khác (phân tích, tư vấn) đọc lại dữ liệu mới.
        void queryClient.invalidateQueries({ queryKey: ['plan-courses'] });

        const failed: SaveResult['failed'] = [];
        if (statusResult.status === 'rejected') failed.push('statuses');
        if (planResult.status === 'rejected') failed.push('plan');
        return { ok: !failed.length, failed };
    }, [changes, draft, curriculumId, queryClient]);

    return {
        statusMap,
        planMap,
        changedIds,
        changeCount: changes.count,
        draftCourses: draft.courses,
        setStatus,
        setStatuses,
        setPlannedSemester,
        discard,
        save,
        saving,
    };
};

export type CourseDraft = ReturnType<typeof useCourseDraft>;
