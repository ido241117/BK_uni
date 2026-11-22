/**
 * Các môn tự chọn tự do được sinh viên khóa trước truyền lại (kinh nghiệm truyền miệng, không phải thông tin chính thức).
 * Chép tay từ bảng khóa trước chia sẻ; cập nhật trực tiếp file này khi có bảng mới.
 * Advisor chỉ đọc qua tool `get_senior_free_elective_tips` và trường `senior_tip` của `get_course_detail`,
 * và bắt buộc nói rõ đây là lời khuyên của khóa trước.
 */

export interface SeniorLecturer {
  name: string;
  /** Lớp khóa trước đã học, vd tiếng Anh (chương trình CLC). */
  track?: string;
}

export interface SeniorElectiveTip {
  /** Mã môn; một môn có thể có nhiều mã tương đương (đổi mã qua các khóa). */
  codes: string[];
  name: string;
  lecturers: SeniorLecturer[];
  /** Học kỳ khóa trước có lưu video bài giảng. */
  recordedVideo?: string;
  /** Khóa trước có chia sẻ tài liệu (link không lưu ở đây). */
  hasMaterials: boolean;
  /** Ghi chú nguyên văn ý của khóa trước. */
  note?: string;
  /** Khóa trước khuyên không nên chọn. */
  discouraged?: boolean;
}

export const SENIOR_TIPS_SOURCE =
  'Lời khuyên truyền lại từ sinh viên các khóa trước (kinh nghiệm cá nhân), không phải thông tin chính thức của Trường/Khoa; ' +
  'giảng viên phụ trách và cách tổ chức môn có thể đã thay đổi.';

export const SENIOR_ELECTIVE_TIPS: SeniorElectiveTip[] = [
  {
    codes: ['IM1011', 'IM1033'],
    name: 'Máy tính trong kinh doanh',
    lecturers: [{ name: 'Nguyễn Ngọc Bình Phương' }],
    hasMaterials: true,
  },
  {
    codes: ['IM3051'],
    name: 'Đạo đức kinh doanh và trách nhiệm xã hội',
    lecturers: [{ name: 'Huỳnh Thị Minh Châu' }],
    hasMaterials: true,
  },
  {
    codes: ['IM1021'],
    name: 'Khởi nghiệp',
    lecturers: [
      { name: 'Nguyễn Ngọc Bình Phương', track: 'lớp tiếng Việt' },
      { name: 'Trương Minh Chương, Phạm Trung Kiên', track: 'lớp tiếng Anh (Entrepreneurship)' },
    ],
    recordedVideo: 'HK212',
    hasMaterials: true,
  },
  {
    codes: ['IM1019'],
    name: 'Tiếp thị căn bản',
    lecturers: [{ name: 'Nguyễn Văn Tuân' }],
    hasMaterials: true,
  },
  {
    codes: ['IM1029'],
    name: 'Hệ thống sản xuất',
    lecturers: [],
    hasMaterials: true,
    note: 'Không khuyến khích',
    discouraged: true,
  },
  {
    codes: ['IM3029'],
    name: 'Quản lý sản xuất',
    lecturers: [],
    hasMaterials: true,
    note: 'Không khuyến khích',
    discouraged: true,
  },
  {
    codes: ['IM3047'],
    name: 'Giao tiếp trong kinh doanh',
    lecturers: [],
    hasMaterials: true,
  },
  {
    codes: ['ME4625'],
    name: 'Kỹ năng lãnh đạo',
    lecturers: [
      { name: 'Dương Quốc Bửu', track: 'lớp tiếng Việt' },
      { name: 'Nguyễn Thu Hương', track: 'lớp tiếng Anh (Leadership)' },
    ],
    hasMaterials: true,
  },
  {
    codes: ['ME4533'],
    name: 'Quản lý đơn hàng',
    lecturers: [{ name: 'Lê Song Thanh Quỳnh' }],
    hasMaterials: true,
  },
  {
    codes: ['CH4079'],
    name: 'Hoá học xanh',
    lecturers: [{ name: 'Lê Vũ Hà' }],
    hasMaterials: true,
  },
  {
    codes: ['GE1013'],
    name: 'Khoa học trái đất',
    lecturers: [{ name: 'Lê Thanh Phong' }],
    hasMaterials: true,
  },
  {
    codes: ['IM2017'],
    name: 'Hành vi tổ chức',
    lecturers: [{ name: 'Trương Thị Lan Anh' }],
    hasMaterials: true,
    note: 'Khóa trước có để lại review',
  },
];

const tipByCode = new Map(SENIOR_ELECTIVE_TIPS.flatMap(tip => tip.codes.map(code => [code, tip] as const)));

export const findSeniorTip = (code: string): SeniorElectiveTip | undefined => tipByCode.get(code.trim().toUpperCase());

/** Dạng gửi cho model: gọn, kèm nhắc nguồn ngay trong từng mục để model không quên ghi nguồn. */
export const seniorTipView = (tip: SeniorElectiveTip) => ({
  source: 'khóa trước',
  codes: tip.codes,
  name: tip.name,
  lecturers_seniors_took: tip.lecturers.map(lecturer => (lecturer.track ? `${lecturer.name} (${lecturer.track})` : lecturer.name)),
  recorded_video: tip.recordedVideo ?? null,
  seniors_shared_materials: tip.hasMaterials,
  seniors_note: tip.note ?? null,
  seniors_discourage: tip.discouraged ?? false,
});
