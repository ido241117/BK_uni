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

