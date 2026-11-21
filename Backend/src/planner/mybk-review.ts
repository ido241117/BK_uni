/**
 * T32 (21/11): xem trước file PDF tiến độ myBK trước khi ghi. Hàm thuần, không đụng database.
 *
 * - Tìm chương trình theo mã CTĐT myBK: `official_program_code` của file = `curricula.source_code`.
 * - Liệt kê mâu thuẫn giữa file và chương trình trên web để sinh viên xem rồi mới bấm Xác nhận.
 * - Mã chứng chỉ của myBK (vd `CCGDTC`) tương ứng với môn nào trên web: database không lưu liên kết này,
 *   nên suy theo tên môn (`CERTIFICATES`) và ghi rõ cách suy.
 */
import { StudentCourseStatus } from '../student/enum/student-course-status';

export interface ReviewFileCourse {
  code: string;
  name?: string | null;
  credits?: number;
  passed: boolean;
}

export interface ReviewFile {
  format: string;
  official_program_code?: string | null;
  total_required?: number | null;
  blocks: { name: string; kind: string; courses: ReviewFileCourse[] }[];
  graduation_conditions?: ReviewFileCourse[];
  checks?: { id: string; ok: boolean; detail: string }[];
}

export interface ReviewCurriculum {
  id: string;
  code: string;
  name: string;
  cohort: number;
  source_code: string | null;
  source_version: string | null;
  total_credits: number | null;
  courses: { code: string; name: string; credits: number }[];
  regulations: { name: string; detail: string | null }[];
}

export type ConflictLevel = 'error' | 'warning' | 'info';
export interface ReviewConflict {
  id: string;
  level: ConflictLevel;
  title: string;
  codes?: string[];
}

/** Khối "Môn học ngoài CTĐT" của myBK (`planner/mybk.py`, OUTSIDE_KIND). */
const OUTSIDE = 'NGOAICTDT';

/**
 * Mã chứng chỉ myBK → môn trên web. myBK khóa 2023 gộp GDTC 1, 2 thành một dòng `CCGDTC`; web tách PE1003, PE1005.
 * Kiểm 21/11: PE1003, PE1005 (0 TC) có trong cả 132 chương trình; chỉ 46 chương trình có quy định ghi
 * "Trên myBK ghi theo CCGDTC" (khóa 2024, 2026 ghi PE1009, PE1011…). Nên chỉ áp dụng khi quy định của chương trình
 * nhắc đúng mã chứng chỉ, và chỉ lấy môn có trong chương trình.
 */
export const CERTIFICATES: Record<string, string[]> = { CCGDTC: ['PE1003', 'PE1005'] };

/**
 * Môn trên web tương ứng mã chứng chỉ có trong file, kèm đạt/chưa theo file. Hàm thuần, dùng cho cả xem trước
 * (`reviewMybk`) lẫn lúc ghi (`importMybk`): chứng chỉ đạt thì các môn tương ứng ghi "Đã hoàn thành".
 */
export function certificateCourses(
  fileRows: { code: string; passed: boolean }[],
  curriculum: { courses: { code: string }[]; regulations: { detail: string | null }[] },
) {
  const inCurriculum = new Set(curriculum.courses.map((c) => c.code));
  return Object.entries(CERTIFICATES).flatMap(([fileCode, webCodes]) => {
    const row = fileRows.find((r) => r.code === fileCode);
    if (!row || !curriculum.regulations.some((r) => (r.detail ?? '').includes(fileCode))) return [];
    const codes = webCodes.filter((c) => inCurriculum.has(c));
    return codes.length ? [{ file_code: fileCode, passed: row.passed, codes }] : [];
  });
}

const fileStatus = (passed: boolean) => (passed ? StudentCourseStatus.COMPLETED : StudentCourseStatus.NOT_STARTED);

export function reviewMybk(args: {
  file: ReviewFile;
  matched: ReviewCurriculum | null;
  /** `source_code`: mã myBK của chương trình đang ghi trong hồ sơ; người dùng chỉ thấy mã này (người duyệt 21/11). */
  profileCurriculum: { id: string; code: string; name: string; source_code?: string | null } | null;
  /** Danh mục môn của web theo mã (mọi chương trình). */
  catalog: Map<string, { name: string; credits: number }>;
  /** Trạng thái môn hiện có trên web của tài khoản, theo mã. */
  webStatus: Map<string, string>;
  /** Tên các môn đang có trên web (để liệt kê môn sẽ bị xóa khi nhập). */
  webNames?: Map<string, string>;
  hasPreviousImport: boolean;
}) {
  const { file, matched, profileCurriculum, catalog, webStatus, webNames, hasPreviousImport } = args;
  const conflicts: ReviewConflict[] = [];
  const add = (id: string, level: ConflictLevel, title: string, codes?: string[]) => {
    if (!codes || codes.length) conflicts.push({ id, level, title, ...(codes ? { codes } : {}) });
  };

  const rows = file.blocks.flatMap((b) => b.courses.map((c) => ({ ...c, kind: b.kind })));
  const conditions = file.graduation_conditions ?? [];
  const programCode = file.official_program_code ?? null;

  // Tự kiểm tra của bộ đọc file (cộng tín chỉ, đếm khối): sai thì có thể đọc lệch.
  for (const check of file.checks ?? []) {
    if (!check.ok) add(`check:${check.id}`, 'error', `Bộ đọc file tự kiểm tra không qua: ${check.detail}`);
  }

  // Chương trình.
  if (!programCode) add('program_code_missing', 'error', 'File không có mã chương trình đào tạo ở dòng "Ngành:".');
  else if (!matched) add('program_not_found', 'error', `Không có chương trình nào trên web mang mã myBK ${programCode}.`);
  if (matched) {
    // Mã nội bộ của web (vd CS-2023-KHMT) không hiện cho người dùng; chỉ hiện mã CTĐT myBK.
    if (!profileCurriculum) {
      add('profile_missing', 'warning', `Tài khoản chưa có chương trình đào tạo. Bấm Xác nhận sẽ đặt chương trình ${programCode}.`);
    } else if (profileCurriculum.id !== matched.id) {
      add('profile_differs', 'warning',
        `Tài khoản đang theo chương trình ${profileCurriculum.source_code ?? profileCurriculum.name}, nhưng file thuộc ${programCode}. `
        + 'Bấm Xác nhận sẽ đổi sang chương trình của file.');
    }
    if (file.total_required != null && matched.total_credits != null && file.total_required !== matched.total_credits) {
      add('total_credits', 'warning',
        `Tổng tín chỉ tốt nghiệp: file ghi ${file.total_required}, chương trình trên web ghi ${matched.total_credits}.`);
    }
  }

  // Mã chứng chỉ ↔ môn trên web.
  const nameOf = new Map((matched?.courses ?? []).map((c) => [c.code, c.name]));
  const equivalents = matched
    ? certificateCourses([...rows, ...conditions], matched).map((e) => ({
      file_code: e.file_code, passed: e.passed, courses: e.codes.map((code) => ({ code, name: nameOf.get(code) ?? code })),
    }))
    : [];
  const equivalentFile = new Set(equivalents.map((e) => e.file_code));
  // File không cho biết GDTC (vd khóa 2024, 2026 myBK ghi môn thể thao PE1009… thay vì CCGDTC): coi là chưa hoàn thành.
  // Bộ giải không xếp GDTC (NOT_SCHEDULED_CODES trong planner-input.ts), nên chỉ báo.
  const gdtcCodes = (CERTIFICATES.CCGDTC ?? []).filter((c) => matched?.courses.some((x) => x.code === c));
  if (matched && gdtcCodes.length && !equivalents.length) {
    add('gdtc_unknown', 'warning',
      `Chưa hoàn thành GDTC: file không ghi chứng chỉ GDTC (CCGDTC), nên web coi ${gdtcCodes.join(', ')} là chưa hoàn thành. `
      + 'Lộ trình không xếp GDTC.');
  }
  const equivalentWeb = new Set(equivalents.flatMap((e) => e.courses.map((c) => c.code)));

  // Môn: so file với chương trình tìm được.
  if (matched) {
    const inCurriculum = new Map(matched.courses.map((c) => [c.code, c]));
    const listed = new Set([...rows.map((c) => c.code), ...conditions.map((c) => c.code)]);
    // Môn ngoài chương trình được tính vào tự chọn tự do (quyết định 19/11; normalize.py của bộ giải làm vậy).
    add('free_elective', 'info', 'Môn ngoài chương trình, tính vào tự chọn tự do',
      // Môn 0 TC (vd môn thể thao PE1009 của khóa 2024+) không đóng góp tín chỉ nên không tính tự chọn tự do.
      rows.filter((c) => c.kind !== OUTSIDE && !inCurriculum.has(c.code) && !equivalentFile.has(c.code) && c.credits !== 0)
        .map((c) => c.code).sort());
    add('missing_in_file', 'warning', 'Môn thuộc chương trình trên web nhưng file không liệt kê',
      matched.courses.filter((c) => !listed.has(c.code) && !equivalentWeb.has(c.code) && !gdtcCodes.includes(c.code))
        .map((c) => c.code).sort());
    add('credit_mismatch', 'warning', 'Tín chỉ trong file khác tín chỉ trên web',
      rows.filter((c) => c.credits != null && inCurriculum.has(c.code) && inCurriculum.get(c.code)!.credits !== c.credits)
        .map((c) => `${c.code} (file ${c.credits}, web ${inCurriculum.get(c.code)!.credits})`));
  }
  add('unknown_codes', 'info', 'Mã không có trong danh mục môn của web: chỉ lưu trong tiến độ, không ghi trạng thái',
    [...new Set([...rows, ...conditions].map((c) => c.code))].filter((c) => !catalog.has(c) && !equivalentFile.has(c)).sort());

  // Trạng thái môn sẽ đổi khi bấm Xác nhận (ghi đúng như file; chứng chỉ ghi vào các môn tương ứng).
  const passedByCode = new Map<string, boolean>();
  const certRows = equivalents.flatMap((e) => e.courses.map((c) => ({ code: c.code, passed: e.passed })));
  for (const row of [...rows, ...conditions, ...certRows]) {
    passedByCode.set(row.code, (passedByCode.get(row.code) ?? false) || row.passed);
  }
  const statusName = (code: string) => catalog.get(code)?.name ?? nameOf.get(code);
  const statusChanges = [...passedByCode]
    .filter(([code]) => statusName(code) !== undefined)
    .map(([code, passed]) => ({ code, name: statusName(code)!, web: webStatus.get(code) ?? null, file: fileStatus(passed) as string | null }))
    .filter((c) => c.web !== c.file);
  // Môn đang có trên web mà file không nhắc tới: lúc lưu bị xóa (mặc định Chưa học), người duyệt 21/11. `file: null`.
  for (const [code, status] of webStatus) {
    if (!passedByCode.has(code)) statusChanges.push({ code, name: webNames?.get(code) ?? code, web: status, file: null });
  }
  statusChanges.sort((a, b) => a.code.localeCompare(b.code));

  const order: Record<ConflictLevel, number> = { error: 0, warning: 1, info: 2 };
  conflicts.sort((a, b) => order[a.level] - order[b.level]);
  return {
    program: {
      official_program_code: programCode,
      matched: matched ? {
        id: matched.id, code: matched.code, name: matched.name, cohort: matched.cohort,
        source_code: matched.source_code, source_version: matched.source_version, total_credits: matched.total_credits,
        course_count: matched.courses.length,
      } : null,
      profile: profileCurriculum,
      same_as_profile: !!matched && profileCurriculum?.id === matched.id,
    },
    equivalents,
    conflicts,
    status_changes: statusChanges,
    has_previous_import: hasPreviousImport,
    /** Có lỗi (không tìm được chương trình, đọc file không qua tự kiểm tra) thì không cho ghi. */
    can_confirm: !conflicts.some((c) => c.level === 'error'),
  };
}
