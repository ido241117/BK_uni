import { OUTLINE_INDEX_MAPPINGS, SEARCH_SYNONYMS, toSearchDocument } from '../src/outline/search/outline-search.mapping';

describe('Outline search document', () => {
  const row = {
    course_code: 'co3001',
    version: '3.0',
    applies_from: '251',
    credits: 3,
    name_vi: 'Công nghệ phần mềm',
    name_en: 'Software Engineering',
    content: {
      faculty: { code: 'MT', name: { vi: 'Khoa Khoa học và Kỹ thuật Máy tính' } },
      course_type: { name: { vi: 'Bắt buộc' } },
      objectives: { vi: 'Quản lý vòng đời phần mềm', en: 'Manage the software lifecycle' },
      sessions: [
        { label: '1', content: { vi: 'Giới thiệu', en: 'Introduction' } },
        { label: '9', content: { vi: 'Triển khai bằng Docker' } },
        { label: '10', content: null },
      ],
      learning_outcomes: [{ code: 'L.O.1', name: { vi: 'Vận dụng quy trình' } }],
      assessment: {
        weights: { assignment: 40, final_exam: 50, self_study: 10, midterm: 0 },
        final_exam: { format: { code: 'TN2', name: { vi: 'Trắc nghiệm (chấm máy)' } }, duration_minutes: 90 },
      },
      hours: { total_study_hours: 150, breakdown: { lab: 0, project: 30 } },
    },
  };

  it('flattens the outline JSON into searchable text fields', () => {
    const doc = toSearchDocument(row, new Date('2026-11-17T00:00:00Z'));
    expect(doc).toMatchObject({
      code: 'CO3001',
      faculty: 'Khoa Khoa học và Kỹ thuật Máy tính',
      course_type: 'Bắt buộc',
      objectives: 'Quản lý vòng đời phần mềm\nManage the software lifecycle',
      sessions: ['Buổi 1: Giới thiệu\nIntroduction', 'Buổi 9: Triển khai bằng Docker'],
      learning_outcomes: ['L.O.1: Vận dụng quy trình'],
      assessment: 'Cuối kỳ: Trắc nghiệm (chấm máy) 90 phút. Trọng số: bài tập lớn 40%, thi cuối kỳ 50%, tự học 10%',
      final_exam_format: 'Trắc nghiệm (chấm máy)',
      midterm_format: null,
      has_lab: false,
      has_project: true,
      total_study_hours: 150,
      indexed_at: '2026-11-17T00:00:00.000Z',
    });
  });

  it('only produces fields declared in the strict mapping', () => {
    const doc = toSearchDocument(row);
    expect(Object.keys(doc).sort()).toEqual(Object.keys(OUTLINE_INDEX_MAPPINGS.properties).sort());
  });

  it('writes synonym rules without diacritics, since they run after asciifolding', () => {
    SEARCH_SYNONYMS.forEach(rule => expect(rule).toBe(rule.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()));
  });
});
