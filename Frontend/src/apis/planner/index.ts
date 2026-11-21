import { queryMethod } from '@/config/query-method';
import type {
    MybkAdjustPayload, MybkImportResult, MybkPreview, MybkProgress, MybkReview, PlanResult, SolvePlanPayload,
} from '@/types';

/** Bộ giải có thể chạy tới vài chục giây (Clingo); chờ lâu hơn mặc định. */
const SOLVE_TIMEOUT_MS = 2 * 60_000;

export const solvePlan = (payload: SolvePlanPayload) =>
    queryMethod.post<PlanResult>('/plans/solve', payload, { timeout: SOLVE_TIMEOUT_MS });

/** Đọc file tiến độ myBK ở backend (không lưu file), trả đề xuất trạng thái môn để sinh viên xác nhận. */
export const previewMybk = (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return queryMethod.post<MybkPreview>('/plans/mybk/preview', form, { timeout: SOLVE_TIMEOUT_MS });
};

/** T32: đọc PDF, tìm chương trình theo mã myBK, liệt kê mâu thuẫn. Không lưu gì. */
export const reviewMybk = (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return queryMethod.post<MybkReview>('/plans/mybk/review', form, { timeout: SOLVE_TIMEOUT_MS });
};

/**
 * T28: đọc PDF tiến độ myBK, lưu nội dung file theo tài khoản và ghi trạng thái môn đúng như file.
 * `applyCurriculum`: đặt chương trình trong hồ sơ theo mã myBK của file.
 */
export const importMybk = ({ file, applyCurriculum }: { file: File; applyCurriculum: boolean }) => {
    const form = new FormData();
    form.append('file', file);
    if (applyCurriculum) form.append('apply_curriculum', 'true');
    return queryMethod.post<MybkImportResult>('/plans/mybk/import', form, { timeout: SOLVE_TIMEOUT_MS });
};

/** Nút Hiệu chỉnh: sửa trạng thái môn (kể cả thêm môn) và khai học kỳ hiện tại. */
export const adjustMybk = (payload: MybkAdjustPayload) =>
    queryMethod.put<MybkProgress & { written_courses: number; removed_courses: number }>('/plans/mybk/adjustments', payload);

/** T28: nội dung file tiến độ đã lưu của tài khoản đang đăng nhập. */
export const getMybkProgress = () => queryMethod.get<MybkProgress>('/plans/mybk/progress');
