import { useMemo, useState } from 'react';
import { Alert, Card, Input, Segmented, Select, Space, Statistic, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LuChartColumn, LuPencil, LuSearch } from 'react-icons/lu';
import { Link, useLocation, useNavigate } from 'react-router';
import { IconBtn, IOutLinedBtn, ISolidBtn, ITable, PageHeader, TablePageSkeleton } from '@/components';
import { listCourses } from '@/apis/course';
import { getCurriculum, listCourseGroups, listCurriculumCategories, listCurriculumCourses } from '@/apis/curriculum';
import { getMyProfile, listMyCourses, listMyPlanCourses } from '@/apis/student';
import { useApiQuery, useCurrentRole, useDebounce, usePageLocation } from '@/hooks';
import {
    ROLE,
    STUDENT_COURSE_STATUS,
    STUDENT_COURSE_STATUS_COLOR,
    STUDENT_COURSE_STATUS_LABEL,
    type CourseSummary,
    type StudentCourseStatus,
} from '@/types';
import { courseSearchRank } from '@/utils/course-search';
import { summarizeCurriculumProgress } from '@/utils/curriculum-credits';
import CourseEditModal from './components/CourseEditModal';
import CourseStatusFileActions from './components/CourseStatusFileActions';
import SemesterSummary from './components/SemesterSummary';
import { countCoursesWithoutPeDuplicates } from './physical-education';
import type { CourseRow } from './types';

const { Text } = Typography;

type Scope = 'curriculum' | 'all';
/** `none` = môn chưa khai trạng thái. */
type StatusFilter = StudentCourseStatus | 'none';

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
    ...Object.values(STUDENT_COURSE_STATUS).map(value => ({ value, label: STUDENT_COURSE_STATUS_LABEL[value] })),
    { value: 'none', label: 'Chưa khai' },
];

/** Thứ tự học: theo năm/kỳ khuyến nghị; môn chưa xếp kỳ và môn ngoài chương trình xếp cuối. */
const byStudyOrder = (a: CourseRow, b: CourseRow) => (
    (a.recommendedYear ?? Number.POSITIVE_INFINITY) - (b.recommendedYear ?? Number.POSITIVE_INFINITY)
    || (a.recommendedTerm ?? Number.POSITIVE_INFINITY) - (b.recommendedTerm ?? Number.POSITIVE_INFINITY)
    || Number(b.inCurriculum) - Number(a.inCurriculum)
    || a.code.localeCompare(b.code)
);

/**
 * Trang môn học duy nhất của sinh viên: danh mục/chương trình, trạng thái học tập và kế hoạch học kỳ
 * (gộp ba trang cũ "Chương trình & học phần", "Trạng thái môn học", "Kế hoạch học tập").
 * Admin xem được danh mục môn nhưng không có phần dữ liệu cá nhân.
 */
const CoursesPage = () => {
    const role = useCurrentRole();
    const isStudent = role === ROLE.STUDENT;

    const { page, pageSize, filters } = usePageLocation<{ search?: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [search, setSearch] = useState(filters?.search ?? '');
    const debouncedSearch = useDebounce(search, 300);
    const keyword = debouncedSearch.trim();
    const [statusFilter, setStatusFilter] = useState<StatusFilter>();
    const [scopeChoice, setScopeChoice] = useState<Scope>();
    const [editing, setEditing] = useState<CourseRow | null>(null);

    /** Đổi bộ lọc thì quay về trang 1, tránh đứng ở trang không còn tồn tại. */
    const resetPage = () => {
        const params = new URLSearchParams(location.search);
        if (!params.has('page') || params.get('page') === '1') return;
        params.set('page', '1');
        navigate(`?${params.toString()}`, { replace: true, state: location.state });
    };

    const profileQuery = useApiQuery(['my-profile'], getMyProfile, { enabled: isStudent });
    const curriculumId = profileQuery.data?.curriculum_id ?? undefined;
    const hasCurriculum = isStudent && Boolean(curriculumId);
    const scope: Scope = hasCurriculum ? scopeChoice ?? 'curriculum' : 'all';
    // "Chưa khai" trên toàn bộ danh mục (hàng nghìn môn) không lọc được ở client; chỉ dùng trong chương trình.
    const activeStatusFilter = scope === 'all' && statusFilter === 'none' ? undefined : statusFilter;
    /**
     * Toàn bộ danh mục, không lọc trạng thái: phân trang + tìm kiếm ở server.
     * Các trường hợp còn lại (môn của chương trình, hoặc lọc theo trạng thái - chỉ gồm môn đã khai)
     * đều là danh sách nhỏ nên lọc và phân trang ở client.
     */
    const serverPaged = scope === 'all' && !activeStatusFilter;

    const catalogQuery = useApiQuery(
        ['courses', page, pageSize, keyword],
        () => listCourses({ page, take: pageSize, search: keyword || undefined }),
        { enabled: serverPaged && (!isStudent || profileQuery.isSuccess), placeholderData: previous => previous },
    );

    const curriculumQuery = useApiQuery(
        ['curriculum', curriculumId],
        () => getCurriculum(curriculumId!),
        { enabled: hasCurriculum },
    );
    const curriculumCoursesQuery = useApiQuery(
        ['curriculum-courses', curriculumId],
        () => listCurriculumCourses(curriculumId!),
        { enabled: hasCurriculum },
    );
    const categoriesQuery = useApiQuery(
        ['curriculum-categories', curriculumId],
        () => listCurriculumCategories(curriculumId!),
        { enabled: hasCurriculum },
    );
    // Dùng chung cache với tab Nhóm môn của admin.
    const groupsQuery = useApiQuery(
        ['curriculum-groups', curriculumId],
        () => listCourseGroups(curriculumId!),
        { enabled: hasCurriculum },
    );
    const statusesQuery = useApiQuery(['student-courses'], listMyCourses, { enabled: isStudent });
    const planQuery = useApiQuery(
        ['plan-courses', curriculumId],
        () => listMyPlanCourses(curriculumId),
        { enabled: hasCurriculum },
    );

    const statusByCourseId = useMemo(
        () => new Map((statusesQuery.data ?? []).map(item => [item.course_id, item.status])),
        [statusesQuery.data],
    );

    /** Ghép thông tin môn với dữ liệu chương trình, trạng thái và kế hoạch của sinh viên. */
    const toRow = useMemo(() => {
        const curriculumById = new Map((curriculumCoursesQuery.data ?? []).map(item => [item.course_id, item]));
        const planById = new Map((planQuery.data ?? []).map(item => [item.course_id, item]));
        const categoriesById = new Map<string, string[]>();
        (categoriesQuery.data ?? []).forEach(category => category.members.forEach(member => {
            categoriesById.set(member.course_id, [...(categoriesById.get(member.course_id) ?? []), category.name]);
        }));

        return (id: string, course: CourseSummary): CourseRow => {
            const inCurriculum = curriculumById.get(id);
            return {
                courseId: id,
                code: course.code,
                name: course.name,
                description: course.description ?? null,
                credits: course.credits,
                inCurriculum: Boolean(inCurriculum),
                recommendedYear: inCurriculum?.recommended_year ?? null,
                recommendedTerm: inCurriculum?.recommended_term ?? null,
                categories: categoriesById.get(id) ?? [],
                status: statusByCourseId.get(id) ?? null,
                plannedSemester: planById.get(id)?.semester_code ?? null,
            };
        };
    }, [curriculumCoursesQuery.data, planQuery.data, categoriesQuery.data, statusByCourseId]);

    /** Môn của chương trình + môn đã khai/lên kế hoạch ngoài chương trình (vài trăm môn là cùng). */
    const curriculumRows = useMemo<CourseRow[]>(() => {
        if (!hasCurriculum) return [];
        const summaries = new Map<string, CourseSummary>();
        (curriculumCoursesQuery.data ?? []).forEach(item => summaries.set(item.course_id, item.course));
        (statusesQuery.data ?? []).forEach(item => summaries.set(item.course_id, summaries.get(item.course_id) ?? item.course));
        (planQuery.data ?? []).forEach(item => summaries.set(item.course_id, summaries.get(item.course_id) ?? item.course));
        return [...summaries.entries()]
            .map(([id, course]) => toRow(id, course))
            .filter(row => row.code)
            .sort(byStudyOrder);
    }, [hasCurriculum, curriculumCoursesQuery.data, statusesQuery.data, planQuery.data, toRow]);

    /** Danh sách lọc ở client: môn chương trình, hoặc môn đã khai khi lọc trạng thái trên toàn danh mục. */
    const clientRows = useMemo<CourseRow[]>(() => {
        if (serverPaged) return [];
        const source = scope === 'curriculum'
            ? curriculumRows
            : (statusesQuery.data ?? [])
                .map(item => toRow(item.course_id, item.course))
                .sort((a, b) => a.code.localeCompare(b.code));
        const ranked = source
            .map(row => ({ row, rank: courseSearchRank(row, keyword) }))
            .filter(({ row, rank }) => rank !== null && (
                !activeStatusFilter
                || (activeStatusFilter === 'none' ? row.status === null : row.status === activeStatusFilter)
            ));
        // Có từ khoá thì môn khớp mã lên trước; cùng mức giữ thứ tự cũ (sort ổn định).
        if (keyword) ranked.sort((a, b) => a.rank! - b.rank!);
        return ranked.map(({ row }) => row);
    }, [serverPaged, scope, curriculumRows, statusesQuery.data, toRow, keyword, activeStatusFilter]);

    /** Môn điền sẵn vào file mẫu khai trạng thái: chương trình + đã khai/lên kế hoạch. */
    const templateCourses = useMemo<CourseSummary[]>(() => {
        if (hasCurriculum) {
            return curriculumRows.map(row => ({
                id: row.courseId, code: row.code, name: row.name, credits: row.credits, description: row.description,
            }));
        }
        return (statusesQuery.data ?? []).map(item => item.course);
    }, [hasCurriculum, curriculumRows, statusesQuery.data]);

    const serverRows = useMemo(
        () => (serverPaged ? (catalogQuery.data?.items ?? []).map(course => toRow(course.id, course)) : []),
        [serverPaged, catalogQuery.data, toRow],
    );

    // Thống kê lấy từ dữ liệu đã lưu, không phụ thuộc bộ lọc của bảng.
    const stats = useMemo(() => {
        const declared = statusesQuery.data ?? [];
        const completed = declared.filter(item => item.status === STUDENT_COURSE_STATUS.COMPLETED);
        const plannedCredits = (planQuery.data ?? []).reduce((total, item) => total + item.course.credits, 0);

        // Có chương trình: so với chuẩn tốt nghiệp, chỉ tính phần môn/tín chỉ được công nhận.
        if (hasCurriculum && curriculumCoursesQuery.data && groupsQuery.data) {
            const progress = summarizeCurriculumProgress(
                curriculumCoursesQuery.data,
                groupsQuery.data,
                completed.map(item => ({ course_id: item.course_id, credits: item.course.credits })),
            );
            return {
                declared: countCoursesWithoutPeDuplicates(declared),
                completed: progress.completedCourses,
                completedCredits: progress.completedCredits,
                requiredCourses: progress.requiredCourses as number | null,
                totalCredits: progress.totalCredits as number | null,
                plannedCredits,
            };
        }

        // Chưa chọn chương trình: không có mốc tốt nghiệp, đếm mọi môn đã hoàn thành (học phần thể thao không tính trùng PE1003/PE1005).
        return {
            declared: countCoursesWithoutPeDuplicates(declared),
            completed: countCoursesWithoutPeDuplicates(completed),
            completedCredits: completed.reduce((total, item) => total + item.course.credits, 0),
            requiredCourses: null,
            totalCredits: null,
            plannedCredits,
        };
    }, [statusesQuery.data, planQuery.data, hasCurriculum, curriculumCoursesQuery.data, groupsQuery.data]);
    const progressLoading = hasCurriculum && (curriculumCoursesQuery.isLoading || groupsQuery.isLoading);

    const totalRows = serverPaged ? catalogQuery.data?.pagination.itemCount ?? 0 : clientRows.length;
    // Lọc làm danh sách ngắn lại thì không để trang hiện tại vượt quá số trang.
    const currentPage = serverPaged ? page : Math.min(page, Math.max(1, Math.ceil(totalRows / pageSize)));
    const tableRows = serverPaged
        ? serverRows
        : clientRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const tableLoading = serverPaged
        ? catalogQuery.isFetching
        : curriculumCoursesQuery.isFetching || statusesQuery.isFetching || planQuery.isFetching;

    if (isStudent && profileQuery.isLoading) {
        return <TablePageSkeleton />;
    }

    const columns: ColumnsType<CourseRow> = [
        {
            title: 'Mã môn',
            dataIndex: 'code',
            width: 110,
            fixed: 'left',
            render: (code: string) => (
                <Link to={`/courses/${encodeURIComponent(code)}`}><Text strong>{code}</Text></Link>
            ),
        },
        {
            title: 'Học phần',
            dataIndex: 'name',
            render: (name: string, row) => (
                <div>
                    <Link to={`/courses/${encodeURIComponent(row.code)}`}>{name}</Link>
                    {row.description && (
                        <div><Text type="secondary" style={{ fontSize: 12 }}>{row.description}</Text></div>
                    )}
                </div>
            ),
        },
        {
            title: 'Tín chỉ',
            dataIndex: 'credits',
            width: 84,
            align: 'center',
            render: (credits: number) => <Tag>{credits} TC</Tag>,
        },
    ];

    if (hasCurriculum) {
        columns.push(
            {
                title: 'Nhóm học phần',
                key: 'categories',
                width: 200,
                render: (_value, row) => (row.categories.length
                    ? <Space wrap size={[4, 4]}>{row.categories.map(name => <Tag key={name}>{name}</Tag>)}</Space>
                    : <Text type="secondary">—</Text>),
            },
            {
                title: 'Khuyến nghị',
                key: 'recommended',
                width: 130,
                render: (_value, row) => {
                    if (!row.inCurriculum) return <Tag>Ngoài chương trình</Tag>;
                    if (row.recommendedYear === null) return <Text type="secondary">Chưa xếp kỳ</Text>;
                    return `Năm ${row.recommendedYear} · Kỳ ${row.recommendedTerm}`;
                },
            },
        );
    }

    if (isStudent) {
        columns.push(
            {
                title: 'Trạng thái',
                key: 'status',
                width: 140,
                render: (_value, row) => (row.status
                    ? <Tag color={STUDENT_COURSE_STATUS_COLOR[row.status]}>{STUDENT_COURSE_STATUS_LABEL[row.status]}</Tag>
                    : <Text type="secondary">Chưa khai</Text>),
            },
            {
                title: 'Học kỳ dự kiến',
                key: 'planned',
                width: 120,
                render: (_value, row) => (row.plannedSemester
                    ? <Tag color="purple">HK {row.plannedSemester}</Tag>
                    : <Text type="secondary">—</Text>),
            },
            {
                title: '',
                key: 'actions',
                width: 56,
                align: 'center',
                render: (_value, row) => (
                    <IconBtn size="small" icon={<LuPencil />} label={`Sửa môn ${row.code}`} onClick={() => setEditing(row)} />
                ),
            },
        );
    }

    return (
        <section>
            <PageHeader
                title="Môn học & kế hoạch"
                subtitle={isStudent
                    ? 'Danh sách môn của chương trình, trạng thái học tập và học kỳ dự kiến của bạn. Bấm “Sửa” ở một môn, hoặc khai hàng loạt bằng file Excel/CSV.'
                    : 'Tra cứu danh mục môn học theo mã hoặc tên.'}
                extra={isStudent
                    ? (
                        <Space wrap>
                            {hasCurriculum && (
                                <Link to="/courses/analysis">
                                    <IOutLinedBtn icon={<LuChartColumn />}>Phân tích</IOutLinedBtn>
                                </Link>
                            )}
                            <CourseStatusFileActions statusByCourseId={statusByCourseId} templateCourses={templateCourses} />
                        </Space>
                    )
                    : undefined}
            />

            <div className="stack">
                {isStudent && !hasCurriculum && (
                    <Alert
                        type="info"
                        showIcon
                        title="Chưa chọn chương trình đào tạo"
                        description="Chọn chương trình trong hồ sơ để xem môn theo chương trình, nhóm học phần và lập kế hoạch học kỳ."
                        action={<Link to="/profile"><ISolidBtn size="small">Điền hồ sơ</ISolidBtn></Link>}
                    />
                )}

                {isStudent && (
                    <div className="stat-row">
                        <Card><Statistic title="Môn đã khai" value={stats.declared} suffix="môn" /></Card>
                        <Card>
                            <Statistic
                                title={stats.requiredCourses !== null ? 'Môn đã hoàn thành / phải học' : 'Môn đã hoàn thành'}
                                loading={progressLoading}
                                value={stats.completed}
                                suffix={stats.requiredCourses !== null ? `/ ${stats.requiredCourses} môn` : 'môn'}
                            />
                        </Card>
                        <Card>
                            <Statistic
                                title={stats.totalCredits !== null ? 'Tín chỉ tích lũy / chuẩn tốt nghiệp' : 'Tín chỉ đã hoàn thành'}
                                loading={progressLoading}
                                value={stats.completedCredits}
                                suffix={stats.totalCredits !== null ? `/ ${stats.totalCredits} TC` : 'TC'}
                            />
                        </Card>
                        {hasCurriculum && (
                            <Card><Statistic title="Tín chỉ đã lên kế hoạch" value={stats.plannedCredits} suffix="TC" /></Card>
                        )}
                    </div>
                )}

                {hasCurriculum && <SemesterSummary rows={curriculumRows} curriculum={curriculumQuery.data} />}

                <Card>
                    <div
                        style={{
                            display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16,
                        }}
                    >
                        <Input
                            allowClear
                            size="large"
                            prefix={<LuSearch />}
                            placeholder="Tìm theo mã hoặc tên môn học"
                            aria-label="Tìm môn học theo mã hoặc tên"
                            value={search}
                            onChange={event => { setSearch(event.target.value); resetPage(); }}
                            style={{ maxWidth: 360 }}
                        />
                        {hasCurriculum && (
                            <Segmented<Scope>
                                value={scope}
                                onChange={value => { setScopeChoice(value); resetPage(); }}
                                options={[
                                    { value: 'curriculum', label: 'Chương trình của tôi' },
                                    { value: 'all', label: 'Toàn bộ danh mục' },
                                ]}
                            />
                        )}
                        {isStudent && (
                            <Select<StatusFilter>
                                allowClear
                                placeholder="Mọi trạng thái"
                                style={{ width: 170 }}
                                options={scope === 'all'
                                    ? STATUS_FILTER_OPTIONS.filter(option => option.value !== 'none')
                                    : STATUS_FILTER_OPTIONS}
                                value={activeStatusFilter}
                                onChange={value => { setStatusFilter(value); resetPage(); }}
                            />
                        )}
                        <Text type="secondary">{totalRows} môn</Text>
                    </div>

                    <ITable<CourseRow>
                        rowKey="courseId"
                        showIndex={false}
                        columns={columns}
                        dataSource={tableRows}
                        loading={tableLoading}
                        filters={{ search: keyword || undefined }}
                        pagination={{ total: totalRows, current: currentPage, pageSize }}
                        emptyText="Không có môn học nào khớp bộ lọc hiện tại."
                    />
                </Card>
            </div>

            <CourseEditModal row={editing} curriculumId={curriculumId} onClose={() => setEditing(null)} />
        </section>
    );
};

export default CoursesPage;
