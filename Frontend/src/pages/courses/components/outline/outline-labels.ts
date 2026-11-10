import type { OutlineComponentKey, OutlineText } from '@/types';

export type OutlineLang = 'vi' | 'en';

/** Văn bản theo ngôn ngữ đang chọn; thiếu thì dùng ngôn ngữ còn lại. */
export const pickText = (text: OutlineText | undefined, lang: OutlineLang): string | null => {
    if (!text) return null;
    return text[lang] ?? text[lang === 'vi' ? 'en' : 'vi'] ?? null;
};

export const COMPONENT_LABEL: Record<OutlineComponentKey, string> = {
    theory: 'Lý thuyết',
    exercise: 'Bài tập / thực hành',
    lab: 'Thí nghiệm',
    assignment: 'Bài tập lớn / tiểu luận',
    project: 'Đồ án',
    thesis: 'Luận văn',
    thesis_proposal: 'Tiểu luận TN / đề cương LV',
    internship: 'Thực tập ngoài trường',
    field_trip: 'Tham quan',
    self_study: 'Tự học',
    other: 'Khác',
    midterm: 'Kiểm tra giữa kỳ',
    final_exam: 'Thi cuối kỳ',
    theory_other: 'Lý thuyết khác',
};

export const KNOWLEDGE_BLOCK_LABEL: Record<string, string> = {
    general: 'Giáo dục đại cương',
    professional: 'Giáo dục chuyên nghiệp',
    foundation: 'Cơ sở ngành',
    major: 'Ngành',
    specialization: 'Chuyên ngành',
    graduation: 'Tốt nghiệp',
};

export const FRAMEWORK_LABEL: Record<string, string> = {
    LO: 'Chuẩn đầu ra môn học (LO)',
    CDIO: 'Theo CDIO',
    ABET: 'Theo ABET',
};

/** Thứ tự hiển thị thành phần trong các bảng phân bổ. */
export const COMPONENT_ORDER: OutlineComponentKey[] = [
    'theory', 'exercise', 'lab', 'assignment', 'project', 'thesis', 'thesis_proposal', 'internship', 'field_trip',
    'self_study', 'midterm', 'final_exam', 'theory_other', 'other',
];
