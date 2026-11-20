import type { PlanResult } from '@/types';

/**
 * What-if (T17): giữ một lộ trình mốc, mỗi lần giải gửi mốc lên (`previous_plan`, bật mong muốn S3
 * "ít đổi so với lộ trình trước") rồi so lộ trình mới với mốc.
 *
 * Mốc lưu trong localStorage của trình duyệt (không lưu vào Supabase chung, mục 8 kế hoạch): chỉ
 * trình duyệt này thấy, xóa dữ liệu trình duyệt là mất.
 */

/** {mã môn: mã kỳ}; bỏ ô tự chọn tự do vì chỉ là chỗ trống, so vị trí không có nghĩa. */
export const planOf = (result: PlanResult): Record<string, string> => Object.fromEntries(
    result.semesters.flatMap(s => s.courses
        .filter(c => c.reason !== 'free_elective')
        .map(c => [c.code, s.semester_code] as const)),
);

export interface PlanDiff {
    moved: { code: string; from: string; to: string }[];
    added: { code: string; to: string }[];
    removed: { code: string; from: string }[];
    graduationFrom: string | null;
    graduationTo: string | null;
    /** Số kỳ chính lệch (dương là muộn hơn); `null` nếu một bên kết thúc ở kỳ hè hoặc thiếu. */
    mainSemesterShift: number | null;
}

/** Thứ tự kỳ: kỳ hè (xx3) nằm giữa kỳ 2 và kỳ 1 năm sau. */
const order = (code: string) => {
    const yy = Number(code.slice(0, 2));
    const term = Number(code.slice(2));
    return yy * 2 + (term === 3 ? 1.5 : term - 1);
};

export const comparePlans = (base: PlanResult, next: PlanResult): PlanDiff => {
    const a = planOf(base);
    const b = planOf(next);
    const moved: PlanDiff['moved'] = [];
    const added: PlanDiff['added'] = [];
    const removed: PlanDiff['removed'] = [];
    for (const [code, to] of Object.entries(b)) {
        if (!(code in a)) added.push({ code, to });
        else if (a[code] !== to) moved.push({ code, from: a[code], to });
    }
    for (const [code, from] of Object.entries(a)) if (!(code in b)) removed.push({ code, from });
    const byCode = (x: { code: string }, y: { code: string }) => x.code.localeCompare(y.code);
    const from = base.graduation_semester;
    const to = next.graduation_semester;
    const shift = from && to ? order(to) - order(from) : null;
    return {
        moved: moved.sort(byCode),
        added: added.sort(byCode),
        removed: removed.sort(byCode),
        graduationFrom: from,
        graduationTo: to,
        mainSemesterShift: shift !== null && Number.isInteger(shift) ? shift : null,
    };
};

export const isSameAsBaseline = (d: PlanDiff) => !d.moved.length && !d.added.length && !d.removed.length
    && d.graduationFrom === d.graduationTo;

/* --------------------------------- Lưu mốc --------------------------------- */

export interface Baseline<TScenario> {
    savedAt: string;
    scenario: TScenario;
    result: PlanResult;
}

export const baselineKey = (userId: string, curriculumId: string) => `bkuni.planner.baseline.v1.${userId}.${curriculumId}`;

export function loadBaseline<T>(key: string): Baseline<T> | null {
    try {
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) as Baseline<T> : null;
        return parsed?.result?.semesters ? parsed : null;
    } catch {
        return null;
    }
}

export function storeBaseline<T>(key: string, baseline: Baseline<T> | null): void {
    try {
        if (baseline) window.localStorage.setItem(key, JSON.stringify(baseline));
        else window.localStorage.removeItem(key);
    } catch {
        // Trình duyệt chặn lưu trữ: mốc chỉ còn trong trang đến khi tải lại.
    }
}
