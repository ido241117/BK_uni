/**
 * Ghép đầu vào cho bộ giải Python (`pipeline/planner/cli.py`) từ dữ liệu database.
 *
 * Hàm thuần, không đọc database, để test được. Quy tắc đổi từ database sang đầu vào bộ giải
 * giống `pipeline/planner/fetch_curriculum.py` và mục 2.1 của
 * `docs/2026-11-18-luong-du-lieu-bo-giai.md`:
 * - Môn bắt buộc = môn của chương trình không thuộc khối tự chọn gốc nào (giống trang Phân tích).
 * - Khối con theo chuyên ngành giữ `parent`, `specialization`; khối `any` giữ nguyên.
 * - Nhóm "E. ..." là điều kiện tốt nghiệp (không xếp lịch); nhóm "D. ..." là học phần tốt nghiệp.
 * - Môn có chữ "đồ án" trong tên không xếp vào kỳ hè (người duyệt, 19/11/2026).
 * Không đưa tên, MSSV hay điểm của sinh viên vào đầu vào.
 */
import { currentSemester } from '../advisor/semester';
import type { SolvePlanDto } from './dto/solve-plan.dto';

export type PlannerCourse = { id: string; code: string; name: string; credits: number };
export type PlannerSource = {
  curriculum: { code: string; name: string; cohort: number; duration_years: number;
    min_semester_credits: number; max_semester_credits: number };
  items: { course: PlannerCourse; recommended_year: number | null; recommended_term: number | null }[];
  groups: { id: string; name: string; kind: string; required_count: number | null; required_credits: number | null;
    pool_scope: string; pool_course_credits: number | null; specialization_id: string | null;
    parent_group_id: string | null; member_course_ids: string[] }[];
  relations: { course_id: string; related_course_id: string; type: string }[];
  categories: { name: string; member_course_ids: string[] }[];
  specializations: { id: string; code: string }[];
  openedSemesters: { course_id: string; semester_code: string }[];
  profile: { admission_year: number | null; target_specialization_id: string | null };
  studentCourses: { course: PlannerCourse; status: string }[];
};

export const PLANNER_RULES = {
  credits_min: 11,
  credits_max: 25,
  course_level: true,
  summer_credits_max: 12,
  preferred_load: [15, 18],
  summer_preferred_load: [6, 9],
  graduation_thresholds: { internship: 0.65, specialized_project: 0.7, thesis: 0.85 },
};
const MAIN_SEMESTERS = 12; // QĐ 285 Điều 5.2: chính quy tối đa 12 kỳ chính

const lower = (text: string) => text.normalize('NFC').toLowerCase();

export function graduationKind(name: string): 'internship' | 'specialized_project' | 'thesis' | null {
  const low = lower(name);
  if (low.includes('thực tập')) return 'internship';
  if (low.includes('chuyên ngành')) return 'specialized_project';
  if (['tốt nghiệp', 'luận văn', 'khóa luận', 'khoá luận', 'capstone'].some((k) => low.includes(k))) return 'thesis';
  return null;
}

/** Các kỳ từ năm vào trường, đủ 12 kỳ chính và luôn chứa kỳ hiện tại cùng ít nhất 6 kỳ chính sau nó. */
export function semestersFor(cohort: number, current: string): string[] {
  const out: string[] = [];
  let yy = cohort % 100;
  const mains = () => out.filter((s) => !s.endsWith('3')).length;
  const mainsAfterCurrent = () => (out.includes(current)
    ? out.slice(out.indexOf(current) + 1).filter((s) => !s.endsWith('3')).length : 0);
  while (mains() < MAIN_SEMESTERS || mainsAfterCurrent() < 6) {
    out.push(`${yy}1`, `${yy}2`, `${yy}3`);
    yy += 1;
    if (yy > cohort % 100 + 20) break; // chặn vòng lặp khi kỳ hiện tại trước năm vào trường
  }
  return out;
}

export function buildPlannerInput(src: PlannerSource, dto: SolvePlanDto, today = new Date()) {
  const codeOf = new Map(src.items.map((it) => [it.course.id, it.course.code]));
  const nameOf = new Map(src.items.map((it) => [it.course.code, it.course.name]));
  const inCurriculum = new Set(codeOf.values());

  const categoryCodes = (prefix: string) => (src.categories.find((c) => c.name.trim().startsWith(prefix))
    ?.member_course_ids ?? []).map((id) => codeOf.get(id)).filter((c): c is string => !!c);
  const conditions = [...new Set(categoryCodes('E.'))].sort();
  const graduation: Record<string, string> = {};
  for (const code of categoryCodes('D.')) {
    const kind = graduationKind(nameOf.get(code) ?? '');
    if (kind) graduation[kind] = code;
  }

  const groupName = new Map(src.groups.map((g) => [g.id, g.name]));
  const specCode = new Map(src.specializations.map((s) => [s.id, s.code]));
  const inRoot = new Set<string>();
  const groups: Record<string, unknown>[] = src.groups.map((g) => {
    const members = g.member_course_ids.map((id) => codeOf.get(id)).filter((c): c is string => !!c).sort();
    const entry: Record<string, unknown> = {
      name: g.name, kind: g.kind, required_count: g.required_count, required_credits: g.required_credits,
      pool_scope: g.pool_scope, pool_course_credits: g.pool_course_credits, members,
    };
    if (g.parent_group_id) {
      entry.parent = groupName.get(g.parent_group_id);
      entry.specialization = g.specialization_id ? specCode.get(g.specialization_id) ?? null : null;
    } else if (g.pool_scope === 'listed') {
      members.forEach((c) => inRoot.add(c));
    }
    return entry;
  });
  const required = [...inCurriculum].filter((c) => !inRoot.has(c) && !conditions.includes(c)).sort();
  groups.unshift({ name: 'Bat buoc (suy ra)', kind: 'required', required_count: null, required_credits: null,
    pool_scope: 'listed', members: required });

  const relations = src.relations
    .map((r) => ({ course_code: codeOf.get(r.course_id), related_course_code: codeOf.get(r.related_course_id),
      type: r.type, source: 'curriculum' }))
    .filter((r) => r.course_code && r.related_course_code);

  const internship = graduation.internship;
  const summerExcluded = [...inCurriculum]
    .filter((c) => lower(nameOf.get(c) ?? '').includes('đồ án') && c !== internship).sort();
  const summerHistory = [...new Set(src.openedSemesters
    .filter((o) => o.semester_code.endsWith('3') && codeOf.has(o.course_id))
    .map((o) => codeOf.get(o.course_id) as string))].sort();

  const current = currentSemester(today);
  const cohort = src.profile.admission_year ?? src.curriculum.cohort;

  // Môn ngoài chương trình sinh viên đã khai: cần có trong `courses` (tính vào tự chọn tự do).
  const allCourses = new Map(src.items.map((it) => [it.course.code, it.course]));
  for (const sc of src.studentCourses) if (!allCourses.has(sc.course.code)) allCourses.set(sc.course.code, sc.course);
  const studentCourses = src.studentCourses
    .filter((sc) => sc.status !== 'not-started')
    .map((sc) => ({ course_code: sc.course.code, status: sc.status }));
  // Môn điều kiện (ENG_GC, ...) bị bộ giải bỏ khỏi chương trình nên không cần giả định đậu/rớt.
  const inProgress = studentCourses
    .filter((sc) => sc.status === 'in-progress' && !conditions.includes(sc.course_code))
    .map((sc) => sc.course_code);
  const results: Record<string, string> = {};
  for (const code of inProgress) results[code] = dto.in_progress_results?.[code] ?? 'pass';

  const scenario: Record<string, unknown> = { id: 'request', label: 'Yeu cau tu trang Goi y', in_progress_results: results };
  for (const key of ['max_credits', 'semester_limits', 'graduate_by', 'locked', 'not_offered', 'summer_opt_in',
    'preferences', 'use_inferred_relations'] as const) {
    if (dto[key] !== undefined && dto[key] !== null) scenario[key] = dto[key];
  }

  return {
    schema_version: 1,
    curriculum: { ...src.curriculum, cohort },
    rules: { ...PLANNER_RULES, summer_courses: internship ? [internship] : [] },
    semesters: semestersFor(cohort, current),
    courses: [...allCourses.values()].map((c) => ({ code: c.code, name: c.name, credits: c.credits }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    curriculum_courses: src.items.map((it) => ({ course_code: it.course.code, recommended_year: it.recommended_year,
      recommended_term: it.recommended_term })).sort((a, b) => a.course_code.localeCompare(b.course_code)),
    course_relations: relations,
    course_groups: groups,
    conditions,
    graduation_courses: graduation,
    summer_history: summerHistory,
    summer_excluded: summerExcluded,
    offerings: { unknown_policy: 'assume-open', records: [] },
    student: {
      current_semester: current,
      source: 'student_courses',
      target_specialization: src.profile.target_specialization_id
        ? specCode.get(src.profile.target_specialization_id) ?? null : null,
      flags: dto.student_flags ?? {},
      student_courses: studentCourses,
    },
    scenario,
    previous_plan: dto.previous_plan ?? undefined,
  };
}
