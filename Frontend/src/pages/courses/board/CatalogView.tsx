import { useMemo, useState } from 'react';
import { Card, Input, Segmented, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LuEllipsisVertical, LuSearch } from 'react-icons/lu';
import { Link } from 'react-router';
import { Bead, IconBtn, ITable, Pip } from '@/components';
import { listCourses } from '@/apis/course';
import { useApiQuery, useDebounce } from '@/hooks';
import {
    STUDENT_COURSE_STATUS_LABEL,
    type CourseSummary,
    type StudentCourseStatus,
} from '@/types';
import { courseSearchRank } from '@/utils/course-search';
import { canPlan } from './structure';
import i18n from '@/i18n';

const { Text } = Typography;

type Scope = 'all' | 'outside';

interface CatalogViewProps {
    /** Môn ngoài chương trình đang có trạng thái/kế hoạch (kể cả trong nháp). */
    outsideCourses: CourseSummary[];
    placementById: Map<string, string>;
    statusMap: Map<string, StudentCourseStatus>;
    planMap: Map<string, string>;
    changedIds: Set<string>;
    /** Lọc trạng thái của thanh công cụ; chỉ áp cho danh sách môn ngoài chương trình (danh mục phân trang ở server). */
    statusFilter: StudentCourseStatus | 'none' | 'planned' | undefined;
    onToggle: (course: CourseSummary) => void;
    onOpen: (course: CourseSummary) => void;
}

/**
 * Toàn bộ danh mục môn của trường dạng bảng (phân trang + tìm kiếm ở server), để thêm môn ngoài chương trình
 * (tự chọn tự do, học phần thể chất…). Bấm ô trạng thái để đổi như bấm thẻ; mọi thay đổi vào bản nháp.
 */
const CatalogView = ({
    outsideCourses, placementById, statusMap, planMap, changedIds, statusFilter, onToggle, onOpen,
}: CatalogViewProps) => {
    const [scope, setScope] = useState<Scope>('all');
    const [search, setSearch] = useState('');
    const keyword = useDebounce(search, 300).trim();
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const catalogQuery = useApiQuery(
        ['courses', page, pageSize, keyword],
        () => listCourses({ page, take: pageSize, search: keyword || undefined }),
        { enabled: scope === 'all', placeholderData: previous => previous },
    );

    const outsideRows = useMemo(() => outsideCourses
        .map(course => ({ course, rank: courseSearchRank(course, keyword) }))
        .filter(({ course, rank }) => {
            if (rank === null) return false;
            if (!statusFilter) return true;
            const status = statusMap.get(course.id) ?? null;
            if (statusFilter === 'planned') return canPlan(status) && planMap.has(course.id);
            return statusFilter === 'none' ? status === null : status === statusFilter;
        })
        .sort((a, b) => a.rank! - b.rank!)
        .map(({ course }) => course), [outsideCourses, keyword, statusFilter, statusMap, planMap]);

    const total = scope === 'all' ? catalogQuery.data?.pagination.itemCount ?? 0 : outsideRows.length;
    const current = scope === 'all' ? page : Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    const rows: CourseSummary[] = scope === 'all'
        ? catalogQuery.data?.items ?? []
        : outsideRows.slice((current - 1) * pageSize, current * pageSize);

    const columns: ColumnsType<CourseSummary> = [
        {
            title: i18n.t('Mã môn'),
            dataIndex: 'code',
            width: 110,
            fixed: 'left',
            render: (code: string) => (
                <Link to={`/courses/${encodeURIComponent(code)}`} state={{ from: '/courses' }}><Text strong>{code}</Text></Link>
            ),
        },
        {
            title: i18n.t('Học phần'),
            dataIndex: 'name',
            render: (name: string, course) => (
                <div>
                    <Link to={`/courses/${encodeURIComponent(course.code)}`} state={{ from: '/courses' }}>{name}</Link>
                    {course.description && <div><Text type="secondary" style={{ fontSize: 12 }}>{course.description}</Text></div>}
                </div>
            ),
        },
        {
            title: i18n.t('Tín chỉ'),
            dataIndex: 'credits',
            width: 84,
            align: 'center',
            render: (credits: number) => <Tag>{credits}{' '}{i18n.t('TC')}</Tag>,
        },
        {
            title: i18n.t('Trong chương trình'),
            key: 'placement',
            width: 170,
            render: (_value, course) => {
                const placement = placementById.get(course.id);
                return placement ? <Text>{placement}</Text> : <Tag>{i18n.t('Ngoài chương trình')}</Tag>;
            },
        },
        {
            title: i18n.t('Trạng thái'),
            key: 'status',
            width: 150,
            render: (_value, course) => {
                const status = statusMap.get(course.id) ?? null;
                const planned = canPlan(status) && planMap.has(course.id);
                const label = planned ? i18n.t('Đã lên kế hoạch') : status ? STUDENT_COURSE_STATUS_LABEL[status] : i18n.t('Chưa khai');
                return (
                    <button
                        type="button"
                        className="status-toggle"
                        onClick={() => onToggle(course)}
                        title={i18n.t('Bấm để đổi trạng thái')}
                        aria-label={i18n.t('{{code}}: {{label}}. Bấm để đổi trạng thái.', { code: course.code, label: label })}
                    >
                        <span className="course-status" data-status={planned ? 'planned' : status ?? 'none'}>
                            <Bead state={planned ? 'planned' : status ?? 'none'} />{label}
                        </span>
                        {changedIds.has(course.id) && <Pip />}
                    </button>
                );
            },
        },
        {
            title: i18n.t('Học kỳ dự kiến'),
            key: 'planned',
            width: 120,
            render: (_value, course) => {
                const semester = planMap.get(course.id);
                return semester ? <Tag color="purple">{i18n.t('HK')}{' '}{semester}</Tag> : <Text type="secondary">—</Text>;
            },
        },
        {
            title: '',
            key: 'actions',
            width: 56,
            align: 'center',
            render: (_value, course) => (
                <IconBtn size="small" icon={<LuEllipsisVertical />} label={i18n.t('Sửa môn {{code}}', { code: course.code })} onClick={() => onOpen(course)} />
            ),
        },
    ];

    return (
        <Card size="small">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
                <Input
                    allowClear
                    prefix={<LuSearch />}
                    placeholder={i18n.t('Tìm theo mã hoặc tên môn học')}
                    aria-label={i18n.t('Tìm môn học trong danh mục')}
                    value={search}
                    onChange={event => { setSearch(event.target.value); setPage(1); }}
                    style={{ maxWidth: 360 }}
                />
                <Segmented<Scope>
                    value={scope}
                    onChange={value => { setScope(value); setPage(1); }}
                    options={[
                        { value: 'all', label: i18n.t('Toàn bộ danh mục') },
                        { value: 'outside', label: i18n.t('Đã khai ngoài chương trình ({{length}})', { length: outsideCourses.length }) },
                    ]}
                />
                <Text type="secondary">{total}{' '}{i18n.t('môn')}</Text>
            </div>

            <ITable<CourseSummary>
                rowKey="id"
                showIndex={false}
                syncLocation={false}
                columns={columns}
                dataSource={rows}
                loading={scope === 'all' && catalogQuery.isFetching}
                pagination={{
                    total,
                    current,
                    pageSize,
                    showSizeChanger: true,
                    onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); },
                }}
                emptyText={scope === 'all' ? i18n.t('Không có môn học nào khớp từ khoá.') : i18n.t('Chưa có môn ngoài chương trình nào khớp bộ lọc.')}
            />
        </Card>
    );
};

export default CatalogView;
