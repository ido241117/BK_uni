import { useMemo } from 'react';
import {
    getCurriculum,
    listCourseGroups,
    listCourseRelations,
    listCurriculumCourses,
    listCurriculumOpenedSemesters,
    listRegulations,
    listSpecializations,
} from '@/apis/curriculum';
import { listOutlineSummaries } from '@/apis/outline';
import { getMyProfile, listMyCourses, listMyPlanCourses, listMyRegulationStatuses } from '@/apis/student';
import { useApiQuery } from '@/hooks';
import { analyzeStudent } from './analyze';
import { currentSemester, nextMainSemester } from './semester';

/**
 * Tải mọi dữ liệu cần cho "Phân tích học tập" rồi tính `analyzeStudent`.
 * Dùng chung cho trang phân tích và trang Tư vấn với AI (gửi kết quả làm context cho model).
 */
export const useStudentAnalysis = () => {
    const profileQuery = useApiQuery(['my-profile'], getMyProfile);
    const curriculumId = profileQuery.data?.curriculum_id ?? undefined;
    const enabled = Boolean(curriculumId);

    const curriculumQuery = useApiQuery(['curriculum', curriculumId], () => getCurriculum(curriculumId!), { enabled });
    const coursesQuery = useApiQuery(['curriculum-courses', curriculumId], () => listCurriculumCourses(curriculumId!), { enabled });
    const groupsQuery = useApiQuery(['curriculum-groups', curriculumId], () => listCourseGroups(curriculumId!), { enabled });
    const specializationsQuery = useApiQuery(['curriculum-specializations', curriculumId], () => listSpecializations(curriculumId!), { enabled });
    const relationsQuery = useApiQuery(['curriculum-relations', curriculumId], () => listCourseRelations(curriculumId!), { enabled });
    const openedQuery = useApiQuery(['curriculum-opened-semesters', curriculumId], () => listCurriculumOpenedSemesters(curriculumId!), { enabled });
    const regulationsQuery = useApiQuery(['curriculum', curriculumId, 'regulations'], () => listRegulations(curriculumId!), { enabled });
    const regulationStatusesQuery = useApiQuery(['regulation-statuses', curriculumId], () => listMyRegulationStatuses(curriculumId), { enabled });
    const statusesQuery = useApiQuery(['student-courses'], listMyCourses);
    const planQuery = useApiQuery(['plan-courses', curriculumId], () => listMyPlanCourses(curriculumId), { enabled });

    // Đề cương (bản áp dụng cho học kỳ tới) là dữ liệu bổ sung: lỗi thì vẫn phân tích, chỉ thiếu phần từ đề cương.
    const outlineSemester = nextMainSemester(currentSemester());
    const outlinesQuery = useApiQuery(
        ['outline-summaries', curriculumId, outlineSemester],
        () => listOutlineSummaries(curriculumId!, outlineSemester),
        { enabled, retry: false },
    );

    const queries = [
        curriculumQuery, coursesQuery, groupsQuery, specializationsQuery, relationsQuery, openedQuery,
        regulationsQuery, regulationStatusesQuery, statusesQuery, planQuery,
    ];
    const outlinesSettled = outlinesQuery.isSuccess || outlinesQuery.isError;
    const ready = queries.every(query => query.isSuccess) && outlinesSettled;

    const analysis = useMemo(() => {
        if (!ready || !profileQuery.data) return null;
        return analyzeStudent({
            curriculum: curriculumQuery.data!,
            profile: profileQuery.data,
            courses: coursesQuery.data!,
            groups: groupsQuery.data!,
            specializations: specializationsQuery.data!,
            relations: relationsQuery.data!,
            statuses: statusesQuery.data!,
            plan: planQuery.data!,
            opened: openedQuery.data!,
            regulations: regulationsQuery.data!,
            regulationStatuses: regulationStatusesQuery.data!,
            outlines: outlinesQuery.data?.items ?? [],
        });
    }, [
        ready, profileQuery.data, curriculumQuery.data, coursesQuery.data, groupsQuery.data, specializationsQuery.data,
        relationsQuery.data, statusesQuery.data, planQuery.data, openedQuery.data, regulationsQuery.data,
        regulationStatusesQuery.data, outlinesQuery.data,
    ]);

    return {
        profileLoading: profileQuery.isLoading,
        profile: profileQuery.data ?? null,
        curriculumId,
        curriculum: curriculumQuery.data ?? null,
        isError: queries.some(query => query.isError),
        outlinesUnavailable: outlinesQuery.isError,
        analysis,
    };
};

export default useStudentAnalysis;
