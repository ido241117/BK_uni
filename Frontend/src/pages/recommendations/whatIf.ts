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
        .filter(c => c.reason !== 'free_elective' && !c.assumed_fail)
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
export const order = (code: string) => {
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

/* ----------------------- Giai đoạn 12: lưu bản, so sánh ----------------------- */

/** M15: một bản lộ trình đã lưu, gồm cả mọi giả định what-if. Lưu trong tài khoản (`data.web.planner.plans`). */
export interface SavedPlan<TScenario> {
    id: string;
    name: string;
    savedAt: string;
    /** Bản gắn sao là mốc (S3: ít đổi so với mốc). */
    starred: boolean;
    /** false: lưu khi còn chỉnh chưa giải ("chưa kiểm"). */
    checked: boolean;
    scenario: TScenario;
    result: PlanResult;
}

export const MAX_PLANS = 10;

/** Bỏ phần nặng, không cần để xem lại hay so sánh (giữ dưới giới hạn 200 KB của cài đặt). */
export const trimResult = (r: PlanResult): PlanResult => ({
    status: r.status, solver: r.solver, semesters: r.semesters, graduation_semester: r.graduation_semester,
    violations: r.violations ?? [], warning_items: r.warning_items ?? [], requests: r.requests ?? [],
    infeasible_reason: r.infeasible_reason ?? null, infeasible_fixes: r.infeasible_fixes ?? [],
    preferences_report: r.preferences_report ?? [],
});

/** Thêm bản mới; đủ 10 thì bỏ bản cũ nhất không gắn sao. */
export function addPlan<T>(plans: SavedPlan<T>[], plan: SavedPlan<T>): SavedPlan<T>[] {
    const next = [...plans];
    if (next.length >= MAX_PLANS) {
        const k = next.findIndex(p => !p.starred);
        next.splice(k < 0 ? 0 : k, 1);
    }
    return [...next, plan];
}

const isSummer = (code: string) => code.endsWith('3');

/** M16: chỉ số so sánh (mục 12.7). `recommended`: kỳ khuyến nghị của môn; `required`: môn bắt buộc. */
export interface PlanMetrics {
    graduation: string | null;
    band: number;
    heaviest: number;
    summer: number;
    lateRequired: number | null;
    warnings: number | null;
}

export const planMetrics = (
    r: PlanResult, recommended: Map<string, string>, required: Set<string>, withWarnings = true,
): PlanMetrics => {
    const sems = [...r.semesters].sort((a, b) => order(a.semester_code) - order(b.semester_code));
    const last = sems.length ? sems[sems.length - 1].semester_code : null;
    const main = sems.filter(s => !isSummer(s.semester_code));
    const where = planOf(r);
    let late = 0;
    for (const [code, sem] of Object.entries(where)) {
        const rec = recommended.get(code);
        if (required.has(code) && rec && order(sem) > order(rec)) late += 1;
    }
    return {
        graduation: r.graduation_semester ?? last,
        band: main.filter(s => s.semester_code !== last && (s.credits < 15 || s.credits > 18)).length,
        heaviest: main.length ? Math.max(...main.map(s => s.credits)) : 0,
        summer: sems.filter(s => isSummer(s.semester_code)).reduce((sum, s) => sum + s.credits, 0),
        lateRequired: recommended.size ? late : null,
        warnings: withWarnings ? (r.warning_items?.length ?? 0) : null,
    };
};

/** Kỳ khuyến nghị (năm y, kỳ t của chương trình khóa `cohort`) → mã kỳ, vd khóa 2023 năm 2 kỳ 1 = 241. */
export const recommendedSemester = (cohort: number, year: number | null, term: number | null) =>
    (year && term ? `${(cohort % 100) + year - 1}${term}` : null);

/**
 * "Kế hoạch giảng dạy": các môn còn lại xếp đúng kỳ khuyến nghị; môn đã quá kỳ khuyến nghị vào kỳ chính kế tiếp;
 * môn không có kỳ khuyến nghị thì bỏ (KHMT 2023: 37/96 môn có).
 */
export const teachingPlan = (
    courses: { code: string; credits: number; semester: string | null }[], after: string,
): PlanResult => {
    const by = new Map<string, { code: string; credits: number }[]>();
    // Môn đã quá kỳ khuyến nghị mà chưa đạt: đưa vào kỳ chính kế tiếp.
    const yy = Number(after.slice(0, 2));
    const next = after.endsWith('1') ? `${yy}2` : `${yy + 1}1`;
    for (const c of courses) {
        if (!c.semester) continue;
        const sem = order(c.semester) <= order(after) ? next : c.semester;
        by.set(sem, [...(by.get(sem) ?? []), c]);
    }
    const semesters = [...by.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([semester_code, list]) => ({
        semester_code,
        credits: list.reduce((sum, c) => sum + c.credits, 0),
        courses: list.map(c => ({ code: c.code, credits: c.credits, reason: 'required' as const, locked: false })),
    }));
    return {
        status: 'OPTIMAL', solver: 'teaching-plan', semesters, violations: [],
        graduation_semester: semesters.length ? semesters[semesters.length - 1].semester_code : null,
    };
};
