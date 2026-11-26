import { lazy, Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Popconfirm, Segmented, Select, Skeleton } from 'antd';
import { PiArrowCounterClockwise, PiFloppyDisk } from 'react-icons/pi';
import { useTranslation } from 'react-i18next';
import { Bead, ISolidBtn, ITextBtn, PageLoading, Pip, SearchLine } from '@/components';
import {
    getCurriculum,
    listCourseGroups,
    listCurriculumCategories,
    listCurriculumCourses,
    listSpecializations,
} from '@/apis/curriculum';
import { getMyProfile, listMyCourses, listMyPlanCourses } from '@/apis/student';
import { useApiQuery, useDebounce } from '@/hooks';
import {
    STUDENT_COURSE_STATUS,
    STUDENT_COURSE_STATUS_LABEL,
    type CourseSummary,
    type StudentCourseStatus,
} from '@/types';
import { courseSearchRank } from '@/utils/course-search';
import { computeCurriculumBlocks } from '@/utils/curriculum-credits';
import { toastMessage } from '@/utils/toast';
import type { StatusChange } from '@/utils/student-course-file';
import CourseStatusFileActions from '../components/CourseStatusFileActions';
import { currentSemester, nextMainSemester, recommendedSemester } from '@/utils/semester';
import CourseCard from './CourseCard';
import CourseDrawer, { type CourseContext } from './CourseDrawer';
import CatalogView from './CatalogView';
import { CategoriesView, GroupsView, SemesterView, SpecializationsView, type BoardView } from './sections';
import { buildStructure, canPlan } from './structure';
import { useCourseDraft } from './useCourseDraft';
import i18n from '@/i18n';
import { trLive } from '@/i18n/live';

// React Flow khá nặng: chỉ tải khi mở tab sơ đồ.
const PrerequisiteGraph = lazy(() => import('./graph/PrerequisiteGraph'));

/** Bấm thẻ ở chế độ "Xoay vòng": Chưa khai → Đã hoàn thành → Đang học → Chưa đạt → Chưa học → Chưa khai. */
const NEXT_STATUS: Record<StudentCourseStatus | 'none', StudentCourseStatus | null> = {
    none: STUDENT_COURSE_STATUS.COMPLETED,
    completed: STUDENT_COURSE_STATUS.IN_PROGRESS,
    'in-progress': STUDENT_COURSE_STATUS.FAILED,
    failed: STUDENT_COURSE_STATUS.NOT_STARTED,
    'not-started': null,
};

/** `planned` = chưa học + có học kỳ dự kiến (suy ra, không phải trạng thái lưu riêng). */
type StatusFilter = StudentCourseStatus | 'none' | 'planned';

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = trLive([
    ...Object.values(STUDENT_COURSE_STATUS).map(value => ({ value, label: STUDENT_COURSE_STATUS_LABEL[value] })),
    { value: 'planned', label: 'Đã lên kế hoạch' },
    { value: 'none', label: 'Chưa khai' },
]);

const LEGEND: { status: StudentCourseStatus | 'none' | 'planned'; label: string }[] = trLive([
    { status: 'none', label: 'Chưa khai' },
    { status: 'planned', label: 'Đã lên kế hoạch' },
    { status: 'completed', label: 'Đã hoàn thành' },
    { status: 'in-progress', label: 'Đang học' },
    { status: 'failed', label: 'Chưa đạt' },
    { status: 'not-started', label: 'Chưa học' },
]);

type ViewKey = 'semester' | 'groups' | 'graph' | 'categories' | 'specializations' | 'catalog';

interface CurriculumBoardProps {
    userId: string;
    curriculumId: string;
}

/**
 * Bảng chương trình (section of the "Phân tích" tab): the whole curriculum as course cards by semester / block /
 * graph / category / specialization / catalog. Clicking a card changes its status on the client only; the draft is
 * kept in localStorage and written to the server with "Lưu". The credit overview above it (AnalysisTab) reads saved
 * data, so saving refreshes it.
 */
const CurriculumBoard = ({ userId, curriculumId }: CurriculumBoardProps) => {
    const { t } = useTranslation();

    // Dùng chung cache với trang Hồ sơ / Phân tích học tập.
    const curriculumQuery = useApiQuery(['curriculum', curriculumId], () => getCurriculum(curriculumId));
    const coursesQuery = useApiQuery(['curriculum-courses', curriculumId], () => listCurriculumCourses(curriculumId));
    const groupsQuery = useApiQuery(['curriculum-groups', curriculumId], () => listCourseGroups(curriculumId));
    const specializationsQuery = useApiQuery(['curriculum-specializations', curriculumId], () => listSpecializations(curriculumId));
    const categoriesQuery = useApiQuery(['curriculum-categories', curriculumId], () => listCurriculumCategories(curriculumId));
    const statusesQuery = useApiQuery(['student-courses'], listMyCourses);
    const planQuery = useApiQuery(['plan-courses', curriculumId], () => listMyPlanCourses(curriculumId));
    const profileQuery = useApiQuery(['my-profile'], getMyProfile);

    const draft = useCourseDraft({
        userId,
        curriculumId,
        serverStatuses: statusesQuery.data,
        serverPlan: planQuery.data,
    });

    const [view, setView] = useState<ViewKey>('semester');
    const [search, setSearch] = useState('');
    const keyword = useDebounce(search, 200).trim();
    const [statusFilter, setStatusFilter] = useState<StatusFilter>();
    const [openCourse, setOpenCourse] = useState<CourseSummary | null>(null);

    const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
    const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
    const structure = useMemo(() => buildStructure(courses, groups), [courses, groups]);

    /** Thông tin mọi môn có thể gặp: chương trình, đã khai/lên kế hoạch, thêm trong nháp. */
    const courseById = useMemo(() => {
        const map = new Map<string, CourseSummary>();
        Object.values(draft.draftCourses).forEach(course => map.set(course.id, course));
        (planQuery.data ?? []).forEach(item => map.set(item.course_id, item.course));
        (statusesQuery.data ?? []).forEach(item => map.set(item.course_id, item.course));
        courses.forEach(item => map.set(item.course_id, item.course));
        groups.forEach(group => group.members.forEach(member => map.set(member.course_id, member.course)));
        return map;
    }, [draft.draftCourses, planQuery.data, statusesQuery.data, courses, groups]);

    /** Môn ngoài chương trình đang có trạng thái hoặc kế hoạch (kể cả chỉ trong nháp). */
    const outsideCourses = useMemo(() => {
        const ids = new Set([...draft.statusMap.keys(), ...draft.planMap.keys()]);
        return [...ids]
            .filter(id => !structure.curriculumCourseIds.has(id))
            .map(id => courseById.get(id))
            .filter((course): course is CourseSummary => Boolean(course))
            .sort((a, b) => a.code.localeCompare(b.code));
    }, [draft.statusMap, draft.planMap, structure, courseById]);

    const completed = useMemo(
        () => [...draft.statusMap]
            .filter(([, status]) => status === STUDENT_COURSE_STATUS.COMPLETED)
            .map(([id]) => ({ course_id: id, credits: courseById.get(id)?.credits ?? 0 })),
        [draft.statusMap, courseById],
    );
    const blocks = useMemo(() => computeCurriculumBlocks(courses, groups, completed), [courses, groups, completed]);

    // Callback ổn định (đọc giá trị mới qua ref) để thẻ đã memo không render lại hết mỗi lần bấm.
    const { statusMap, planMap, changedIds, setStatus, setStatuses } = draft;
    const latestStatusMap = useRef(statusMap);
    useLayoutEffect(() => { latestStatusMap.current = statusMap; }, [statusMap]);

    /** Bấm thẻ: chuyển sang trạng thái kế tiếp trong vòng xoay. */
    const toggle = useCallback((course: CourseSummary) => {
        const current = latestStatusMap.current.get(course.id) ?? null;
        setStatus(course.id, NEXT_STATUS[current ?? 'none'], course);
    }, [setStatus]);

    /** Không cho lên kế hoạch vào học kỳ đã qua: sớm nhất là học kỳ đang diễn ra. */
    const minSemester = useMemo(() => currentSemester(), []);

    /**
     * Học kỳ gán khi bấm "+" lần đầu: kỳ gợi ý của chương trình (theo năm nhập học), môn trong khối tự chọn lấy
     * kỳ gợi ý của khối; không có kỳ gợi ý hoặc kỳ gợi ý đã qua thì lấy học kỳ chính kế tiếp.
     */
    const defaultSemesterOf = useMemo(() => {
        const admissionYear = profileQuery.data?.admission_year ?? curriculumQuery.data?.cohort ?? null;
        const recommended = new Map<string, string>();
        if (admissionYear !== null) {
            groups.forEach(group => {
                if (group.specialization_id !== null || group.recommended_year === null || group.recommended_term === null) return;
                const code = recommendedSemester(admissionYear, group.recommended_year, group.recommended_term);
                group.members.forEach(member => { if (!recommended.has(member.course_id)) recommended.set(member.course_id, code); });
            });
            courses.forEach(item => {
                if (item.recommended_year === null || item.recommended_term === null) return;
                recommended.set(item.course_id, recommendedSemester(admissionYear, item.recommended_year, item.recommended_term));
            });
        }
        const fallback = nextMainSemester(minSemester);
        return (courseId: string) => {
            const code = recommended.get(courseId);
            return code && code >= minSemester ? code : fallback;
        };
    }, [profileQuery.data, curriculumQuery.data, groups, courses, minSemester]);

    const { setPlannedSemester } = draft;
    const changePlan = useCallback((course: CourseSummary, semester: string | null) => {
        // Chặn cả ở đây (nút "−" đã tắt): không ghi học kỳ quá khứ vào nháp.
        if (semester !== null && semester < minSemester) return;
        setPlannedSemester(course.id, semester, course);
    }, [setPlannedSemester, minSemester]);

    const visible = useCallback((course: CourseSummary) => {
        if (keyword && courseSearchRank(course, keyword) === null) return false;
        if (!statusFilter) return true;
        const status = draft.statusMap.get(course.id) ?? null;
        if (statusFilter === 'planned') return canPlan(status) && draft.planMap.has(course.id);
        return statusFilter === 'none' ? status === null : status === statusFilter;
    }, [keyword, statusFilter, draft.statusMap, draft.planMap]);

    const boardView = useMemo<BoardView>(() => ({
        visible,
        filtering: Boolean(keyword || statusFilter),
        statusOf: id => statusMap.get(id) ?? null,
        renderCard: course => (
            <CourseCard
                key={course.id}
                course={course}
                status={statusMap.get(course.id) ?? null}
                plannedSemester={planMap.get(course.id) ?? null}
                defaultSemester={defaultSemesterOf(course.id)}
                minSemester={minSemester}
                dirty={changedIds.has(course.id)}
                onToggle={toggle}
                onPlanChange={changePlan}
            />
        ),
        setMany: (list, status) => setStatuses(list.map(course => course.id), status, list),
        blockByGroupId: new Map(blocks.flatMap(block => (block.group ? [[block.group.id, block] as const] : []))),
        standaloneBlock: blocks.find(block => block.group === null),
    }), [visible, keyword, statusFilter, statusMap, planMap, changedIds, setStatuses, toggle, blocks, defaultSemesterOf, minSemester, changePlan]);

    /** Môn điền sẵn vào file mẫu: mọi môn của chương trình (kể cả trong khối tự chọn) + môn ngoài chương trình. */
    const templateCourses = useMemo(() => {
        const ids = new Set([...structure.curriculumCourseIds, ...outsideCourses.map(course => course.id)]);
        groups.forEach(group => group.members.forEach(member => ids.add(member.course_id)));
        return [...ids]
            .map(id => courseById.get(id))
            .filter((course): course is CourseSummary => Boolean(course))
            .sort((a, b) => a.code.localeCompare(b.code));
    }, [structure, outsideCourses, groups, courseById]);

    const applyFileChanges = useCallback((changes: StatusChange[], fileCourses: CourseSummary[]) => {
        const byId = new Map(fileCourses.map(course => [course.id, course]));
        changes.forEach(change => setStatus(change.courseId, change.to, byId.get(change.courseId)));
        toastMessage.info(t('Đã đưa {{count}} môn vào bản nháp. Bấm “Lưu” để ghi lại.', { count: changes.length }));
    }, [setStatus, t]);

    const drawerContext = useMemo<CourseContext | null>(() => {
        if (!openCourse) return null;
        return {
            placement: structure.placementById.get(openCourse.id) ?? i18n.t('Ngoài chương trình'),
            groups: structure.groupNamesById.get(openCourse.id) ?? [],
        };
    }, [openCourse, structure]);

    const save = async () => {
        const count = draft.changeCount;
        const result = await draft.save();
        if (result.ok) toastMessage.success(t('Đã lưu thay đổi của {{count}} môn.', { count }));
        else if (result.failed.length === 2) toastMessage.error(t('Chưa lưu được. Thay đổi vẫn được giữ trên trình duyệt, hãy thử lại.'));
        else toastMessage.error(result.failed[0] === 'plan'
            ? t('Đã lưu trạng thái, nhưng chưa lưu được học kỳ dự kiến. Hãy thử lại.')
            : t('Đã lưu học kỳ dự kiến, nhưng chưa lưu được trạng thái môn. Hãy thử lại.'));
        return result.ok;
    };

    const loading = curriculumQuery.isLoading || coursesQuery.isLoading || groupsQuery.isLoading
        || statusesQuery.isLoading || planQuery.isLoading;
    const loadError = curriculumQuery.isError || coursesQuery.isError || groupsQuery.isError
        || statusesQuery.isError || planQuery.isError;
    const curriculum = curriculumQuery.data;
    const specializations = specializationsQuery.data ?? [];

    const views: { value: ViewKey; label: string }[] = [
        { value: 'semester', label: t('Theo học kỳ') },
        { value: 'groups', label: t('Theo khối kiến thức ({{count}})', { count: structure.rootGroups.length + 1 }) },
        { value: 'graph', label: t('Sơ đồ điều kiện') },
        { value: 'categories', label: t('Nhóm học phần ({{count}})', { count: categoriesQuery.data?.length ?? 0 }) },
        { value: 'specializations', label: t('Chuyên ngành ({{count}})', { count: specializations.length }) },
        { value: 'catalog', label: t('Danh mục môn học') },
    ];

    if (loadError) {
        return <Alert type="error" showIcon title={t('Không tải được chương trình đào tạo')} description={t('Vui lòng tải lại trang để thử lại.')} />;
    }
    if (loading || !curriculum) return <PageLoading label={t('Đang tải chương trình...')} />;

    return (
        // Room at the bottom for the floating "unsaved" bar, so it never covers the last row of cards.
        <section className="board" style={{ paddingBottom: draft.changeCount ? 72 : 0 }}>
            <div className="board-toolbar">
                <div className="board-filters">
                    <SearchLine
                        placeholder={t('Tìm theo mã hoặc tên môn')}
                        aria-label={t('Tìm môn theo mã hoặc tên')}
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                    />
                    <Select<StatusFilter>
                        allowClear
                        placeholder={t('Mọi trạng thái')}
                        aria-label={t('Lọc theo trạng thái')}
                        style={{ width: 190 }}
                        options={STATUS_FILTER_OPTIONS.map(option => ({ ...option, label: t(option.label) }))}
                        value={statusFilter}
                        onChange={setStatusFilter}
                    />
                </div>
                <div className="board-actions">
                    <CourseStatusFileActions
                        statusByCourseId={draft.statusMap}
                        templateCourses={templateCourses}
                        onApply={applyFileChanges}
                    />
                    <ISolidBtn icon={<PiFloppyDisk />} disabled={!draft.changeCount} loading={draft.saving} onClick={() => void save()}>
                        {t('Lưu')}
                    </ISolidBtn>
                </div>
            </div>

            <div className="board-legend">
                {LEGEND.map(item => (
                    <span key={item.status} className="board-legend-item">
                        <Bead state={item.status} tone={item.status === 'planned' ? 'brand' : undefined} />
                        {t(item.label)}
                    </span>
                ))}
                <span className="board-legend-item">
                    <Pip />{t('Chưa lưu')}
                </span>
            </div>

            <Segmented<ViewKey>
                className="board-views"
                value={view}
                onChange={setView}
                options={views}
            />

            <div className="board-view">
                {view === 'semester' && <SemesterView structure={structure} view={boardView} outsideCourses={outsideCourses} />}
                {view === 'groups' && <GroupsView structure={structure} view={boardView} outsideCourses={outsideCourses} />}
                {view === 'graph' && (
                    <Suspense fallback={<PageLoading label={t('Đang tải sơ đồ...')} />}>
                        <PrerequisiteGraph
                            curriculumId={curriculumId}
                            courses={courses}
                            groups={groups}
                            statusMap={statusMap}
                            planMap={planMap}
                        />
                    </Suspense>
                )}
                {view === 'categories' && (categoriesQuery.isLoading
                    ? <Skeleton active />
                    : <CategoriesView categories={categoriesQuery.data ?? []} structure={structure} view={boardView} />)}
                {view === 'specializations' && (specializationsQuery.isLoading
                    ? <Skeleton active />
                    : <SpecializationsView specializations={specializations} required={curriculum.specialization_required} view={boardView} />)}
                {view === 'catalog' && (
                    <CatalogView
                        outsideCourses={outsideCourses}
                        placementById={structure.placementById}
                        statusMap={statusMap}
                        planMap={planMap}
                        changedIds={changedIds}
                        statusFilter={statusFilter}
                        onToggle={toggle}
                        onOpen={setOpenCourse}
                    />
                )}
            </div>

            {draft.changeCount > 0 && (
                <div className="board-savebar" role="status">
                    <span className="board-savebar-text">
                        {t('{{count}} môn có thay đổi chưa lưu, đang giữ tạm trên trình duyệt.', { count: draft.changeCount })}
                    </span>
                    <Popconfirm
                        title={t('Hoàn tác mọi thay đổi chưa lưu?')}
                        okText={t('Hoàn tác')}
                        cancelText={t('Không')}
                        onConfirm={draft.discard}
                    >
                        <ITextBtn icon={<PiArrowCounterClockwise />} disabled={draft.saving}>{t('Hoàn tác')}</ITextBtn>
                    </Popconfirm>
                    <ISolidBtn size="small" icon={<PiFloppyDisk />} loading={draft.saving} onClick={() => void save()}>{t('Lưu')}</ISolidBtn>
                </div>
            )}

            <CourseDrawer course={openCourse} context={drawerContext} draft={draft} onClose={() => setOpenCourse(null)} />
        </section>
    );
};

export default CurriculumBoard;
