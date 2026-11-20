import { importedCodes, planImportStatuses } from '../src/planner/mybk-import';
import { StudentCourseStatus } from '../src/student/enum/student-course-status';

// Dữ liệu bịa, cùng dạng JSON của `python -m planner.mybk` (PDF).
const FILE = {
  format: 'pdf',
  blocks: [
    { courses: [{ code: 'MA101', passed: true }, { code: 'MA102', passed: false }] },
    { courses: [{ code: 'CCGDTC', passed: true }] },
  ],
  graduation_conditions: [{ code: 'SA4001', passed: false }, { code: 'MA102', passed: true }],
};

describe('T28: ghi trạng thái môn đúng như file myBK', () => {
  const ids = new Map([['MA101', 'id-ma101'], ['MA102', 'id-ma102'], ['SA4001', 'id-sa4001']]);

  it('✓ thành Đã hoàn thành, "--" thành Chưa học; mã không có trong danh mục chỉ báo lại', () => {
    const plan = planImportStatuses(FILE, ids);
    expect(plan.items).toEqual([
      { course_id: 'id-ma101', status: StudentCourseStatus.COMPLETED },
      { course_id: 'id-ma102', status: StudentCourseStatus.COMPLETED }, // đạt ở một chỗ thì đạt
      { course_id: 'id-sa4001', status: StudentCourseStatus.NOT_STARTED },
    ]);
    expect(plan.unknown_codes).toEqual(['CCGDTC']);
  });

  it('không sinh dòng cho môn không có trong file', () => {
    const plan = planImportStatuses(FILE, new Map([...ids, ['CO3129', 'id-co3129']]));
    expect(plan.items.map((i) => i.course_id)).not.toContain('id-co3129');
  });

  it('lấy mã của khối và điều kiện tốt nghiệp, không trùng', () => {
    expect(importedCodes(FILE).sort()).toEqual(['CCGDTC', 'MA101', 'MA102', 'SA4001']);
  });
});
