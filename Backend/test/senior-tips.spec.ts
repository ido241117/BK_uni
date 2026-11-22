import { findSeniorTip, SENIOR_ELECTIVE_TIPS, seniorTipView } from '../src/advisor/senior-tips';

describe('Senior free-elective tips', () => {
  it('finds a tip by any of its codes, case-insensitively', () => {
    expect(findSeniorTip('im1033')?.name).toBe('Máy tính trong kinh doanh');
    expect(findSeniorTip(' IM1011 ')?.name).toBe('Máy tính trong kinh doanh');
    expect(findSeniorTip('CO3001')).toBeUndefined();
  });

  it('has no duplicated codes', () => {
    const codes = SENIOR_ELECTIVE_TIPS.flatMap(tip => tip.codes);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('labels every view with its source and keeps the discouraged flag', () => {
    const view = seniorTipView(findSeniorTip('IM1029')!);
    expect(view.source).toBe('khóa trước');
    expect(view.seniors_discourage).toBe(true);
    expect(seniorTipView(findSeniorTip('IM1021')!).lecturers_seniors_took).toHaveLength(2);
  });
});
