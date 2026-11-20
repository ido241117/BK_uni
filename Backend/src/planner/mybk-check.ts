/**
 * Đối chiếu file tiến độ myBK (đã đọc bằng `pipeline/planner/mybk.py`) với database. Hàm thuần, để test được.
 *
 * - T20: tự nhận chương trình. Có mã chương trình myBK (chỉ PDF có) và có trong bảng nối
 *   `pipeline/planner/data/mybk-program-map.json` thì dùng; không thì so danh sách môn đã đạt với từng chương trình.
 * - T21: cảnh báo khi chương trình sinh viên đã chọn khớp kém hơn rõ rệt.
 * - T23: so file với dữ liệu chương trình của nhóm (môn không có trong chương trình, tín chỉ lệch).
 * - Đề xuất trạng thái môn để sinh viên xác nhận (T22). Không ghi gì vào database ở đây.
 */

export type MybkCourse = { code: string; credits: number; passed: boolean; free_elective: boolean };
export type MybkBlock = { name: string; kind: string; required_credits: number; earned_credits: number;
  courses: MybkCourse[] };
export type MybkParsed = {
  status: string; format: string; official_program_code: string | null; total_required: number | null;
  total_earned: number | null; exported_semester: string | null; blocks: MybkBlock[];
  /** Khóa suy từ MSSV (chỉ năm, không có MSSV). */
  cohort_hint?: number | null;
  /** Chỉ PDF: ngày myBK cập nhật (yyyy-mm-dd) và điều kiện tốt nghiệp (ENG_GC_600, SA4001...). */
  updated_at?: string | null;
  graduation_conditions?: { code: string; passed: boolean }[];
  checks: { id: string; ok: boolean; detail: string }[];
};
export type CatalogCourse = { id: string; code: string; name: string; credits: number };
export type CurriculumCourses = { id: string; code: string; name: string; cohort: number; courseCodes: string[] };

const OUTSIDE = 'NGOAICTDT';
/** Chương trình đã chọn khớp kém hơn chương trình tốt nhất quá mức này thì cảnh báo. */
const WORSE_BY = 0.05;
/** Chương trình đã chọn khớp dưới mức này thì cảnh báo. */
const LOW_COVERAGE = 0.8;

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function analyzeMybk(args: {
  parsed: MybkParsed;
  curricula: CurriculumCourses[];
  chosenCurriculumId: string | null;
  chosenCourses: CatalogCourse[];
  catalog: CatalogCourse[];
  statusByCode: Map<string, string>;
  programMap: Record<string, string>;
}) {
  const { parsed, curricula, chosenCurriculumId, chosenCourses, catalog, statusByCode, programMap } = args;
  // Excel: mọi dòng là môn đã đạt. PDF: liệt kê cả môn chưa đạt (`passed: false`).
  const fileCourses = parsed.blocks.flatMap((b) => b.courses.map((c) => ({ ...c, block: b.name, kind: b.kind })));
  const passedCodes = new Set(fileCourses.filter((c) => c.passed).map((c) => c.code));
  const conditions = parsed.graduation_conditions ?? [];
  const listedCodes = new Set([...fileCourses.map((c) => c.code), ...conditions.map((c) => c.code)]);
  // Nhận chương trình theo mọi môn file liệt kê trong CTĐT (PDF: cả chương trình; Excel: môn đã đạt).
  const inProgram = fileCourses.filter((c) => c.kind !== OUTSIDE).map((c) => c.code);

  // T20: nhận chương trình. Các khóa cùng ngành thường có danh sách môn giống hệt nhau, nên khi khớp
  // bằng nhau thì ưu tiên chương trình đúng khóa (suy từ file), rồi chương trình sinh viên đã chọn.
  const hint = parsed.cohort_hint ?? null;
  const round = (x: number) => Math.round(x * 1000) / 1000;
  const ranked = curricula
    .map((cur) => {
      const set = new Set(cur.courseCodes);
      const matched = inProgram.filter((c) => set.has(c)).length;
      return { curriculum_id: cur.id, code: cur.code, name: cur.name, cohort: cur.cohort,
        coverage: inProgram.length ? matched / inProgram.length : 0 };
    })
    .sort((a, b) => round(b.coverage) - round(a.coverage)
      || Number(hint !== null && a.cohort !== hint) - Number(hint !== null && b.cohort !== hint)
      || Number(a.curriculum_id !== chosenCurriculumId) - Number(b.curriculum_id !== chosenCurriculumId)
      || a.code.localeCompare(b.code));
  const mappedCode = parsed.official_program_code ? programMap[parsed.official_program_code] : undefined;
  const mapped = mappedCode ? ranked.find((r) => r.code === mappedCode) : undefined;
  const best = mapped ?? ranked[0] ?? null;
  const chosen = ranked.find((r) => r.curriculum_id === chosenCurriculumId) ?? null;

  // T21: kiểm tra chương trình đã chọn.
  let warning: string | null = null;
  if (!chosen) {
    warning = 'Bạn chưa chọn chương trình đào tạo trong hồ sơ.'
      + (best ? ` File khớp nhất với ${best.code} (${pct(best.coverage)} môn đã đạt).` : '');
  } else if (best && best.curriculum_id !== chosen.curriculum_id
    && (mapped || best.coverage - chosen.coverage > WORSE_BY)) {
    warning = `Bạn đang chọn ${chosen.code} (khớp ${pct(chosen.coverage)} môn đã đạt), `
      + `nhưng file khớp ${best.code} hơn (${pct(best.coverage)}). Kiểm tra lại chương trình trong hồ sơ.`;
  } else if (best && best.curriculum_id !== chosen.curriculum_id && hint !== null
    && chosen.cohort !== hint && best.cohort === hint) {
    warning = `File là của sinh viên khóa ${hint}, nhưng bạn đang chọn ${chosen.code} (khóa ${chosen.cohort}). `
      + `Chương trình khóa ${hint} khớp nhất: ${best.code}. Kiểm tra lại chương trình trong hồ sơ.`;
  } else if (chosen.coverage < LOW_COVERAGE) {
    warning = `Chỉ ${pct(chosen.coverage)} môn đã đạt trong file thuộc chương trình ${chosen.code}. `
      + 'Có thể bạn chọn sai chương trình, hoặc dữ liệu chương trình của web còn thiếu.';
  }

  // T23: so dữ liệu chương trình của nhóm.
  const catalogByCode = new Map(catalog.map((c) => [c.code, c]));
  const chosenByCode = new Map(chosenCourses.map((c) => [c.code, c]));
  const notInCurriculum = fileCourses
    .filter((c) => c.kind !== OUTSIDE && !chosenByCode.has(c.code))
    .map((c) => ({ code: c.code, block: c.block, in_catalog: catalogByCode.has(c.code) }));
  const creditMismatches = fileCourses
    .filter((c) => catalogByCode.has(c.code) && catalogByCode.get(c.code)!.credits !== c.credits)
    .map((c) => ({ code: c.code, file_credits: c.credits, web_credits: catalogByCode.get(c.code)!.credits }));
  const unknownCodes = fileCourses.filter((c) => !catalogByCode.has(c.code)).map((c) => c.code);
  // Chỉ PDF liệt kê cả chương trình: môn chương trình của web có mà file không có.
  const missingInFile = parsed.format === 'pdf'
    ? chosenCourses.filter((c) => !listedCodes.has(c.code)).map((c) => c.code).sort() : [];

  // Đề xuất trạng thái (T22).
  const passed = fileCourses
    .filter((c) => c.passed && catalogByCode.has(c.code))
    .map((c) => {
      const course = catalogByCode.get(c.code)!;
      return { course_id: course.id, code: c.code, name: course.name, credits: course.credits,
        current_status: statusByCode.get(c.code) ?? null, outside_curriculum: !chosenByCode.has(c.code) };
    });
  const notPassed = chosenCourses
    .filter((c) => !passedCodes.has(c.code))
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((c) => ({ course_id: c.id, code: c.code, name: c.name, credits: c.credits,
      current_status: statusByCode.get(c.code) ?? null }));

  return {
    file: {
      format: parsed.format, total_required: parsed.total_required, total_earned: parsed.total_earned,
      exported_semester: parsed.exported_semester, updated_at: parsed.updated_at ?? null, cohort_hint: hint,
      official_program_code: parsed.official_program_code, checks: parsed.checks,
      course_count: fileCourses.length, passed_count: passedCodes.size,
      blocks: parsed.blocks.map((b) => ({ name: b.name, kind: b.kind, required_credits: b.required_credits,
        earned_credits: b.earned_credits, course_count: b.courses.length })),
      graduation_conditions: conditions,
      lists_only_passed: parsed.format === 'xlsx',
    },
    detection: {
      method: mapped ? 'program_code' : 'course_overlap',
      best, chosen, candidates: ranked.slice(0, 3), warning,
    },
    data_check: { not_in_curriculum: notInCurriculum, credit_mismatches: creditMismatches, unknown_codes: unknownCodes,
      missing_in_file: missingInFile },
    passed,
    /** Môn chương trình đã chọn mà file không có: sinh viên tự chọn chưa học / đang học / rớt. */
    not_passed: notPassed,
  };
}
