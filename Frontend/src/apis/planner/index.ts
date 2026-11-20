import { queryMethod } from '@/config/query-method';
import type { MybkImportResult, MybkPreview, MybkProgress, PlanResult, SolvePlanPayload } from '@/types';

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

/** T28: đọc PDF tiến độ myBK, lưu nội dung file theo tài khoản và ghi trạng thái môn đúng như file. */
export const importMybk = (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return queryMethod.post<MybkImportResult>('/plans/mybk/import', form, { timeout: SOLVE_TIMEOUT_MS });
};

/** T28: nội dung file tiến độ đã lưu của tài khoản đang đăng nhập. */
export const getMybkProgress = () => queryMethod.get<MybkProgress>('/plans/mybk/progress');
