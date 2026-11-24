import { lazy, Suspense, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, Card, Input, Popconfirm, Select, Skeleton, Space, Tabs, Tag, Typography } from 'antd';
import { LuChartColumn, LuSave, LuSearch, LuUndo2 } from 'react-icons/lu';
import { Link, useNavigate } from 'react-router';
import { IOutLinedBtn, ISolidBtn, ITextBtn, PageHeader } from '@/components';
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
import { computeCurriculumBlocks, summarizeCurriculumCredits } from '@/utils/curriculum-credits';
import { toastMessage } from '@/utils/toast';
import type { StatusChange } from '@/utils/student-course-file';
import CourseStatusFileActions from '../components/CourseStatusFileActions';
import { StackedBar } from '../components/charts';
import { MetricGroup, MetricTile, ProgressHero } from '../components/ProgressSummary';
import { currentSemester, nextMainSemester, recommendedSemester } from '@/utils/semester';
import CourseCard from './CourseCard';
import CourseDrawer, { type CourseContext } from './CourseDrawer';
import CatalogView from './CatalogView';
import { CategoriesView, GroupsView, SemesterView, SpecializationsView, type BoardView } from './sections';
import { buildStructure, canPlan } from './structure';
import { useCourseDraft } from './useCourseDraft';

// React Flow khá nặng: chỉ tải khi mở tab sơ đồ.
const PrerequisiteGraph = lazy(() => import('./graph/PrerequisiteGraph'));

const { Text } = Typography;

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

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
    ...Object.values(STUDENT_COURSE_STATUS).map(value => ({ value, label: STUDENT_COURSE_STATUS_LABEL[value] })),
    { value: 'planned', label: 'Đã lên kế hoạch' },
    { value: 'none', label: 'Chưa khai' },
];

const LEGEND: { status: StudentCourseStatus | 'none' | 'planned'; label: string; color: string }[] = [
    { status: 'none', label: 'Chưa khai', color: 'var(--border-strong)' },
    { status: 'planned', label: 'Đã lên kế hoạch', color: 'var(--status-planned)' },
    { status: 'completed', label: 'Đã hoàn thành', color: 'var(--status-completed)' },
    { status: 'in-progress', label: 'Đang học', color: 'var(--status-progress)' },
    { status: 'failed', label: 'Chưa đạt', color: 'var(--status-failed)' },
    { status: 'not-started', label: 'Chưa học', color: 'var(--status-not-started)' },
];

type ViewKey = 'semester' | 'groups' | 'graph' | 'categories' | 'specializations' | 'catalog';

interface CurriculumBoardProps {
    userId: string;
    curriculumId: string;
}

/**
 * Trang môn học của sinh viên đã chọn chương trình: toàn bộ chương trình hiển thị dạng thẻ theo kỳ/khối.
 * Bấm thẻ đổi trạng thái ngay trên client (không gọi API), nháp giữ ở localStorage;
 * chỉ ghi về server khi bấm "Lưu" hoặc "Phân tích".
 */
const CurriculumBoard = ({ userId, curriculumId }: CurriculumBoardProps) => {
    const navigate = useNavigate();

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

    const stats = useMemo(() => {
        const creditsWith = (status: StudentCourseStatus) => [...draft.statusMap]
            .filter(([, value]) => value === status)
            .reduce((total, [id]) => total + (courseById.get(id)?.credits ?? 0), 0);
        const plannedIds = [...draft.planMap.keys()].filter(id => canPlan(draft.statusMap.get(id) ?? null));
        return {
            requiredCourses: blocks.reduce((total, block) => total + block.needCount, 0),
            completedCourses: blocks.reduce((total, block) => total + block.doneCount, 0),
            completedCredits: blocks.reduce((total, block) => total + block.doneCredits, 0),
            // Cùng cách tính với trang Phân tích (tổng các khối), không dùng số khai báo ở nguồn.
            totalCredits: summarizeCurriculumCredits(courses, groups).totalCredits,
            inProgressCredits: creditsWith(STUDENT_COURSE_STATUS.IN_PROGRESS),
            failedCount: [...draft.statusMap.values()].filter(status => status === STUDENT_COURSE_STATUS.FAILED).length,
            plannedCredits: plannedIds.reduce((total, id) => total + (courseById.get(id)?.credits ?? 0), 0),
        };
    }, [blocks, draft.statusMap, draft.planMap, courseById, courses, groups]);

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
        toastMessage.info(`Đã đưa ${changes.length} môn vào bản nháp. Bấm “Lưu” để ghi lại.`);
    }, [setStatus]);

    const drawerContext = useMemo<CourseContext | null>(() => {
        if (!openCourse) return null;
        return {
            placement: structure.placementById.get(openCourse.id) ?? 'Ngoài chương trình',
            groups: structure.groupNamesById.get(openCourse.id) ?? [],
        };
    }, [openCourse, structure]);

    const save = async () => {
        const count = draft.changeCount;
        const result = await draft.save();
        if (result.ok) toastMessage.success(`Đã lưu thay đổi của ${count} môn.`);
        else if (result.failed.length === 2) toastMessage.error('Chưa lưu được. Thay đổi vẫn được giữ trên trình duyệt, hãy thử lại.');
        else toastMessage.error(result.failed[0] === 'plan'
            ? 'Đã lưu trạng thái, nhưng chưa lưu được học kỳ dự kiến. Hãy thử lại.'
            : 'Đã lưu học kỳ dự kiến, nhưng chưa lưu được trạng thái môn. Hãy thử lại.');
        return result.ok;
    };

    const analyze = async () => {
        if (draft.changeCount && !(await save())) return;
        navigate('/courses/analysis');
    };

    const loading = curriculumQuery.isLoading || coursesQuery.isLoading || groupsQuery.isLoading
        || statusesQuery.isLoading || planQuery.isLoading;
    const loadError = curriculumQuery.isError || coursesQuery.isError || groupsQuery.isError
        || statusesQuery.isError || planQuery.isError;
    const curriculum = curriculumQuery.data;
    const specializations = specializationsQuery.data ?? [];

    const pct = (value: number) => (stats.totalCredits ? Math.min(100, (value / stats.totalCredits) * 100) : 0);

    return (
        // Chừa sẵn chỗ ở đáy cho thanh "chưa lưu" nổi, để nó không che hàng thẻ cuối.
        <section style={{ paddingBottom: 72 }}>
            <PageHeader
                title="Chương trình của tôi"
                subtitle="Bấm vào thẻ môn để đổi trạng thái ngay. Thay đổi được giữ tạm trên trình duyệt và chỉ lưu khi bạn bấm “Lưu” hoặc “Phân tích”."
                extra={(
                    <Space wrap>
                        <ISolidBtn icon={<LuSave />} disabled={!draft.changeCount} loading={draft.saving} onClick={() => void save()}>
                            Lưu
                        </ISolidBtn>
                        <IOutLinedBtn icon={<LuChartColumn />} loading={draft.saving} onClick={() => void analyze()}>
                            Phân tích
                        </IOutLinedBtn>
                        <CourseStatusFileActions
                            statusByCourseId={draft.statusMap}
                            templateCourses={templateCourses}
                            onApply={applyFileChanges}
                        />
                    </Space>
                )}
            />

            {loadError ? (
                <Alert type="error" showIcon title="Không tải được chương trình đào tạo" description="Vui lòng tải lại trang để thử lại." />
            ) : loading || !curriculum ? (
                <Card><Skeleton active paragraph={{ rows: 8 }} /></Card>
            ) : (
                <div className="stack">
                    <Card size="small">
                        <div className="board-curriculum-head">
                            <div style={{ minWidth: 0 }}>
                                <h2 className="board-curriculum-title">{curriculum.name}</h2>
                                <div className="board-curriculum-meta">
                                    <Tag style={{ marginInlineEnd: 0 }}>{curriculum.code}</Tag>
                                    <Tag style={{ marginInlineEnd: 0 }}>Khóa {curriculum.cohort}</Tag>
                                    <Tag style={{ marginInlineEnd: 0 }}>{curriculum.major}</Tag>
                                </div>
                            </div>
                            <Link to="/profile"><ITextBtn size="small">Giới thiệu chương trình</ITextBtn></Link>
                        </div>
                        <div className="progress-overview" style={{ marginBottom: 16 }}>
                            <ProgressHero
                                percent={pct(stats.completedCredits)}
                                value={stats.completedCredits}
                                total={stats.totalCredits}
                                unit="TC"
                                label="Tín chỉ tích lũy / chuẩn tốt nghiệp"
                                caption={`${stats.completedCourses} / ${stats.requiredCourses} môn được tính vào chuẩn tốt nghiệp`}
                            />
                            <div className="progress-overview-groups">
                                <MetricGroup title="Tín chỉ">
                                    <MetricTile label="Đang học" value={stats.inProgressCredits} unit="TC" tone="progress" />
                                    <MetricTile label="Đã lên kế hoạch" value={stats.plannedCredits} unit="TC" tone="plan-status" />
                                    <MetricTile
                                        label="Còn thiếu"
                                        value={Math.max(0, stats.totalCredits - stats.completedCredits - stats.inProgressCredits - stats.plannedCredits)}
                                        unit="TC"
                                        tone="remaining"
                                        note="chưa học, chưa xếp kỳ"
                                    />
                                </MetricGroup>
                                <MetricGroup title="Môn học">
                                    <MetricTile
                                        label="Đã hoàn thành"
                                        value={stats.completedCourses}
                                        unit={`/ ${stats.requiredCourses} môn`}
                                        tone="done"
                                    />
                                    <MetricTile
                                        label="Chưa đạt"
                                        value={stats.failedCount}
                                        unit="môn"
                                        tone={stats.failedCount ? 'danger' : 'neutral'}
                                        note={stats.failedCount ? 'cần học lại' : undefined}
                                    />
                                </MetricGroup>
                            </div>
                        </div>
                        <StackedBar
                            title="Tín chỉ chuẩn tốt nghiệp"
                            total={stats.totalCredits}
                            segments={[
                                { key: 'done', value: stats.completedCredits, label: 'Đã tích lũy' },
                                { key: 'inProgress', value: stats.inProgressCredits },
                                { key: 'planStatus', value: stats.plannedCredits },
                            ]}
                        />
                    </Card>

                    {draft.changeCount > 0 && (
                        <div className="board-savebar" role="status">
                            <span className="board-savebar-text">
                                <Text strong>{draft.changeCount} môn</Text> có thay đổi chưa lưu, đang giữ tạm trên trình duyệt.
                            </span>
                            <Popconfirm
                                title="Hoàn tác mọi thay đổi chưa lưu?"
                                okText="Hoàn tác"
                                cancelText="Không"
                                onConfirm={draft.discard}
                            >
                                <ITextBtn icon={<LuUndo2 />} disabled={draft.saving}>Hoàn tác</ITextBtn>
                            </Popconfirm>
                            <ISolidBtn icon={<LuSave />} loading={draft.saving} onClick={() => void save()}>Lưu</ISolidBtn>
                        </div>
                    )}

                    <Card size="small">
                        <div className="stack" style={{ gap: 12 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                                <Input
                                    allowClear
                                    prefix={<LuSearch />}
                                    placeholder="Tìm theo mã hoặc tên môn"
                                    aria-label="Tìm môn theo mã hoặc tên"
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    style={{ maxWidth: 300 }}
                                />
                                <Select<StatusFilter>
                                    allowClear
                                    placeholder="Mọi trạng thái"
                                    aria-label="Lọc theo trạng thái"
                                    style={{ width: 170 }}
                                    options={STATUS_FILTER_OPTIONS}
                                    value={statusFilter}
                                    onChange={setStatusFilter}
                                />
                            </div>
                            <div className="board-legend">
                                {LEGEND.map(item => (
                                    <span key={item.status} className="board-legend-item">
                                        <span className="board-legend-swatch" style={{ borderColor: item.color, background: 'var(--bg-subtle)' }} />
                                        {item.label}
                                    </span>
                                ))}
                                <span className="board-legend-item">
                                    <span style={{ color: 'var(--status-dirty)', fontSize: 10 }}>●</span>Chưa lưu
                                </span>
                            </div>
                        </div>
                    </Card>

                    <Tabs
                        activeKey={view}
                        onChange={key => setView(key as ViewKey)}
                        items={[
                            {
                                key: 'semester',
                                label: 'Theo học kỳ',
                                children: <SemesterView structure={structure} view={boardView} outsideCourses={outsideCourses} />,
                            },
                            {
                                key: 'groups',
                                label: `Theo khối kiến thức (${structure.rootGroups.length + 1})`,
                                children: <GroupsView structure={structure} view={boardView} outsideCourses={outsideCourses} />,
                            },
                            {
                                key: 'graph',
                                label: 'Sơ đồ điều kiện',
                                children: (
                                    <Suspense fallback={<Card><Skeleton active paragraph={{ rows: 8 }} /></Card>}>
                                        <PrerequisiteGraph
                                            curriculumId={curriculumId}
                                            courses={courses}
                                            groups={groups}
                                            statusMap={statusMap}
                                            planMap={planMap}
                                        />
                                    </Suspense>
                                ),
                            },
                            {
                                key: 'categories',
                                label: `Nhóm học phần (${categoriesQuery.data?.length ?? 0})`,
                                children: categoriesQuery.isLoading
                                    ? <Skeleton active />
                                    : <CategoriesView categories={categoriesQuery.data ?? []} structure={structure} view={boardView} />,
                            },
                            {
                                key: 'specializations',
                                label: `Chuyên ngành (${specializations.length})`,
                                children: specializationsQuery.isLoading
                                    ? <Skeleton active />
                                    : (
                                        <SpecializationsView
                                            specializations={specializations}
                                            required={curriculum.specialization_required}
                                            view={boardView}
                                        />
                                    ),
                            },
                            {
                                key: 'catalog',
                                label: 'Danh mục môn học',
                                children: (
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
                                ),
                            },
                        ]}
                    />
                </div>
            )}

            <CourseDrawer course={openCourse} context={drawerContext} draft={draft} onClose={() => setOpenCourse(null)} />
        </section>
    );
};

export default CurriculumBoard;
