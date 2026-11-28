import { queryMethod } from '@/config/query-method';
import type {
    StudentCourse,
    StudentCourseStatus,
    StudentProfile,
    StudentProfilePayload,
    StudentRegulationStatus,
    StudentRegulationStatusRecord,
} from '@/types';

/* --------------------------------- Hồ sơ ---------------------------------- */

/** `null` khi tài khoản chưa tạo hồ sơ (backend trả data: null, không phải 404). */
export const getMyProfile = () =>
    queryMethod.get<StudentProfile | null>('/student-profiles/me', { suppressGlobalErrorToast: true });

export const saveMyProfile = (payload: StudentProfilePayload) =>
    queryMethod.patch<StudentProfile>('/student-profiles/me', payload);

/* ---------------------------- Trạng thái môn học --------------------------- */

export const listMyCourses = () =>
    queryMethod.get<StudentCourse[]>('/student-courses/me');

/**
 * Khai nhiều môn một lần (nhập tiến độ ở trang Gợi ý); môn không gửi giữ nguyên.
 * `removeCourseIds`: môn bỏ khai báo. Trả toàn bộ trạng thái sau khi lưu.
 */
export const bulkUpsertMyCourses = (
    items: { course_id: string; status: StudentCourseStatus }[],
    removeCourseIds: string[] = [],
) =>
    queryMethod.put<StudentCourse[]>('/student-courses/me', {
        items,
        ...(removeCourseIds.length ? { remove_course_ids: removeCourseIds } : {}),
    });

/* ----------------------------- Trạng thái quy định ------------------------- */

export const listMyRegulationStatuses = (curriculumId?: string) =>
    queryMethod.get<StudentRegulationStatusRecord[]>('/student-regulation-statuses/me', {
        params: curriculumId ? { curriculum_id: curriculumId } : undefined,
    });

export const upsertMyRegulationStatus = (regulationId: string, status: StudentRegulationStatus) =>
    queryMethod.put<StudentRegulationStatusRecord>(`/student-regulation-statuses/me/${regulationId}`, { status });

export const removeMyRegulationStatus = (regulationId: string) =>
    queryMethod.delete(`/student-regulation-statuses/me/${regulationId}`);
