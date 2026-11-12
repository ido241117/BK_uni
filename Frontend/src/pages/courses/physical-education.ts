/**
 * Giáo dục thể chất: chương trình chỉ khai hai mã chung GDTC 1/2; sinh viên thực tế học hai học phần
 * thể thao bất kỳ. Backend tự đánh dấu PE1003/PE1005 hoàn thành khi đủ 1/2 học phần
 * (xem `Backend/src/student/physical-education.ts`).
 */
export const PE_GENERIC_CODES = ['PE1003', 'PE1005'];

export const isGenericPhysicalEducation = (code: string) => PE_GENERIC_CODES.includes(code.toUpperCase());

/** Học phần thể thao: mọi mã PE trừ hai mã chung. */
export const isPhysicalEducationCourse = (code: string) => (
    code.toUpperCase().startsWith('PE') && !isGenericPhysicalEducation(code)
);

/**
 * Đếm số môn mà không tính trùng GDTC: mỗi mã chung PE1003/PE1005 có trong danh sách đã đại diện cho
 * một học phần thể thao, nên chỉ đếm phần học phần thể thao vượt quá số mã chung.
 * Ví dụ PE1003 + PE1009 → 1 môn; PE1003 + PE1005 + PE1009 + PE1033 → 2 môn.
 */
export const countCoursesWithoutPeDuplicates = (items: { course?: { code: string } | null }[]): number => {
    const codes = items.map(item => item.course?.code ?? '');
    const sports = codes.filter(isPhysicalEducationCourse).length;
    const generic = codes.filter(isGenericPhysicalEducation).length;
    return codes.length - sports + Math.max(0, sports - generic);
};
