/**
 * Câu trả lời cuối của agent được ép thành JSON qua tool `submit_answer` (hoặc JSON mode khi model
 * lỡ trả lời bằng văn bản). File này giữ schema và bước kiểm tra/chuẩn hóa trước khi lưu.
 */

export const RECOMMENDATION_PRIORITIES = ['high', 'medium', 'low'] as const;
export type RecommendationPriority = (typeof RECOMMENDATION_PRIORITIES)[number];

export const CHOICE_TYPES = ['single', 'multiple', 'text'] as const;
export type ChoiceType = (typeof CHOICE_TYPES)[number];

export interface RawRecommendation {
  code: string;
  reason: string;
  priority: RecommendationPriority;
}

export interface AdvisorChoiceOption {
  value: string;
  label: string;
  description?: string;
}

export interface AdvisorChoice {
  id: string;
  question: string;
  type: ChoiceType;
  options: AdvisorChoiceOption[];
}

export interface RawAnswer {
  message: string;
  recommendations: RawRecommendation[];
  choices: AdvisorChoice[];
  suggestions: string[];
}

export type OfferingVerdict = 'confirmed' | 'not_offered' | 'likely' | 'uncertain' | 'unlikely' | 'never' | 'no_data';

export interface OfferingInfo {
  semester: string;
  verdict: OfferingVerdict;
  /** Diễn giải ngắn bằng tiếng Việt, ví dụ "Mở 3/4 kỳ 2 gần nhất (242, 232, 222)". */
  note: string;
  recent_same_term: string[];
  opened_same_term_recent: string[];
  last_opened: string | null;
}

export interface AdvisorRecommendation extends RawRecommendation {
  name: string;
  credits: number | null;
  in_curriculum: boolean;
  /** Theo kết quả phân tích của trang Phân tích học tập: `null` khi môn không nằm trong danh sách xét. */
  eligible: boolean | null;
  missing: string[];
  offering: OfferingInfo | null;
  /** Tóm tắt đề cương (bản áp dụng cho học kỳ tới); `null` khi môn chưa có đề cương. */
  outline: OutlineBrief | null;
}

export interface OutlineBrief {
  version: string;
  applies_from: string | null;
  study_hours: number | null;
  has_lab: boolean;
  has_project: boolean;
  final_exam: { format: string | null; duration_minutes: number | null } | null;
  midterm: { format: string | null; duration_minutes: number | null } | null;
  weights: Record<string, number>;
}

export interface AdvisorAnswer {
  message: string;
  recommendations: AdvisorRecommendation[];
  choices: AdvisorChoice[];
  suggestions: string[];
  /** Ghi chú của backend khi phải sửa câu trả lời (bỏ mã môn không tồn tại...). */
  notes: string[];
  /** `tool`: model gọi submit_answer; `json_mode`: phải định dạng lại bằng JSON mode. */
  source: 'tool' | 'json_mode';
}

/** JSON Schema của `submit_answer`, cũng dùng làm ví dụ cho JSON mode. */
export const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      description:
        'Câu trả lời bằng tiếng Việt cho sinh viên. Được dùng **đậm** và dòng bắt đầu bằng "- " cho danh sách. ' +
        'Không dùng bảng markdown, không lặp lại chi tiết từng môn đã có trong recommendations.',
    },
    recommendations: {
      type: 'array',
      description: 'Các môn đề xuất (có thể rỗng). Chỉ dùng mã môn có thật lấy từ context/tool.',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Mã môn, ví dụ CO3001' },
          reason: { type: 'string', description: 'Lý do ngắn gọn, 1-2 câu' },
          priority: { type: 'string', enum: RECOMMENDATION_PRIORITIES },
        },
        required: ['code', 'reason', 'priority'],
      },
    },
    choices: {
      type: 'array',
      description:
        'Câu hỏi để sinh viên chọn khi có nhiều phương án (môn tự chọn trong khối, chuyên ngành, số tín chỉ, học hè...) ' +
        'hoặc khi thiếu dữ liệu. Rỗng nếu không cần hỏi.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Mã câu hỏi dạng snake_case, duy nhất trong câu trả lời' },
          question: { type: 'string' },
          type: { type: 'string', enum: CHOICE_TYPES, description: 'single: chọn 1, multiple: chọn nhiều, text: tự nhập' },
          options: {
            type: 'array',
            description: 'Ít nhất 2 phương án với single/multiple; rỗng với text.',
            items: {
              type: 'object',
              properties: {
                value: { type: 'string' },
                label: { type: 'string' },
                description: { type: 'string' },
              },
              required: ['value', 'label'],
            },
          },
        },
        required: ['id', 'question', 'type', 'options'],
      },
    },
    suggestions: {
      type: 'array',
      description: 'Tối đa 3 câu hỏi tiếp theo sinh viên có thể bấm để hỏi.',
      items: { type: 'string' },
    },
  },
  required: ['message', 'recommendations', 'choices', 'suggestions'],
} as const;

export const ANSWER_JSON_EXAMPLE = JSON.stringify({
  message: 'Kỳ tới bạn nên ưu tiên **2 môn bắt buộc quá hạn**...',
  recommendations: [{ code: 'CO2003', reason: 'Môn bắt buộc đã quá kỳ khuyến nghị, là tiên quyết của 4 môn.', priority: 'high' }],
  choices: [{
    id: 'specialization',
    question: 'Bạn muốn theo chuyên ngành nào?',
    type: 'single',
    options: [{ value: 'CNPM', label: 'Công nghệ phần mềm', description: 'Đã học 2/5 môn' }, { value: 'none', label: 'Chưa quyết định' }],
  }],
  suggestions: ['Nếu học hè thì có kịp tốt nghiệp đúng hạn không?'],
});

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const list = (value: unknown, max: number): unknown[] => (Array.isArray(value) ? value.slice(0, max) : []);

/** Đọc JSON từ chuỗi (bỏ được rào ```json nếu model lỡ thêm). */
export const parseJsonObject = (raw: string | null | undefined): Record<string, unknown> | null => {
  if (!raw?.trim()) return null;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  try {
    const value: unknown = JSON.parse(cleaned);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

/** Kiểm tra cấu trúc; trả về bản đã chuẩn hóa và danh sách lỗi để model sửa. */
export const normalizeAnswer = (input: Record<string, unknown> | null): { answer: RawAnswer | null; errors: string[] } => {
  if (!input) return { answer: null, errors: ['Tham số không phải một JSON object hợp lệ.'] };
  const errors: string[] = [];

  const message = text(input.message, 6000);
  if (!message) errors.push('Thiếu "message".');

  const recommendations: RawRecommendation[] = [];
  list(input.recommendations, 15).forEach((item, index) => {
    const row = item as Record<string, unknown>;
    const code = text(row?.code, 50).toUpperCase();
    if (!code) {
      errors.push(`recommendations[${index}] thiếu "code".`);
      return;
    }
    if (recommendations.some(existing => existing.code === code)) return;
    const priority = RECOMMENDATION_PRIORITIES.includes(row.priority as RecommendationPriority)
      ? row.priority as RecommendationPriority
      : 'medium';
    recommendations.push({ code, reason: text(row.reason, 600), priority });
  });

  const choices: AdvisorChoice[] = [];
  list(input.choices, 5).forEach((item, index) => {
    const row = item as Record<string, unknown>;
    const question = text(row?.question, 500);
    if (!question) {
      errors.push(`choices[${index}] thiếu "question".`);
      return;
    }
    const type = CHOICE_TYPES.includes(row.type as ChoiceType) ? row.type as ChoiceType : 'single';
    const options: AdvisorChoiceOption[] = [];
    list(row.options, 12).forEach(option => {
      const raw = option as Record<string, unknown>;
      const label = text(raw?.label, 200);
      const value = text(raw?.value, 200) || label;
      if (!label || options.some(existing => existing.value === value)) return;
      const description = text(raw.description, 400);
      options.push(description ? { value, label, description } : { value, label });
    });
    if (type !== 'text' && options.length < 2) {
      errors.push(`choices[${index}] loại "${type}" cần ít nhất 2 phương án.`);
      return;
    }
    let id = text(row.id, 60).replace(/[^\w-]/g, '_') || `q${index + 1}`;
    while (choices.some(existing => existing.id === id)) id = `${id}_${index + 1}`;
    choices.push({ id, question, type, options: type === 'text' ? [] : options });
  });

  const suggestions = list(input.suggestions, 3).map(item => text(item, 200)).filter(Boolean);

  return { answer: message ? { message, recommendations, choices, suggestions } : null, errors };
};
