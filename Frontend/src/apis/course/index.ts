import { queryMethod } from '@/config/query-method';
import type { Course, CourseOpenedSemester, CoursePayload, CourseQueryParams } from '@/types';

export const listCourses = (params: CourseQueryParams = {}) =>
    queryMethod.getPage<Course>('/courses', { params });

/** Backend nhận tối đa 100 mã mỗi lần (bằng `take` tối đa). */
const CODES_PER_REQUEST = 100;

/**
 * Tra môn theo danh sách mã (không phân biệt hoa/thường); mã không tồn tại thì không có trong kết quả.
 * Chia thành từng nhóm 100 mã và gọi song song, nên không phải tải cả danh mục (hàng nghìn môn).
 */
export const listCoursesByCodes = async (codes: string[]): Promise<Course[]> => {
    const unique = [...new Set(codes.map(code => code.trim().toUpperCase()).filter(Boolean))];
    const chunks = Array.from(
        { length: Math.ceil(unique.length / CODES_PER_REQUEST) },
        (_, index) => unique.slice(index * CODES_PER_REQUEST, (index + 1) * CODES_PER_REQUEST),
    );
    const results = await Promise.all(chunks.map(chunk => queryMethod.getPage<Course>('/courses', {
        params: { codes: chunk.join(','), take: CODES_PER_REQUEST },
    })));
    return results.flatMap(result => result.items);
};

export const getCourse = (id: string) =>
    queryMethod.get<Course>(`/courses/${id}`);

/** Trang chi tiết tự hiển thị khi không tìm thấy (môn có thể chỉ có đề cương), nên không bật toast lỗi. */
export const getCourseByCode = (code: string) =>
    queryMethod.get<Course>(`/courses/by-code/${encodeURIComponent(code)}`, { suppressGlobalErrorToast: true });

export const getOpenedSemesters = (courseId: string) =>
    queryMethod.get<CourseOpenedSemester[]>(`/courses/${courseId}/opened-semesters`);

export const createCourse = (payload: CoursePayload) =>
    queryMethod.post<Course>('/courses', payload);

export const updateCourse = (courseId: string, payload: Partial<CoursePayload>) =>
    queryMethod.patch<Course>(`/courses/${courseId}`, payload);

export const deleteCourse = (courseId: string) =>
    queryMethod.delete(`/courses/${courseId}`);

export const replaceOpenedSemesters = (courseId: string, semesterCodes: string[]) =>
    queryMethod.put<CourseOpenedSemester[]>(`/courses/${courseId}/opened-semesters`, {
        semester_codes: semesterCodes,
    });

export const deleteOpenedSemester = (courseId: string, semesterCode: string) =>
    queryMethod.delete(`/courses/${courseId}/opened-semesters/${encodeURIComponent(semesterCode)}`);
