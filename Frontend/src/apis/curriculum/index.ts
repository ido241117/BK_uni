import { queryMethod } from '@/config/query-method';
import type {
    CourseGroup,
    CourseGroupMember,
    CourseGroupPayload,
    CourseRelation,
    CourseRelationsPayload,
    Curriculum,
    CurriculumCategory,
    CurriculumCategoryMember,
    CurriculumCategoryPayload,
    CurriculumCourse,
    CurriculumCoursePayload,
    CurriculumOpenedSemester,
    CurriculumPayload,
    CurriculumQueryParams,
    CurriculumRegulation,
    CurriculumRegulationPayload,
    CurriculumSpecialization,
} from '@/types';

/* ------------------------------- Chương trình ------------------------------ */

export const listCurricula = (params: CurriculumQueryParams = {}) =>
    queryMethod.getPage<Curriculum>('/curricula', { params });

export const getCurriculum = (curriculumId: string) =>
    queryMethod.get<Curriculum>(`/curricula/${curriculumId}`);

export const createCurriculum = (payload: CurriculumPayload) =>
    queryMethod.post<Curriculum>('/curricula', payload);

export const updateCurriculum = (curriculumId: string, payload: Partial<CurriculumPayload>) =>
    queryMethod.patch<Curriculum>(`/curricula/${curriculumId}`, payload);

export const deleteCurriculum = (curriculumId: string) =>
    queryMethod.delete(`/curricula/${curriculumId}`);

/* ---------------------------- Môn trong chương trình ----------------------- */

export const listCurriculumCourses = (curriculumId: string) =>
    queryMethod.get<CurriculumCourse[]>(`/curricula/${curriculumId}/courses`);

/** Upsert: môn đã có trong chương trình thì cập nhật năm/kỳ khuyến nghị. */
export const upsertCurriculumCourse = (curriculumId: string, payload: CurriculumCoursePayload) =>
    queryMethod.post<CurriculumCourse>(`/curricula/${curriculumId}/courses`, payload);

export const updateCurriculumCourse = (
    curriculumId: string,
    courseId: string,
    payload: Partial<Pick<CurriculumCoursePayload, 'recommended_year' | 'recommended_term'>>,
) => queryMethod.patch<CurriculumCourse>(`/curricula/${curriculumId}/courses/${courseId}`, payload);

export const removeCurriculumCourse = (curriculumId: string, courseId: string) =>
    queryMethod.delete(`/curricula/${curriculumId}/courses/${courseId}`);

/* --------------------------------- Nhóm môn -------------------------------- */

export const listCourseGroups = (curriculumId: string) =>
    queryMethod.get<CourseGroup[]>(`/curricula/${curriculumId}/groups`);

export const createCourseGroup = (curriculumId: string, payload: CourseGroupPayload) =>
    queryMethod.post<CourseGroup>(`/curricula/${curriculumId}/groups`, payload);

export const updateCourseGroup = (
    curriculumId: string,
    groupId: string,
    payload: Partial<CourseGroupPayload>,
) => queryMethod.patch<CourseGroup>(`/curricula/${curriculumId}/groups/${groupId}`, payload);

export const removeCourseGroup = (curriculumId: string, groupId: string) =>
    queryMethod.delete(`/curricula/${curriculumId}/groups/${groupId}`);

export const listGroupMembers = (curriculumId: string, groupId: string) =>
    queryMethod.get<CourseGroupMember[]>(`/curricula/${curriculumId}/groups/${groupId}/members`);

export const replaceGroupMembers = (curriculumId: string, groupId: string, courseIds: string[]) =>
    queryMethod.put<CourseGroup>(`/curricula/${curriculumId}/groups/${groupId}/members`, {
        course_ids: courseIds,
    });

/* --------------------------- Nhóm học phần (mô tả) ------------------------- */

export const listCurriculumCategories = (curriculumId: string) =>
    queryMethod.get<CurriculumCategory[]>(`/curricula/${curriculumId}/categories`);

export const createCurriculumCategory = (curriculumId: string, payload: CurriculumCategoryPayload) =>
    queryMethod.post<CurriculumCategory>(`/curricula/${curriculumId}/categories`, payload);

export const updateCurriculumCategory = (
    curriculumId: string,
    categoryId: string,
    payload: Partial<CurriculumCategoryPayload>,
) => queryMethod.patch<CurriculumCategory>(`/curricula/${curriculumId}/categories/${categoryId}`, payload);

export const removeCurriculumCategory = (curriculumId: string, categoryId: string) =>
    queryMethod.delete(`/curricula/${curriculumId}/categories/${categoryId}`);

/** Gán một môn vào nhiều nhóm học phần (thay toàn bộ nhóm hiện có của môn). */
export const replaceCourseCategories = (curriculumId: string, courseId: string, categoryIds: string[]) =>
    queryMethod.put<CurriculumCategoryMember[]>(`/curricula/${curriculumId}/courses/${courseId}/categories`, {
        category_ids: categoryIds,
    });

/* -------------------------------- Chuyên ngành ----------------------------- */

export const listSpecializations = (curriculumId: string) =>
    queryMethod.get<CurriculumSpecialization[]>(`/curricula/${curriculumId}/specializations`);

/* ------------------------------- Học kỳ mở lớp ----------------------------- */

/** Học kỳ đã mở lớp của mọi môn trong chương trình (một lần gọi). */
export const listCurriculumOpenedSemesters = (curriculumId: string) =>
    queryMethod.get<CurriculumOpenedSemester[]>(`/curricula/${curriculumId}/opened-semesters`);

/* -------------------------------- Quan hệ môn ------------------------------ */

export const listCourseRelations = (curriculumId: string, courseId?: string) =>
    queryMethod.get<CourseRelation[]>(`/curricula/${curriculumId}/relations`, {
        params: courseId ? { course_id: courseId } : undefined,
    });

/** Thay quan hệ của một môn; trường không gửi thì giữ nguyên. */
export const replaceCourseRelations = (
    curriculumId: string,
    courseId: string,
    payload: CourseRelationsPayload,
) => queryMethod.put<CourseRelation[]>(`/curricula/${curriculumId}/courses/${courseId}/relations`, payload);

/* --------------------------------- Quy định -------------------------------- */

export const listRegulations = (curriculumId: string) =>
    queryMethod.get<CurriculumRegulation[]>(`/curricula/${curriculumId}/regulations`);

export const createRegulation = (curriculumId: string, payload: CurriculumRegulationPayload) =>
    queryMethod.post<CurriculumRegulation>(`/curricula/${curriculumId}/regulations`, payload);

export const updateRegulation = (
    curriculumId: string,
    regulationId: string,
    payload: Partial<CurriculumRegulationPayload>,
) => queryMethod.patch<CurriculumRegulation>(`/curricula/${curriculumId}/regulations/${regulationId}`, payload);

export const removeRegulation = (curriculumId: string, regulationId: string) =>
    queryMethod.delete(`/curricula/${curriculumId}/regulations/${regulationId}`);
