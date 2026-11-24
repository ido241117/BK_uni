import type { CourseAtSemester, PlanCourse, PlanCourseFact } from '@/types';
import { order } from './whatIf';

/**
 * Giai đoạn 12 (M6, T61): khi sinh viên chọn một môn, trang tự cho biết kỳ nào chuyển vào được, kỳ nào không
 * và vì sao. Tính tại trang từ dữ liệu bộ giải trả về (`course_facts`), **không gọi bộ giải**; bấm Giải mới kiểm
 * đầy đủ (vd ngưỡng tín chỉ môn tốt nghiệp, năm học theo tín chỉ chỉ bộ giải kiểm).
 */
export type MoveHint = { current: true } | { block: string } | { ok: true; soft: string | null };

export interface HintContext {
    /** Mã môn → kỳ đang hiện trên bảng (không gồm lần học giả định rớt). */
    placement: Map<string, string>;
    credits: Map<string, number>;
    facts: Record<string, PlanCourseFact>;
    skipped: string[];
    summers: string[];
    notOffered: CourseAtSemester[];
    offered: CourseAtSemester[];
    assumedFail: CourseAtSemester[];
    targets: Record<string, number>;
    limits: { main_max: number; summer_max: number };
}

const isSummer = (code: string) => code.endsWith('3');
const TERM: Record<string, string> = { 1: 'kỳ 1', 2: 'kỳ 2', 3: 'kỳ hè' };
const has = (items: CourseAtSemester[], code: string, sem: string) =>
    items.some(i => i.course_code === code && i.semester_code === sem);

export const moveHint = (code: string, target: string, ctx: HintContext): MoveHint => {
    if (ctx.placement.get(code) === target) return { current: true };
    const summer = isSummer(target);
    if (summer && !ctx.summers.includes(target)) return { block: 'Chưa bật học hè kỳ này' };
    if (!summer && ctx.skipped.includes(target)) return { block: 'Bạn nghỉ kỳ này' };
    const fact = ctx.facts[code];
    if (summer && fact?.summer === 'excluded') return { block: 'Đồ án không học hè' };
    if (has(ctx.notOffered, code, target)) return { block: 'Bạn báo kỳ này không mở' };
    const failed = ctx.assumedFail.find(a => a.course_code === code);
    if (failed && order(target) <= order(failed.semester_code)) return { block: 'Học lại phải sau kỳ giả định rớt' };
    for (const p of fact?.prerequisites ?? []) {
        const at = ctx.placement.get(p);
        if (!at || order(at) >= order(target)) return { block: `Cần xong ${p} trước` };
    }
    for (const p of fact?.corequisites ?? []) {
        const at = ctx.placement.get(p);
        if (!at || order(at) > order(target)) return { block: `Cần học ${p} trước hoặc cùng kỳ` };
    }
    for (const [other, f] of Object.entries(ctx.facts)) {
        const at = ctx.placement.get(other);
        if (!at) continue;
        if (f.prerequisites.includes(code) && order(at) <= order(target)) return { block: `Phải học trước ${other}` };
        if (f.corequisites.includes(code) && order(at) < order(target)) return { block: `Phải học trước hoặc cùng kỳ ${other}` };
    }
    const soft: string[] = [];
    const told = has(ctx.offered, code, target);
    if (!told && summer && fact?.summer === 'no_history') soft.push('chưa từng mở hè');
    else if (!told && fact?.terms && !fact.terms.includes(target.slice(-1))) soft.push(`chưa từng mở ${TERM[target.slice(-1)]}`);
    let load = ctx.credits.get(code) ?? 0;
    for (const [c, at] of ctx.placement) if (at === target && c !== code) load += ctx.credits.get(c) ?? 0;
    const cap = ctx.targets[target] ?? (summer ? ctx.limits.summer_max : ctx.limits.main_max);
    if (load > cap) soft.push(`sẽ thành ${load} TC, quá mức ${cap}`);
    return { ok: true, soft: soft.length ? soft.join(' · ') : null };
};

/** Môn tự chọn bộ giải tạm xếp (sinh viên chưa chọn): giao diện chỉ hiện tên khối, không hiện môn (người duyệt 24/11). */
export const isBlockSlot = (c: Pick<PlanCourse, 'slot' | 'block' | 'reason'>): boolean =>
    Boolean(c.slot && c.block) && c.reason !== 'free_elective';
