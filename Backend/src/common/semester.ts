/**
 * Mã học kỳ kiểu myBK (giống `Frontend/src/pages/courses/analysis/semester.ts`):
 * 2 số cuối năm bắt đầu năm học + số kỳ. 251 = 2025-2026 kỳ 1, 252 = kỳ 2, 253 = kỳ hè.
 */
export const SEMESTER_CODE = /^\d{2}[123]$/;

export const termOf = (code: string): number => Number(code[2]);

const toCode = (year: number, term: number) => `${String(year % 100).padStart(2, '0')}${term}`;

/** Tháng 8-12 là kỳ 1, tháng 1-5 kỳ 2, tháng 6-7 kỳ hè của năm học trước. */
export const currentSemester = (today = new Date()): string => {
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  if (month >= 8) return toCode(year, 1);
  if (month <= 5) return toCode(year - 1, 2);
  return toCode(year - 1, 3);
};

/** Học kỳ chính kế tiếp (bỏ qua kỳ hè). */
export const nextMainSemester = (code: string): string => {
  const year = 2000 + Number(code.slice(0, 2));
  return termOf(code) === 1 ? toCode(year, 2) : toCode(year + 1, 1);
};
