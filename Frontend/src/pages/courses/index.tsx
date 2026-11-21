import { useState } from 'react';
import { Alert, Card, Input, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LuChartColumn, LuSearch } from 'react-icons/lu';
import { Link, useLocation, useNavigate } from 'react-router';
import { IOutLinedBtn, ITable, PageHeader, TablePageSkeleton } from '@/components';
import { listCourses } from '@/apis/course';
import { getMyProfile } from '@/apis/student';
import { useApiQuery, useCurrentRole, useDebounce, usePageLocation } from '@/hooks';
import { ROLE, type CourseSummary } from '@/types';
import { MybkProgressCard, MybkUploadButton } from './components/MybkProgress';

const { Text } = Typography;

/**
 * Trang Môn học.
 * - Sinh viên: chỉ phần tiến độ đọc từ PDF myBK (người duyệt 21/11 bỏ hàng thống kê, bảng tóm tắt theo kỳ và
 *   bảng môn bên dưới; chỗ "Hiệu chỉnh" thêm/bớt/sửa trạng thái sau khi đọc file sẽ thiết kế sau).
 * - Quản trị: tra cứu danh mục môn (phân trang, tìm kiếm ở server).
 */
const CoursesPage = () => {
    const role = useCurrentRole();
    const isStudent = role === ROLE.STUDENT;

    const profileQuery = useApiQuery(['my-profile'], getMyProfile, { enabled: isStudent });
    const hasCurriculum = isStudent && Boolean(profileQuery.data?.curriculum_id);

    if (isStudent && profileQuery.isLoading) {
        return <TablePageSkeleton />;
    }

    if (!isStudent) return <CourseCatalog />;

    return (
        <section>
            <PageHeader
                title="Môn học & kế hoạch"
                subtitle='Trạng thái học tập lấy từ trang "Tiến độ hoàn thành CTĐT" của myBK (file PDF hoặc nội dung trang dán vào). Nhập lại để cập nhật.'
                extra={(
                    <Space wrap>
                        {hasCurriculum && (
                            <Link to="/courses/analysis">
                                <IOutLinedBtn icon={<LuChartColumn />}>Phân tích</IOutLinedBtn>
                            </Link>
                        )}
                        <MybkUploadButton />
                    </Space>
                )}
            />

            <div className="stack">
                {!hasCurriculum && (
                    <Alert
                        type="info"
                        showIcon
                        title="Chưa có chương trình đào tạo"
                        description='Nhập tiến độ từ myBK (file PDF hoặc dán nội dung trang) rồi bấm Xác nhận: web nhận chương trình theo mã CTĐT.'
                        action={<MybkUploadButton />}
                    />
                )}

                <MybkProgressCard />
            </div>
        </section>
    );
};

const catalogColumns: ColumnsType<CourseSummary> = [
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

/** Danh mục môn cho quản trị: phân trang và tìm kiếm ở server. */
const CourseCatalog = () => {
    const { page, pageSize, filters } = usePageLocation<{ search?: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [search, setSearch] = useState(filters?.search ?? '');
    const keyword = useDebounce(search, 300).trim();

    /** Đổi từ khóa thì quay về trang 1, tránh đứng ở trang không còn tồn tại. */
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
    const total = catalogQuery.data?.pagination.itemCount ?? 0;

    return (
        <section>
            <PageHeader title="Môn học" subtitle="Tra cứu danh mục môn học theo mã hoặc tên." />
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
                    <Text type="secondary">{total} môn</Text>
                </div>
                <ITable<CourseSummary>
                    rowKey="id"
                    showIndex={false}
                    columns={catalogColumns}
                    dataSource={catalogQuery.data?.items ?? []}
                    loading={catalogQuery.isFetching}
                    filters={{ search: keyword || undefined }}
                    pagination={{ total, current: page, pageSize }}
                    emptyText="Không có môn học nào khớp từ khóa."
                />
            </Card>
        </section>
    );
};

export default CoursesPage;
