/**
 * Cấu hình index Elasticsearch cho đề cương môn học và cách chuyển một đề cương (JSONB) thành tài liệu tìm kiếm.
 *
 * Mỗi môn là MỘT tài liệu (`_id` = mã môn), dùng bản đề cương áp dụng cho học kỳ hiện tại.
 */

/**
 * Từ đồng nghĩa / viết tắt thường gặp khi sinh viên hỏi (đã bỏ dấu vì chạy sau `asciifolding`).
 * - Dòng `a, b, c`: tương đương hai chiều.
 * - Dòng `x => x, y`: một chiều, dùng cho viết tắt trùng từ thông dụng (ví dụ "ai" cũng là đại từ "ai"):
 *   gõ "ai" thì tìm cả "trí tuệ nhân tạo", nhưng gõ "trí tuệ nhân tạo" không kéo theo mọi chữ "ai".
 */
export const SEARCH_SYNONYMS = [
  'co so du lieu, database',
  'csdl => csdl, co so du lieu, database',
  'tri tue nhan tao, artificial intelligence',
  'ai => ai, tri tue nhan tao, artificial intelligence',
  'hoc may, may hoc, machine learning',
  'ml => ml, hoc may, machine learning',
  'hoc sau, deep learning, mang no ron, neural network',
  'xu ly ngon ngu tu nhien, natural language processing',
  'nlp => nlp, xu ly ngon ngu tu nhien, natural language processing',
  'thi giac may tinh, computer vision, xu ly anh',
  'lap trinh huong doi tuong, object oriented programming',
  'oop => oop, lap trinh huong doi tuong, object oriented programming',
  'cau truc du lieu, data structure',
  'ctdl => ctdl, cau truc du lieu, data structure',
  'giai thuat, thuat toan, algorithm',
  'he dieu hanh, operating system',
  'hdh => hdh, he dieu hanh, operating system',
  'mang may tinh, computer network',
  'mmt => mmt, mang may tinh, computer network',
  'cong nghe phan mem, ky thuat phan mem, software engineering',
  'cnpm => cnpm, cong nghe phan mem, software engineering',
  'kien truc may tinh, computer architecture',
  'an ninh mang, an toan thong tin, bao mat, security',
  'internet van vat, internet of things',
  'iot => iot, internet van vat, internet of things',
  'dien toan dam may, cloud computing',
  'do an, project',
  'thuc tap, internship',
] as const;

export const OUTLINE_INDEX_SETTINGS = {
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis: {
    filter: {
      bk_synonyms: { type: 'synonym_graph', synonyms: [...SEARCH_SYNONYMS], lenient: true },
    },
    normalizer: {
      code_normalizer: { type: 'custom', filter: ['lowercase', 'asciifolding'] },
    },
    analyzer: {
      // Lúc ghi: tách từ, chữ thường, bỏ dấu ("Cơ sở dữ liệu" -> co | so | du | lieu).
      vi_folded: { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'asciifolding'] },
      // Lúc tìm: như trên + mở rộng từ đồng nghĩa (synonym_graph chỉ dùng được ở phía truy vấn).
      vi_folded_search: { type: 'custom', tokenizer: 'standard', filter: ['lowercase', 'asciifolding', 'bk_synonyms'] },
      // Giữ nguyên dấu: khớp đúng dấu được cộng điểm cao hơn ("mạng" xếp trên "mang", "măng").
      vi_exact: { type: 'custom', tokenizer: 'standard', filter: ['lowercase'] },
    },
  },
} as const;

/** Trường văn bản: bản bỏ dấu (tìm chính) + field con `.exact` giữ dấu. */
const text = { type: 'text', analyzer: 'vi_folded', search_analyzer: 'vi_folded_search', fields: { exact: { type: 'text', analyzer: 'vi_exact' } } };
const keyword = { type: 'keyword' };

export const OUTLINE_INDEX_MAPPINGS = {
  dynamic: 'strict',
  properties: {
    code: { type: 'keyword', normalizer: 'code_normalizer' },
    version: keyword,
    applies_from: keyword,
    credits: { type: 'float' },
    name_vi: text,
    name_en: text,
    faculty: keyword,
    department: keyword,
    course_type: keyword,
    objectives: text,
    summary: text,
    learning_outcomes: text,
    sessions: text,
    assessment: text,
    study_guide: text,
    references: text,
    final_exam_format: keyword,
    midterm_format: keyword,
    has_lab: { type: 'boolean' },
    has_project: { type: 'boolean' },
    total_study_hours: { type: 'float' },
    indexed_at: { type: 'date' },
  },
} as const;

/** Các trường văn bản cùng trọng số khi tìm (tên và mục tiêu quan trọng hơn tài liệu tham khảo). */
export const SEARCH_FIELDS = [
  'name_vi^4', 'name_en^3', 'objectives^2', 'summary^2', 'learning_outcomes^1.5', 'sessions^1.2',
  'assessment', 'study_guide^0.5', 'references^0.5',
] as const;

/** Trường dùng cho "môn tương tự" (bỏ đánh giá, tài liệu: chỉ so nội dung chuyên môn). */
export const SIMILARITY_FIELDS = ['name_vi', 'name_en', 'objectives', 'summary', 'learning_outcomes', 'sessions'] as const;

type Bilingual = { vi?: string | null; en?: string | null } | null | undefined;
type Named = { code?: string | null; name?: Bilingual } | null | undefined;
type Exam = { format?: Named; duration_minutes?: number | null } | null | undefined;

interface OutlineContent {
  name?: Bilingual;
  faculty?: Named;
  department?: Named;
  course_type?: Named;
  objectives?: Bilingual;
  summary?: Bilingual;
  study_guide?: Bilingual;
  references?: Bilingual;
  learning_outcomes?: { code?: string | null; framework?: string | null; name?: Bilingual }[];
  sessions?: { label?: string | null; content?: Bilingual }[];
  hours?: { total_study_hours?: number | null; breakdown?: Record<string, number> } | null;
  credit_breakdown?: Record<string, number> | null;
  assessment?: { weights?: Record<string, number> | null; midterm?: Exam; final_exam?: Exam } | null;
}

export interface OutlineRow {
  course_code: string;
  version: string;
  applies_from: string | null;
  credits: number | null;
  name_vi: string | null;
  name_en: string | null;
  content: unknown;
}

export interface OutlineSearchDocument {
  code: string;
  version: string;
  applies_from: string | null;
  credits: number | null;
  name_vi: string | null;
  name_en: string | null;
  faculty: string | null;
  department: string | null;
  course_type: string | null;
  objectives: string | null;
  summary: string | null;
  learning_outcomes: string[];
  sessions: string[];
  assessment: string | null;
  study_guide: string | null;
  references: string | null;
  final_exam_format: string | null;
  midterm_format: string | null;
  has_lab: boolean;
  has_project: boolean;
  total_study_hours: number | null;
  indexed_at: string;
}

const WEIGHT_LABEL: Record<string, string> = {
  final_exam: 'thi cuối kỳ', midterm: 'thi giữa kỳ', assignment: 'bài tập lớn', lab: 'thí nghiệm',
  project: 'đồ án', exercise: 'bài tập', thesis: 'luận văn', internship: 'thực tập', self_study: 'tự học',
  theory_other: 'lý thuyết khác', other: 'khác',
};

const both = (value: Bilingual): string | null => {
  const parts = [value?.vi, value?.en].map(part => part?.trim()).filter(Boolean);
  return parts.length ? parts.join('\n') : null;
};
const examText = (label: string, exam: Exam) => {
  const format = exam?.format?.name?.vi ?? exam?.format?.code;
  if (!format && !exam?.duration_minutes) return null;
  return `${label}: ${format ?? 'không rõ hình thức'}${exam?.duration_minutes ? ` ${exam.duration_minutes} phút` : ''}`;
};

/** Đề cương (bảng course_outlines) -> tài liệu Elasticsearch. Hàm thuần, không gọi CSDL. */
export function toSearchDocument(row: OutlineRow, now = new Date()): OutlineSearchDocument {
  const content = (row.content ?? {}) as OutlineContent;
  const assessment = content.assessment ?? {};
  const weights = Object.entries(assessment.weights ?? {})
    .filter(([, value]) => typeof value === 'number' && value > 0)
    .map(([key, value]) => `${WEIGHT_LABEL[key] ?? key} ${value}%`);
  const breakdown = { ...(content.credit_breakdown ?? {}), ...(content.hours?.breakdown ?? {}) };
  return {
    code: row.course_code.toUpperCase(),
    version: row.version,
    applies_from: row.applies_from,
    credits: row.credits,
    name_vi: row.name_vi ?? content.name?.vi ?? null,
    name_en: row.name_en ?? content.name?.en ?? null,
    faculty: content.faculty?.name?.vi ?? null,
    department: content.department?.name?.vi ?? null,
    course_type: content.course_type?.name?.vi ?? null,
    objectives: both(content.objectives),
    summary: both(content.summary),
    learning_outcomes: (content.learning_outcomes ?? [])
      .map(item => [item.code, both(item.name)].filter(Boolean).join(': '))
      .filter(Boolean),
    // Ghi kèm nhãn buổi để đoạn highlight cho biết nội dung nằm ở buổi nào.
    sessions: (content.sessions ?? [])
      .map(session => {
        const body = both(session.content);
        return body ? `Buổi ${session.label ?? '?'}: ${body}` : null;
      })
      .filter((item): item is string => Boolean(item)),
    assessment: [
      examText('Giữa kỳ', assessment.midterm),
      examText('Cuối kỳ', assessment.final_exam),
      weights.length ? `Trọng số: ${weights.join(', ')}` : null,
    ].filter(Boolean).join('. ') || null,
    study_guide: both(content.study_guide),
    references: both(content.references),
    final_exam_format: assessment.final_exam?.format?.name?.vi ?? null,
    midterm_format: assessment.midterm?.format?.name?.vi ?? null,
    has_lab: (breakdown.lab ?? 0) > 0,
    has_project: ['project', 'thesis', 'internship'].some(key => (breakdown[key] ?? 0) > 0),
    total_study_hours: content.hours?.total_study_hours ?? null,
    indexed_at: now.toISOString(),
  };
}
