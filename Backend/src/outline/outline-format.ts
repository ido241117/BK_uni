/**
 * Định dạng nhập đề cương `bkuni.course-outlines` (mô tả đầy đủ ở Scraper/OUTLINE-FORMAT.md).
 * Hệ thống chỉ biết tới định dạng này, không biết dữ liệu được cào hay nhập tay.
 */
import { CourseRelationType } from '../curriculum/enum/course-relation-type';

export const OUTLINE_FORMAT = 'bkuni.course-outlines';
export const OUTLINE_FORMAT_VERSION = 1;
export const MAX_OUTLINES_PER_DOCUMENT = 5000;
const MAX_OUTLINE_BYTES = 1_000_000;

export type Bilingual = { vi: string | null; en: string | null } | null;

export interface OutlinePrerequisiteInput {
  type: CourseRelationType | null;
  type_raw: string | null;
  course_code: string;
  course_name?: Bilingual;
}

/** Các trường hệ thống đọc; phần còn lại được lưu nguyên trong `content`. */
export interface OutlineDocumentOutline {
  source_id?: string | null;
  source_code?: string | null;
  course_code: string;
  version: string;
  applies_from: string | null;
  updated_at?: string | null;
  name?: Bilingual;
  credits?: number | null;
  level?: { code: string | null } | null;
  course_type?: { code: string | null } | null;
  faculty?: { code: string | null } | null;
  prerequisites?: OutlinePrerequisiteInput[];
  [key: string]: unknown;
}

export interface OutlineDocument {
  format: string;
  format_version: number;
  generated_at?: string | null;
  source?: string | null;
  part?: number | null;
  parts?: number | null;
  count?: number | null;
  includes_lecturers?: boolean;
  outlines: unknown[];
}

/** Bản đã kiểm tra, sẵn sàng ghi vào bảng. */
export interface ValidOutline {
  course_code: string;
  version: string;
  applies_from: string | null;
  source_id: string | null;
  source_code: string | null;
  source_updated_at: Date | null;
  name_vi: string | null;
  name_en: string | null;
  credits: number | null;
  level_code: string | null;
  course_type_code: string | null;
  faculty_code: string | null;
  prerequisites: { type: string | null; type_raw: string | null; related_course_code: string }[];
  content: OutlineDocumentOutline;
}

export const COURSE_CODE = /^[A-Z0-9][A-Z0-9_.-]{0,49}$/;
export const SEMESTER_CODE = /^\d{2}[123]$/;
const RELATION_TYPES = new Set<string>(Object.values(CourseRelationType));

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const optionalString = (value: unknown, max: number): string | null => (
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null
);

const code = (value: unknown, max = 20): string | null => (
  isObject(value) ? optionalString(value.code, max) : null
);

/** Kiểm tra phần đầu file; lỗi ở đây làm hỏng cả file. */
export const validateDocumentHeader = (document: OutlineDocument): string[] => {
  const errors: string[] = [];
  if (document.format !== OUTLINE_FORMAT) errors.push(`format phải là "${OUTLINE_FORMAT}"`);
  if (document.format_version !== OUTLINE_FORMAT_VERSION) {
    errors.push(`format_version ${String(document.format_version)} chưa được hỗ trợ (hỗ trợ: ${OUTLINE_FORMAT_VERSION})`);
  }
  if (!Array.isArray(document.outlines)) errors.push('outlines phải là mảng');
  else if (document.outlines.length > MAX_OUTLINES_PER_DOCUMENT) {
    errors.push(`Tối đa ${MAX_OUTLINES_PER_DOCUMENT} đề cương mỗi file`);
  }
  return errors;
};

/** Kiểm tra một đề cương; trả `errors` rỗng khi hợp lệ. */
export const validateOutline = (raw: unknown): { outline: ValidOutline | null; errors: string[] } => {
  const errors: string[] = [];
  if (!isObject(raw)) return { outline: null, errors: ['Không phải object'] };

  const courseCode = typeof raw.course_code === 'string' ? raw.course_code.trim().toUpperCase() : '';
  if (!COURSE_CODE.test(courseCode)) errors.push(`course_code không hợp lệ: ${JSON.stringify(raw.course_code)}`);

  const version = typeof raw.version === 'string' ? raw.version.trim() : '';
  if (!version || version.length > 20) errors.push(`version không hợp lệ: ${JSON.stringify(raw.version)}`);

  const appliesFrom = raw.applies_from ?? null;
  if (appliesFrom !== null && (typeof appliesFrom !== 'string' || !SEMESTER_CODE.test(appliesFrom))) {
    errors.push(`applies_from phải là mã học kỳ 3 số hoặc null: ${JSON.stringify(appliesFrom)}`);
  }

  let updatedAt: Date | null = null;
  if (raw.updated_at !== undefined && raw.updated_at !== null) {
    updatedAt = typeof raw.updated_at === 'string' ? new Date(raw.updated_at) : null;
    if (!updatedAt || Number.isNaN(updatedAt.getTime())) errors.push(`updated_at không phải ngày hợp lệ: ${JSON.stringify(raw.updated_at)}`);
  }

  const credits = raw.credits ?? null;
  if (credits !== null && (typeof credits !== 'number' || !Number.isFinite(credits) || credits < 0 || credits > 100)) {
    errors.push(`credits không hợp lệ: ${JSON.stringify(credits)}`);
  }

  const prerequisites: ValidOutline['prerequisites'] = [];
  if (raw.prerequisites !== undefined && !Array.isArray(raw.prerequisites)) errors.push('prerequisites phải là mảng');
  (Array.isArray(raw.prerequisites) ? raw.prerequisites : []).slice(0, 200).forEach((item, index) => {
    if (!isObject(item)) {
      errors.push(`prerequisites[${index}] không phải object`);
      return;
    }
    const related = typeof item.course_code === 'string' ? item.course_code.trim().toUpperCase() : '';
    if (!COURSE_CODE.test(related)) {
      errors.push(`prerequisites[${index}].course_code không hợp lệ: ${JSON.stringify(item.course_code)}`);
      return;
    }
    const type = item.type ?? null;
    if (type !== null && (typeof type !== 'string' || !RELATION_TYPES.has(type))) {
      errors.push(`prerequisites[${index}].type phải là ${[...RELATION_TYPES].join('/')} hoặc null`);
      return;
    }
    prerequisites.push({ type, type_raw: optionalString(item.type_raw, 20), related_course_code: related });
  });

  for (const key of ['learning_outcomes', 'assessment_activities', 'outcome_assessments', 'sessions', 'programs']) {
    if (raw[key] !== undefined && !Array.isArray(raw[key])) errors.push(`${key} phải là mảng`);
  }
  if (Buffer.byteLength(JSON.stringify(raw), 'utf8') > MAX_OUTLINE_BYTES) errors.push('Đề cương vượt 1 MB');

  if (errors.length) return { outline: null, errors };

  const name = isObject(raw.name) ? raw.name : {};
  const content = { ...raw, course_code: courseCode, version } as OutlineDocumentOutline;
  return {
    errors,
    outline: {
      course_code: courseCode,
      version,
      applies_from: appliesFrom as string | null,
      source_id: optionalString(raw.source_id, 50),
      source_code: optionalString(raw.source_code, 100),
      source_updated_at: updatedAt,
      name_vi: optionalString(name.vi, 500),
      name_en: optionalString(name.en, 500),
      credits: credits as number | null,
      level_code: code(raw.level),
      course_type_code: code(raw.course_type),
      faculty_code: code(raw.faculty),
      prerequisites,
      content,
    },
  };
};

/** So sánh phiên bản dạng "14.1" theo số (14.1 > 9.1). */
export const compareVersions = (a: string, b: string): number => {
  const parse = (value: string) => value.split('.').map(part => Number.parseInt(part, 10) || 0);
  const [left, right] = [parse(a), parse(b)];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
};

/**
 * Chọn đề cương dùng cho học kỳ `semester`: `applies_from` lớn nhất nhưng <= semester; trùng thì version lớn nhất.
 * Không có bản nào <= semester thì `null` (bản "tương lai" vẫn xem được trong danh sách phiên bản).
 */
export const pickOutlineForSemester = <T extends { applies_from: string | null; version: string }>(
  versions: T[],
  semester: string,
): T | null => {
  const candidates = versions.filter(item => item.applies_from !== null && item.applies_from <= semester);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => (
    a.applies_from!.localeCompare(b.applies_from!) || compareVersions(a.version, b.version)
  )).at(-1)!;
};
