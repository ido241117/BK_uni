import { StudentCourseStatus } from '../student/enum/student-course-status';

/** Một dòng môn trong JSON của `python -m planner.mybk` (PDF). */
export interface ImportedCourse {
  code: string;
  passed: boolean;
}

export interface ImportedFile {
  format: string;
  official_program_code?: string | null;
  updated_at?: string | null;
  blocks: { courses: ImportedCourse[] }[];
  graduation_conditions?: ImportedCourse[];
}

export interface ImportStatusPlan {
  /** Ghi vào `student_courses`: ✓ thành "Đã hoàn thành", "--" thành "Chưa học". */
  items: { course_id: string; status: StudentCourseStatus }[];
  /** Mã có trong file nhưng không có trong danh mục web: chỉ nằm trong JSON đã lưu. */
  unknown_codes: string[];
}

/**
 * Hàm thuần (T28): file đã đọc + danh mục môn (mã -> id) -> trạng thái môn cần ghi.
 * Ghi đúng như file; môn không có trong file thì không đụng tới (người duyệt chốt 20/11).
 * Một mã xuất hiện hai lần (khối và điều kiện tốt nghiệp) thì "đạt" thắng.
 */
export function planImportStatuses(file: ImportedFile, idByCode: Map<string, string>): ImportStatusPlan {
  const passedByCode = new Map<string, boolean>();
  const rows = [...file.blocks.flatMap((b) => b.courses), ...(file.graduation_conditions ?? [])];
  for (const row of rows) passedByCode.set(row.code, (passedByCode.get(row.code) ?? false) || row.passed);

  const items: ImportStatusPlan['items'] = [];
  const unknown: string[] = [];
  for (const [code, passed] of passedByCode) {
    const id = idByCode.get(code);
    if (!id) {
      unknown.push(code);
      continue;
    }
    items.push({ course_id: id, status: passed ? StudentCourseStatus.COMPLETED : StudentCourseStatus.NOT_STARTED });
  }
  return { items, unknown_codes: unknown.sort() };
}

/** Lấy mọi mã môn trong file (khối + điều kiện tốt nghiệp), không trùng. */
export function importedCodes(file: ImportedFile): string[] {
  const rows = [...file.blocks.flatMap((b) => b.courses), ...(file.graduation_conditions ?? [])];
  return [...new Set(rows.map((r) => r.code))];
}
