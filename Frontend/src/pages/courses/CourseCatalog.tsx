import { useState } from 'react';
import { Card, Input, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LuSearch } from 'react-icons/lu';
import { Link, useLocation, useNavigate } from 'react-router';
import { ITable, PageHeader } from '@/components';
import { listCourses } from '@/apis/course';
import { useApiQuery, useDebounce, usePageLocation } from '@/hooks';
import type { Course } from '@/types';

const { Text } = Typography;

const courseLink = (code: string) => `/courses/${encodeURIComponent(code)}`;

/** Quản trị tra cứu toàn bộ danh mục môn (phân trang + tìm kiếm ở server). */
const CourseCatalog = () => {
    const { page, pageSize, filters } = usePageLocation<{ search?: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [search, setSearch] = useState(filters?.search ?? '');
    const keyword = useDebounce(search, 300).trim();

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

    const columns: ColumnsType<Course> = [
        {
            title: 'Mã môn',
            dataIndex: 'code',
            width: 110,
            fixed: 'left',
            render: (code: string) => <Link to={courseLink(code)}><Text strong>{code}</Text></Link>,
        },
        {
            title: 'Học phần',
            dataIndex: 'name',
            render: (name: string, row) => (
                <div>
                    <Link to={courseLink(row.code)}>{name}</Link>
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

    return (
        <section>
            <PageHeader title="Danh mục môn học" subtitle="Tra cứu danh mục môn học theo mã hoặc tên." />

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

                <ITable<Course>
                    rowKey="id"
                    showIndex={false}
                    columns={columns}
                    dataSource={catalogQuery.data?.items ?? []}
                    loading={catalogQuery.isFetching}
                    filters={{ search: keyword || undefined }}
                    pagination={{ total: catalogQuery.data?.pagination.itemCount ?? 0, current: page, pageSize }}
                    emptyText="Không có môn học nào khớp từ khoá."
                />
            </Card>
        </section>
    );
};

export default CourseCatalog;
