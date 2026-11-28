import { queryMethod } from '@/config/query-method';
import type { CourseOutlineByCode, CourseOutlineDetail } from '@/types';
import { isApiError } from '@/utils/error';

/** Đề cương của môn, bản áp dụng cho học kỳ hiện tại. `null` khi môn chưa có đề cương (404 là bình thường, không báo lỗi). */
export const getCourseOutlineByCode = async (code: string): Promise<CourseOutlineByCode | null> => {
    try {
        return await queryMethod.get<CourseOutlineByCode>(`/course-outlines/by-code/${encodeURIComponent(code)}`, {
            suppressGlobalErrorToast: true,
        });
    } catch (error) {
        if (isApiError(error) && error.status === 404) return null;
        throw error;
    }
};

/** Một phiên bản đề cương cụ thể. */
export const getCourseOutline = (id: string) =>
    queryMethod.get<CourseOutlineDetail>(`/course-outlines/${id}`);
