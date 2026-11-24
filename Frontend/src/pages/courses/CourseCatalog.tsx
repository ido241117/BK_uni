import { useMemo, useState } from 'react';
import { Alert, Card, Input, Statistic, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LuPencil, LuSearch } from 'react-icons/lu';
import { Link, useLocation, useNavigate } from 'react-router';
import { IconBtn, ISolidBtn, ITable, PageHeader } from '@/components';
import { listCourses } from '@/apis/course';
import { listMyCourses } from '@/apis/student';
import { useApiQuery, useDebounce, usePageLocation } from '@/hooks';
import {
    STUDENT_COURSE_STATUS,
    STUDENT_COURSE_STATUS_COLOR,
    STUDENT_COURSE_STATUS_LABEL,
    type CourseSummary,
} from '@/types';
import CourseEditModal from './components/CourseEditModal';
import CourseStatusFileActions from './components/CourseStatusFileActions';
import { countCoursesWithoutPeDuplicates } from './physical-education';
import type { CourseRow } from './types';

const { Text } = Typography;

/**
 * Tra cứu toàn bộ danh mục môn (phân trang + tìm kiếm ở server).
 * Dùng cho admin và sinh viên chưa chọn chương trình; sinh viên đã chọn chương trình dùng `CurriculumBoard`.
 */
const CourseCatalog = ({ isStudent }: { isStudent: boolean }) => {
    const { page, pageSize, filters } = usePageLocation<{ search?: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [search, setSearch] = useState(filters?.search ?? '');
    const keyword = useDebounce(search, 300).trim();
    const [editing, setEditing] = useState<CourseRow | null>(null);

    /** Đổi từ khoá thì quay về trang 1, tránh đứng ở trang không còn tồn tại. */
    const resetPage = () => {
        const params = new URLSearchParams(location.search);
        if (!params.has('page') || params.get('page') === '1') return;
        params.set('page', '1');
        navigate(`?${params.toString()}`, { replace: true, state: location.state });
    };

    const catalogQuery = useApiQuery(
        ['courses', page, pageSize, keyword],
        () => listCourses({ page, take: pageSize, search: keyword || undefined }),
        { placeholderData: previous => previous },
    );
    const statusesQuery = useApiQuery(['student-courses'], listMyCourses, { enabled: isStudent });

    const statusByCourseId = useMemo(
        () => new Map((statusesQuery.data ?? []).map(item => [item.course_id, item.status])),
        [statusesQuery.data],
    );
    const templateCourses = useMemo<CourseSummary[]>(
        () => (statusesQuery.data ?? []).map(item => item.course),
        [statusesQuery.data],
    );

    const stats = useMemo(() => {
        const declared = statusesQuery.data ?? [];
        const completed = declared.filter(item => item.status === STUDENT_COURSE_STATUS.COMPLETED);
        return {
            declared: countCoursesWithoutPeDuplicates(declared),
            completed: countCoursesWithoutPeDuplicates(completed),
            completedCredits: completed.reduce((total, item) => total + item.course.credits, 0),
        };
    }, [statusesQuery.data]);

    const rows = useMemo<CourseRow[]>(() => (catalogQuery.data?.items ?? []).map(course => ({
        courseId: course.id,
        code: course.code,
        name: course.name,
        description: course.description ?? null,
        credits: course.credits,
        inCurriculum: false,
        recommendedYear: null,
        recommendedTerm: null,
        categories: [],
        status: statusByCourseId.get(course.id) ?? null,
        plannedSemester: null,
    })), [catalogQuery.data, statusByCourseId]);

    const columns: ColumnsType<CourseRow> = [
        {
            title: 'Mã môn',
            dataIndex: 'code',
            width: 110,
            fixed: 'left',
            render: (code: string) => <Link to={`/courses/${encodeURIComponent(code)}`}><Text strong>{code}</Text></Link>,
        },
        {
            title: 'Học phần',
            dataIndex: 'name',
            render: (name: string, row) => (
                <div>
                    <Link to={`/courses/${encodeURIComponent(row.code)}`}>{name}</Link>
                    {row.description && <div><Text type="secondary" style={{ fontSize: 12 }}>{row.description}</Text></div>}
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
                title={isStudent ? 'Môn học' : 'Danh mục môn học'}
                subtitle={isStudent
                    ? 'Tra cứu danh mục và khai trạng thái học tập. Chọn chương trình đào tạo trong hồ sơ để xem toàn bộ chương trình dạng thẻ.'
                    : 'Tra cứu danh mục môn học theo mã hoặc tên.'}
                extra={isStudent
                    ? <CourseStatusFileActions statusByCourseId={statusByCourseId} templateCourses={templateCourses} />
                    : undefined}
            />

            <div className="stack">
                {isStudent && (
                    <Alert
                        type="info"
                        showIcon
                        title="Chưa chọn chương trình đào tạo"
                        description="Chọn chương trình trong hồ sơ để xem môn theo kế hoạch giảng dạy, khối kiến thức và lập kế hoạch học kỳ."
                        action={<Link to="/profile"><ISolidBtn size="small">Điền hồ sơ</ISolidBtn></Link>}
                    />
                )}

                {isStudent && (
                    <div className="stat-row">
                        <Card><Statistic title="Môn đã khai" value={stats.declared} suffix="môn" /></Card>
                        <Card><Statistic title="Môn đã hoàn thành" value={stats.completed} suffix="môn" /></Card>
                        <Card><Statistic title="Tín chỉ đã hoàn thành" value={stats.completedCredits} suffix="TC" /></Card>
                    </div>
                )}

                <Card>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
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
                        <Text type="secondary">{catalogQuery.data?.pagination.itemCount ?? 0} môn</Text>
                    </div>

                    <ITable<CourseRow>
                        rowKey="courseId"
                        showIndex={false}
                        columns={columns}
                        dataSource={rows}
                        loading={catalogQuery.isFetching}
                        filters={{ search: keyword || undefined }}
                        pagination={{ total: catalogQuery.data?.pagination.itemCount ?? 0, current: page, pageSize }}
                        emptyText="Không có môn học nào khớp từ khoá."
                    />
                </Card>
            </div>

            <CourseEditModal row={editing} curriculumId={undefined} onClose={() => setEditing(null)} />
        </section>
    );
};

export default CourseCatalog;
