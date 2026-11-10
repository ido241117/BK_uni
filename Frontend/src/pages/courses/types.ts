import type { StudentCourseStatus } from '@/types';

/** Một dòng của bảng "Môn học của tôi": thông tin môn + dữ liệu riêng của sinh viên. */
export interface CourseRow {
    courseId: string;
    code: string;
    name: string;
    description: string | null;
    credits: number;
    /** Môn có trong chương trình của hồ sơ. */
    inCurriculum: boolean;
    /** `null` = môn trong pool tự chọn hoặc ngoài chương trình. */
    recommendedYear: number | null;
    recommendedTerm: number | null;
    categories: string[];
    /** `null` = chưa khai trạng thái. */
    status: StudentCourseStatus | null;
    /** `null` = chưa lên kế hoạch. */
    plannedSemester: string | null;
}
