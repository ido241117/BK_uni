import { useMemo } from 'react';
import { Alert, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link, useLocation, useNavigate } from 'react-router';
import { ITable } from '@/components';
import { listCourses } from '@/apis/course';
import { useApiQuery } from '@/hooks';
import { isPhysicalEducationCourse } from '../physical-education';
import {
    STUDENT_COURSE_STATUS,
    STUDENT_COURSE_STATUS_COLOR,
    STUDENT_COURSE_STATUS_LABEL,
    type Course,
    type StudentCourse,
} from '@/types';

const { Text } = Typography;

/** Tìm "PE1" rồi lọc theo tiền tố mã: tìm "PE" sẽ khớp cả tên môn chứa "pe" (Operating, Speech…). */
const PE_SEARCH = 'PE1';
const PE_TAKE = 100;

const partOf = (name: string): number | null => {
    const match = /học phần\s*(\d)/i.exec(name) ?? /thể chất\s*(\d)/i.exec(name);
    return match ? Number(match[1]) : null;
};

const PART_COLOR: Record<number, string> = { 1: 'cyan', 2: 'geekblue' };

interface PhysicalEducationCoursesProps {
    /** Trạng thái môn của sinh viên; `undefined` khi người xem không phải sinh viên. */
    statuses?: StudentCourse[];
}

/** Bảng các học phần thể chất có thể học để hoàn thành GDTC 1/2; bấm một dòng để mở trang môn đó. */
export const PhysicalEducationCourses = ({ statuses }: PhysicalEducationCoursesProps) => {
    const navigate = useNavigate();
    const location = useLocation();

    const coursesQuery = useApiQuery(
        ['courses', 'physical-education'],
        () => listCourses({ search: PE_SEARCH, take: PE_TAKE }),
    );

    const rows = useMemo(
        () => (coursesQuery.data?.items ?? [])
            .filter(course => isPhysicalEducationCourse(course.code))
            // Xếp theo tên để học phần 1 và 2 của cùng môn nằm cạnh nhau.
            .sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.code.localeCompare(b.code)),
        [coursesQuery.data],
    );

    const statusById = useMemo(
        () => new Map((statuses ?? []).map(item => [item.course_id, item.status])),
        [statuses],
    );
    const completedCount = rows.filter(course => statusById.get(course.id) === STUDENT_COURSE_STATUS.COMPLETED).length;

    // Giữ `from` của trang hiện tại để nút "Quay lại" ở trang môn thể thao trở về đây.
    const linkState = { from: `${location.pathname}${location.search}` };

    const columns: ColumnsType<Course> = [
        {
            title: 'Mã môn',
            dataIndex: 'code',
            width: 110,
            render: (code: string) => (
                <Link to={`/courses/${encodeURIComponent(code)}`} state={linkState} onClick={event => event.stopPropagation()}>
                    <Text strong>{code}</Text>
                </Link>
            ),
        },
        { title: 'Tên môn', dataIndex: 'name' },
        {
            title: 'Học phần',
            key: 'part',
            width: 110,
            render: (_value, course) => {
                const part = partOf(course.name);
                return part ? <Tag color={PART_COLOR[part]}>Học phần {part}</Tag> : <Text type="secondary">—</Text>;
            },
        },
        ...(statuses ? [{
            title: 'Trạng thái của tôi',
            key: 'status',
            width: 150,
            render: (_value: unknown, course: Course) => {
                const status = statusById.get(course.id);
                return status
                    ? <Tag color={STUDENT_COURSE_STATUS_COLOR[status]}>{STUDENT_COURSE_STATUS_LABEL[status]}</Tag>
                    : <Text type="secondary">—</Text>;
            },
        }] : []),
    ];

    return (
        <div className="stack">
            <Alert
                type="info"
                showIcon
                title="Học 2 học phần thể chất bất kỳ"
                description={(
                    <>
                        Ví dụ Bóng đá 1 + Bóng chuyền 1, hoặc Bóng đá 1 + Bóng đá 2. Học phần 2 của một môn chỉ học được khi đã đạt học phần 1
                        cùng môn. Hoàn thành 1 học phần thì PE1003 được tính là xong, 2 học phần thì PE1005 cũng xong.
                        {statuses && <> Bạn đã hoàn thành <Text strong>{completedCount}</Text> học phần thể chất.</>}
                    </>
                )}
            />
            <ITable<Course>
                rowKey="id"
                showIndex={false}
                syncLocation={false}
                columns={columns}
                dataSource={rows}
                loading={coursesQuery.isLoading}
                pagination={false}
                emptyText={coursesQuery.isError ? 'Không tải được danh sách môn thể chất.' : 'Chưa có môn thể chất nào trong danh mục.'}
                onRow={course => ({
                    onClick: () => navigate(`/courses/${encodeURIComponent(course.code)}`, { state: linkState }),
                    style: { cursor: 'pointer' },
                })}
            />
        </div>
    );
};

export default PhysicalEducationCourses;
