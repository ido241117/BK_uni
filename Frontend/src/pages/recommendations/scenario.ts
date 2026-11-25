import type { CourseAtSemester, PlanFix, SolvePlanPayload } from '@/types';
import { normalizePriorities, priorityPayload, DEFAULT_PRIORITIES, type PriorityItem } from './priorities';
import i18n from '@/i18n';

/**
 * Mọi lựa chọn what-if của sinh viên trên trang Gợi ý (giai đoạn 12, mục 12.2 của docs/02-ke-hoach.md).
 * Lưu vào tài khoản (`PUT /plans/settings`). Chỉ bấm Giải mới gửi cho bộ giải (W6, W10).
 */
export interface Scenario {
    graduateBy?: string;
    /** E1, E6: đậu/rớt môn đang học. */
    results: Record<string, 'pass' | 'fail'>;
    /** E4: kỳ hè muốn học. */
    summers: string[];
    /** E2: ghim (chuyển môn sang kỳ khác cũng là ghim). */
    locked: CourseAtSemester[];
    /** E7: kỳ không mở môn. */
    notOffered: CourseAtSemester[];
    wanted: string[];
    /** E8: ưu tiên (3 mục hiện ra). */
    priorities: PriorityItem[];
    /** E5: kỳ chính nghỉ. */
    skipped: string[];
    /** E3: số TC muốn từng kỳ. */
    targets: Record<string, number>;
    /** E6, W1: giả định rớt môn trong lộ trình tương lai. */
    assumedFail: CourseAtSemester[];
    /** E7, W2: "kỳ này có mở" (gỡ cảnh báo lịch sử mở lớp). */
    offered: CourseAtSemester[];
    /** E10, T62: môn gõ mã vào ô tự chọn tự do. */
    freeChoices: CourseAtSemester[];
}

export const EMPTY_SCENARIO: Scenario = {
    results: {}, summers: [], locked: [], notOffered: [], wanted: [], priorities: DEFAULT_PRIORITIES,
    skipped: [], targets: {}, assumedFail: [], offered: [], freeChoices: [],
};

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : []);

/** Cài đặt cũ (thiếu trường mới, còn "khóa kỳ", ưu tiên kiểu cũ): lấy mặc định, không làm hỏng trang. */
export const normalizeScenario = (raw: unknown): Scenario => {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Scenario>;
    return {
        graduateBy: typeof s.graduateBy === 'string' ? s.graduateBy : undefined,
        results: s.results && typeof s.results === 'object' ? s.results : {},
        summers: list(s.summers), locked: list(s.locked), notOffered: list(s.notOffered), wanted: list(s.wanted),
        priorities: normalizePriorities(s.priorities),
        skipped: list(s.skipped),
        targets: s.targets && typeof s.targets === 'object' ? s.targets : {},
        assumedFail: list(s.assumedFail), offered: list(s.offered), freeChoices: list(s.freeChoices),
    };
};

const complete = (items: CourseAtSemester[]) => items.filter(i => i.course_code && i.semester_code);

export const buildPayload = (s: Scenario, previousPlan?: Record<string, string> | null): SolvePlanPayload => {
    const { order, disabled } = priorityPayload(s.priorities);
    return {
        solver: 'cpsat', // Q13 (22/11): sinh viên chỉ dùng CP-SAT
        ...(s.graduateBy ? { graduate_by: s.graduateBy } : {}),
        in_progress_results: s.results,
        locked: complete(s.locked),
        not_offered: complete(s.notOffered),
        summer_opt_in: s.summers,
        skip_semesters: s.skipped,
        semester_targets: s.targets,
        assumed_fail: complete(s.assumedFail),
        offered: complete(s.offered),
        free_choices: complete(s.freeChoices),
        preferences: { wanted_courses: s.wanted, order, disabled },
        ...(previousPlan ? { previous_plan: previousPlan } : {}),
    };
};

const same = (a: CourseAtSemester, code?: string, sem?: string) =>
    a.course_code === code && (sem === undefined || a.semester_code === sem);

/** M11: áp dụng một cách gỡ bộ giải đề xuất. */
export const applyFix = (s: Scenario, fix: PlanFix): Scenario => {
    switch (fix.kind) {
        case 'unpin': return { ...s, locked: s.locked.filter(l => !same(l, fix.course, fix.semester)) };
        case 'unskip': return { ...s, skipped: s.skipped.filter(x => x !== fix.semester) };
        case 'remove_not_offered': return { ...s, notOffered: s.notOffered.filter(n => !same(n, fix.course, fix.semester)) };
        case 'remove_target': {
            const targets = { ...s.targets };
            delete targets[fix.semester ?? ''];
            return { ...s, targets };
        }
        case 'remove_assumed_fail': return { ...s, assumedFail: s.assumedFail.filter(a => a.course_code !== fix.course) };
        case 'assume_pass': return fix.course ? { ...s, results: { ...s.results, [fix.course]: 'pass' } } : s;
        case 'enable_summer': return fix.semester && !s.summers.includes(fix.semester)
            ? { ...s, summers: [...s.summers, fix.semester] } : s;
        case 'remove_graduate_by': return { ...s, graduateBy: undefined };
        default: return s;
    }
};

/** Mô tả giả định của một kịch bản, để so hai bản (M16). */
export const describeScenario = (s: Scenario, label: (id: string) => string): [string, string][] => {
    const pairs = (items: CourseAtSemester[]) => items.map(i => `${i.course_code} (${i.semester_code})`).join(', ') || i18n.t('không');
    return [
        [i18n.t('Học hè'), s.summers.join(', ') || i18n.t('không')],
        [i18n.t('Nghỉ kỳ'), s.skipped.join(', ') || i18n.t('không')],
        [i18n.t('Số TC muốn'), Object.entries(s.targets).map(([k, v]) => `${k}: ${v}`).join(', ') || i18n.t('không')],
        ['Ghim', pairs(s.locked)],
        [i18n.t('Môn đang học'), Object.entries(s.results).map(([k, v]) => `${k} ${v === 'pass' ? i18n.t('đậu') : i18n.t('rớt')}`).join(', ') || i18n.t('không có')],
        [i18n.t('Giả định rớt'), pairs(s.assumedFail)],
        [i18n.t('Không mở'), pairs(s.notOffered)],
        [i18n.t('Báo có mở'), pairs(s.offered)],
        [i18n.t('Ô tự chọn tự do'), pairs(s.freeChoices)],
        [i18n.t('Ưu tiên'), s.priorities.filter(p => p.on).map(p => label(p.id)).join(' > ') || i18n.t('không')],
        [i18n.t('Học xong trước'), s.graduateBy ?? i18n.t('không')],
    ];
};
