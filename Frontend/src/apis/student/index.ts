import { queryMethod } from '@/config/query-method';
import type {
    StudentCourse,
    StudentCourseStatus,
    StudentPlanCourse,
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

export const upsertMyCourse = (courseId: string, status: StudentCourseStatus) =>
    queryMethod.put<StudentCourse>(`/student-courses/me/${courseId}`, { status });

/** Khai nhiều môn một lần (nhập từ file); môn không gửi giữ nguyên. Trả toàn bộ trạng thái sau khi lưu. */
export const bulkUpsertMyCourses = (items: { course_id: string; status: StudentCourseStatus }[]) =>
    queryMethod.put<StudentCourse[]>('/student-courses/me', { items });

export const removeMyCourse = (courseId: string) =>
    queryMethod.delete(`/student-courses/me/${courseId}`);

/* ------------------------------- Kế hoạch --------------------------------- */

export const listMyPlanCourses = (curriculumId?: string) =>
    queryMethod.get<StudentPlanCourse[]>('/student-plan-courses/me', {
        params: curriculumId ? { curriculum_id: curriculumId } : undefined,
    });

export const upsertMyPlanCourse = (curriculumId: string, courseId: string, semesterCode: string) =>
    queryMethod.put<StudentPlanCourse>(`/student-plan-courses/me/${curriculumId}/${courseId}`, {
        semester_code: semesterCode,
    });

export const removeMyPlanCourse = (curriculumId: string, courseId: string) =>
    queryMethod.delete(`/student-plan-courses/me/${curriculumId}/${courseId}`);

/* ----------------------------- Trạng thái quy định ------------------------- */

export const listMyRegulationStatuses = (curriculumId?: string) =>
    queryMethod.get<StudentRegulationStatusRecord[]>('/student-regulation-statuses/me', {
        params: curriculumId ? { curriculum_id: curriculumId } : undefined,
    });

export const upsertMyRegulationStatus = (regulationId: string, status: StudentRegulationStatus) =>
    queryMethod.put<StudentRegulationStatusRecord>(`/student-regulation-statuses/me/${regulationId}`, { status });

export const removeMyRegulationStatus = (regulationId: string) =>
    queryMethod.delete(`/student-regulation-statuses/me/${regulationId}`);
