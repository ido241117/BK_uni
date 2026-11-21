import { planImportStatuses } from '../src/planner/mybk-import';
import { certificateCourses, reviewMybk, ReviewCurriculum, ReviewFile } from '../src/planner/mybk-review';

// Dữ liệu bịa cùng dạng JSON của `planner.mybk` (PDF); không có dữ liệu sinh viên thật.
const file = (over: Partial<ReviewFile> = {}): ReviewFile => ({
  format: 'pdf',
  official_program_code: 'DH_CQ_XX_ABC_2023',
  total_required: 10,
  blocks: [
    { name: 'Cơ sở', kind: 'BB', courses: [
      { code: 'AA1001', name: 'Môn A', credits: 3, passed: true },
      { code: 'AA1002', name: 'Môn B', credits: 4, passed: false },
    ] },
    { name: 'Giáo dục thể chất', kind: 'BB', courses: [{ code: 'CCGDTC', name: 'Chứng chỉ GDTC', credits: 0, passed: true }] },
    { name: 'Môn học ngoài CTĐT', kind: 'NGOAICTDT', courses: [{ code: 'ZZ9999', name: 'Ngoài', credits: 2, passed: true }] },
  ],
  graduation_conditions: [{ code: 'ENG_X', name: 'Tiếng Anh', passed: false }],
  checks: [{ id: 'credit_sum', ok: true, detail: 'ok' }],
  ...over,
});

const curriculum = (over: Partial<ReviewCurriculum> = {}): ReviewCurriculum => ({
  id: 'cur-1', code: 'XX-2023-ABC', name: 'Ngành bịa', cohort: 2023,
  source_code: 'DH_CQ_XX_ABC_2023', source_version: 'v01', total_credits: 10,
  courses: [
    { code: 'AA1001', name: 'Môn A', credits: 3 },
    { code: 'AA1002', name: 'Môn B', credits: 4 },
    { code: 'PE1003', name: 'Giáo dục thể chất 1 / Physical Education 1', credits: 0 },
    { code: 'PE1005', name: 'Giáo dục thể chất 2 / Physical Education 2', credits: 0 },
    { code: 'ENG_X', name: 'Tiếng Anh', credits: 0 },
  ],
  regulations: [{ name: 'Chứng chỉ Giáo dục Thể chất', detail: 'Trên myBK ghi theo CCGDTC.' }],
  ...over,
});

const catalog = new Map([
  ['AA1001', { name: 'Môn A', credits: 3 }], ['AA1002', { name: 'Môn B', credits: 4 }],
  ['ENG_X', { name: 'Tiếng Anh', credits: 0 }], ['ZZ9999', { name: 'Ngoài', credits: 2 }],
]);

const run = (over: Partial<Parameters<typeof reviewMybk>[0]> = {}) => reviewMybk({
  file: file(), matched: curriculum(), profileCurriculum: { id: 'cur-1', code: 'XX-2023-ABC', name: 'Ngành bịa' },
  catalog, webStatus: new Map(), hasPreviousImport: false, ...over,
});

const ids = (r: ReturnType<typeof reviewMybk>) => r.conflicts.map((c) => c.id);

describe('reviewMybk (T32)', () => {
  it('khớp hoàn toàn: không mâu thuẫn, CCGDTC tương ứng PE1003 + PE1005 (không bị báo là mã lạ)', () => {
    const r = run();
    expect(r.program.same_as_profile).toBe(true);
    expect(r.can_confirm).toBe(true);
    expect(ids(r)).toEqual([]);
    expect(r.equivalents).toEqual([{
      file_code: 'CCGDTC', passed: true,
      courses: [expect.objectContaining({ code: 'PE1003' }), expect.objectContaining({ code: 'PE1005' })],
    }]);
  });

  it('chương trình không ghi CCGDTC trong quy định (khóa 2024, 2026): không nối chứng chỉ', () => {
    const cur = curriculum({ regulations: [{ name: 'Chứng chỉ Giáo dục Thể chất', detail: 'Trên myBK ghi theo PE1009, PE1011…' }] });
    expect(certificateCourses([{ code: 'CCGDTC', passed: true }], cur)).toEqual([]);
    expect(run({ matched: cur }).equivalents).toEqual([]);
  });

  it('khóa không có CCGDTC (file ghi môn thể thao PE1009, 0 TC): báo chưa hoàn thành GDTC, không tính tự chọn tự do', () => {
    const cur = curriculum({ regulations: [{ name: 'Chứng chỉ Giáo dục Thể chất', detail: 'Trên myBK ghi theo PE1009, PE1011…' }] });
    const f = file({
      blocks: [
        file().blocks[0],
        { name: 'Chứng chỉ Giáo dục Thể chất', kind: 'BB', courses: [{ code: 'PE1009', name: 'Bóng đá', credits: 0, passed: true }] },
      ],
    });
    const r = run({ file: f, matched: cur });
    const by = Object.fromEntries(r.conflicts.map((c) => [c.id, c]));
    expect(by.gdtc_unknown).toEqual(expect.objectContaining({ level: 'warning' }));
    expect(by.free_elective).toBeUndefined();
    expect(by.missing_in_file).toBeUndefined(); // PE1003, PE1005 không bị báo thiếu
    expect(r.can_confirm).toBe(true);
  });

  it('môn đang có trên web mà file không nhắc tới: báo sẽ xóa (file: null) khi lưu, 21/11', () => {
    const r = run({
      webStatus: new Map([['AA1001', 'completed'], ['IM3047', 'completed']]),
      webNames: new Map([['IM3047', 'Giao tiếp trong kinh doanh']]),
    });
    expect(r.status_changes.find((c) => c.code === 'IM3047')).toEqual(
      { code: 'IM3047', name: 'Giao tiếp trong kinh doanh', web: 'completed', file: null },
    );
    // Môn có trong file không bị báo xóa; PE1003/PE1005 (suy từ CCGDTC) cũng không.
    expect(r.status_changes.filter((c) => c.file === null).map((c) => c.code)).toEqual(['IM3047']);
  });

  it('lúc ghi: CCGDTC đạt → PE1003, PE1005 Đã hoàn thành', () => {
    const extra = certificateCourses([{ code: 'CCGDTC', passed: true }], curriculum())
      .flatMap((e) => e.codes.map((code) => ({ code, passed: e.passed })));
    const plan = planImportStatuses(file(), new Map([['PE1003', 'id-pe1'], ['PE1005', 'id-pe2']]), extra);
    expect(plan.items).toEqual([
      { course_id: 'id-pe1', status: 'completed' }, { course_id: 'id-pe2', status: 'completed' },
    ]);
  });

  it('không có chương trình mang mã myBK của file: lỗi, không cho xác nhận', () => {
    const r = run({ matched: null });
    expect(ids(r)[0]).toBe('program_not_found');
    expect(r.can_confirm).toBe(false);
    expect(r.equivalents).toEqual([]);
  });

  it('hồ sơ chọn chương trình khác hoặc chưa chọn: cảnh báo', () => {
    expect(ids(run({ profileCurriculum: { id: 'cur-2', code: 'XX-2024-ABC', name: 'Khác' } }))).toContain('profile_differs');
    expect(ids(run({ profileCurriculum: null }))).toContain('profile_missing');
  });

  it('môn lệch hai phía, tín chỉ lệch, tổng tín chỉ lệch', () => {
    // Web: AA1001 ghi 4 TC (file 3), không có AA1002, có thêm AA2000.
    const keep = curriculum().courses.filter((c) => !['AA1001', 'AA1002'].includes(c.code));
    const cur = curriculum({
      total_credits: 12,
      courses: [{ code: 'AA1001', name: 'Môn A', credits: 4 }, { code: 'AA2000', name: 'Môn mới', credits: 3 }, ...keep],
    });
    const r = run({ matched: cur });
    const by = Object.fromEntries(r.conflicts.map((c) => [c.id, c]));
    // Môn có trong file mà không thuộc chương trình: tính tự chọn tự do (mức thông tin).
    expect(by.free_elective).toEqual(expect.objectContaining({ level: 'info', codes: ['AA1002'] }));
    expect(by.missing_in_file.codes).toEqual(['AA2000']);
    expect(by.credit_mismatch.codes).toEqual(['AA1001 (file 3, web 4)']);
    expect(by.total_credits).toBeDefined();
    // Khối "Môn học ngoài CTĐT" của myBK (không tính) không bị đưa vào tự chọn tự do.
    expect(by.free_elective.codes).not.toContain('ZZ9999');
  });

  it('tự kiểm tra của bộ đọc file không qua: lỗi', () => {
    const r = run({ file: file({ checks: [{ id: 'credit_sum', ok: false, detail: 'cộng 9 khác 10' }] }) });
    expect(r.can_confirm).toBe(false);
    expect(ids(r)[0]).toBe('check:credit_sum');
  });

  it('trạng thái sẽ đổi: chỉ môn có trong danh mục và khác trạng thái trên web', () => {
    const r = run({ webStatus: new Map([['AA1001', 'completed'], ['AA1002', 'in-progress']]) });
    expect(r.status_changes.map((c) => [c.code, c.web, c.file])).toEqual([
      ['AA1002', 'in-progress', 'not-started'],
      ['ENG_X', null, 'not-started'],
      ['PE1003', null, 'completed'],
      ['PE1005', null, 'completed'],
      ['ZZ9999', null, 'completed'],
    ]);
  });
});
