/**
 * Giáo dục thể chất (GDTC): chương trình chỉ khai hai mã chung PE1003 (GDTC 1) và PE1005 (GDTC 2),
 * còn sinh viên thực tế học hai học phần thể thao bất kỳ (PE10xx: Bóng đá 1, Cầu lông 2…).
 *
 * Ràng buộc mềm, không đặt ở DB (để import từ myBK không bị chặn): khi sinh viên hoàn thành
 * 1 học phần thể thao thì coi như xong PE1003, 2 học phần thì xong luôn PE1005.
 */
export const PE_GENERIC_CODES = ['PE1003', 'PE1005'] as const;

const PE_PREFIX = 'PE';

/** Mã học phần thể thao (mọi mã PE trừ hai mã chung). */
export const isPhysicalEducationCourse = (code: string | null | undefined): boolean => {
  const normalized = code?.trim().toUpperCase() ?? '';
  return normalized.startsWith(PE_PREFIX) && !(PE_GENERIC_CODES as readonly string[]).includes(normalized);
};
