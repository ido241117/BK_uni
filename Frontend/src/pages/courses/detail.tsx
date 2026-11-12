import { Alert, Card, Descriptions, Space, Spin, Tabs, Tag, Typography } from 'antd';
import { useMemo } from 'react';
import { LuArrowLeft } from 'react-icons/lu';
import { Link, useLocation, useParams } from 'react-router';
import { IOutLinedBtn, PageHeader } from '@/components';
import { getCourseByCode, getOpenedSemesters } from '@/apis/course';
import { getCurriculum, listCourseRelations, listCurriculumCategories } from '@/apis/curriculum';
import { getCourseOutlineByCode } from '@/apis/outline';
import { getMyProfile, listMyCourses } from '@/apis/student';
import { useApiQuery, useCurrentRole } from '@/hooks';
import OpenedSemesterChart from './components/OpenedSemesterChart';
import { PhysicalEducationCourses } from './components/PhysicalEducationCourses';
import { isGenericPhysicalEducation } from './physical-education';
import { CourseOutlineSection, type CurriculumRelationView } from './components/outline/CourseOutlineSection';
import {
    ROLE,
    STUDENT_COURSE_STATUS_COLOR as STATUS_COLOR,
    STUDENT_COURSE_STATUS_LABEL,
} from '@/types';

const { Paragraph, Text } = Typography;

const CourseDetailPage = () => {
    const { code = '' } = useParams<{ code: string }>();
    const role = useCurrentRole();
    const isStudent = role === ROLE.STUDENT;
    // Trang mở từ chỗ khác (vd. tab Môn học của chương trình ở trang admin) truyền `state.from` để quay về đúng chỗ.
    const from = (useLocation().state as { from?: string } | null)?.from;
    const backTo = from ?? '/courses';
    const backLabel = from ? 'Quay lại' : 'Danh sách môn';

    const courseQuery = useApiQuery(['course', code], () => getCourseByCode(code), {
        enabled: Boolean(code),
        retry: false,
    });
    const course = courseQuery.data;

    // Đề cương nằm riêng khỏi danh mục môn: môn chưa có trong danh mục vẫn có thể có đề cương.
    const outlineQuery = useApiQuery(['course-outline-by-code', code.toUpperCase()], () => getCourseOutlineByCode(code), {
        enabled: Boolean(code),
    });
    const outline = outlineQuery.data ?? null;

    const semestersQuery = useApiQuery(
        ['course', course?.id, 'opened-semesters'],
        () => getOpenedSemesters(course!.id),
        { enabled: Boolean(course?.id) },
    );

    const myCoursesQuery = useApiQuery(
        ['student-courses'],
        listMyCourses,
        { enabled: isStudent },
    );

    // Nhóm học phần và điều kiện môn là dữ liệu theo chương trình của sinh viên, không nằm trên môn dùng chung.
    const profileQuery = useApiQuery(['my-profile'], getMyProfile, { enabled: isStudent });
    const curriculumId = profileQuery.data?.curriculum_id ?? undefined;
    const categoriesQuery = useApiQuery(
        ['curriculum-categories', curriculumId],
        () => listCurriculumCategories(curriculumId!),
        { enabled: isStudent && Boolean(curriculumId) },
    );
    const curriculumQuery = useApiQuery(['curriculum', curriculumId], () => getCurriculum(curriculumId!), {
        enabled: isStudent && Boolean(curriculumId),
    });
    const relationsQuery = useApiQuery(
        ['curriculum-relations', curriculumId, course?.id],
        () => listCourseRelations(curriculumId!, course!.id),
        { enabled: isStudent && Boolean(curriculumId) && Boolean(course?.id) },
    );

    const categoryNames = useMemo(() => {
        if (!course) return [];
        return (categoriesQuery.data ?? [])
            .filter(category => category.members.some(member => member.course_id === course.id))
            .map(category => category.name);
    }, [categoriesQuery.data, course]);

    const courseId = course?.id;
    const relations = relationsQuery.data;
    const curriculumRelations = useMemo<CurriculumRelationView[] | undefined>(() => {
        if (!isStudent || !curriculumId || !relations) return undefined;
        return relations
            .filter(relation => relation.course_id === courseId)
            .map(relation => ({ related_course_code: relation.related_course_code.toUpperCase(), type: relation.type }));
    }, [isStudent, curriculumId, relations, courseId]);

    const currentStatus = myCoursesQuery.data?.find(item => item.course_id === course?.id);

    if (courseQuery.isLoading || outlineQuery.isLoading) {
        return <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}><Spin size="large" /></div>;
    }

    if (!course && !outline) {
        return (
            <Alert
                type="error"
                showIcon
                title="Không tìm thấy môn học"
                description={`Không có môn học hay đề cương nào với mã "${code}".`}
                action={<Link to={backTo}><IOutLinedBtn>{from ? 'Quay lại' : 'Về danh sách'}</IOutLinedBtn></Link>}
            />
        );
    }

    const semesters = semestersQuery.data ?? [];
    const openedSemesters = semestersQuery.isLoading
        ? <Spin />
        : semesters.length === 0
            ? <Paragraph type="secondary">Môn học chưa được mở ở học kỳ nào.</Paragraph>
            : <OpenedSemesterChart semesterCodes={semesters.map(semester => semester.semester_code)} />;
    const displayCode = course?.code ?? outline!.course_code;
    const displayName = course?.name ?? outline?.selected?.name_vi ?? outline?.versions.at(-1)?.name_vi ?? '';
    const credits = course?.credits ?? outline?.selected?.credits ?? outline?.versions.at(-1)?.credits;
    const noOutline = (
        <Paragraph type="secondary" style={{ margin: 0 }}>
            {outlineQuery.isError ? 'Không tải được đề cương.' : 'Môn học này chưa có đề cương trong hệ thống.'}
        </Paragraph>
    );
    // GDTC 1/2 (PE1003/PE1005) là mã chung: thêm tab liệt kê các học phần thể chất thực tế được học.
    const peTabs = isGenericPhysicalEducation(displayCode)
        ? [{
            key: 'physical-education',
            label: 'Các môn thể chất',
            children: <PhysicalEducationCourses statuses={isStudent ? myCoursesQuery.data ?? [] : undefined} />,
        }]
        : [];

    return (
        <section>
            <PageHeader
                title={`${displayCode} · ${displayName}`}
                subtitle={outline ? 'Thông tin môn học, đề cương và các học kỳ đã mở.' : 'Thông tin môn học và các học kỳ đã mở.'}
                extra={<Link to={backTo}><IOutLinedBtn icon={<LuArrowLeft />}>{backLabel}</IOutLinedBtn></Link>}
            />

            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                {!course && (
                    <Alert type="info" showIcon title="Môn chưa có trong danh mục môn học của hệ thống" description="Chỉ có đề cương nhập từ myBK; chưa xếp được vào chương trình hay khai trạng thái." />
                )}
                <Card>
                    <Descriptions column={{ xs: 1, sm: 2 }} size="middle">
                        <Descriptions.Item label="Mã môn"><Text strong>{displayCode}</Text></Descriptions.Item>
                        <Descriptions.Item label="Số tín chỉ">{credits !== undefined && credits !== null ? <Tag>{credits} TC</Tag> : '—'}</Descriptions.Item>
                        <Descriptions.Item label="Tên môn" span={2}>{displayName}</Descriptions.Item>
                        {isStudent && course && (
                            <Descriptions.Item label="Nhóm học phần" span={2}>
                                {categoryNames.length
                                    ? (
                                        <Space wrap size={[4, 4]}>
                                            {categoryNames.map(name => <Tag key={name}>{name}</Tag>)}
                                        </Space>
                                    )
                                    : <Text type="secondary">Chưa xếp nhóm</Text>}
                            </Descriptions.Item>
                        )}
                        {course?.description && (
                            <Descriptions.Item label="Mô tả">{course.description}</Descriptions.Item>
                        )}
                        {isStudent && course && (
                            <Descriptions.Item label="Trạng thái học tập của tôi" span={2}>
                                {currentStatus
                                    ? (
                                        <Space size={8} wrap>
                                            <Tag color={STATUS_COLOR[currentStatus.status]}>
                                                {STUDENT_COURSE_STATUS_LABEL[currentStatus.status]}
                                            </Tag>
                                            <Text type="secondary">Chỉnh sửa nhanh ở danh sách môn học.</Text>
                                        </Space>
                                    )
                                    : <Text type="secondary">Chưa khai báo — chọn trạng thái ở danh sách môn học.</Text>}
                            </Descriptions.Item>
                        )}
                        {course && (
                            <Descriptions.Item label="Cập nhật lần cuối" span={2}>
                                {new Date(course.updated_at).toLocaleString('vi-VN')}
                            </Descriptions.Item>
                        )}
                    </Descriptions>
                </Card>

                {outline && (
                    <CourseOutlineSection
                        key={outline.course_code}
                        data={outline}
                        curriculumRelations={curriculumRelations}
                        curriculumCode={curriculumQuery.data?.code}
                        openedSemesters={course ? openedSemesters : undefined}
                        extraTabs={peTabs}
                    />
                )}

                {/* Không có đề cương nhưng là GDTC 1/2: gom đề cương trống, học kỳ đã mở và các môn thể chất vào một khung tab. */}
                {!outline && peTabs.length > 0 && (
                    <Card>
                        <Tabs
                            items={[
                                ...peTabs,
                                { key: 'outline', label: 'Đề cương', children: noOutline },
                                ...(course ? [{ key: 'opened', label: 'Học kỳ đã mở', children: openedSemesters }] : []),
                            ]}
                        />
                    </Card>
                )}

                {!outline && peTabs.length === 0 && <Card title="Đề cương môn học">{noOutline}</Card>}

                {/* Có đề cương thì "Học kỳ đã mở" là một tab trong khung đề cương; không có thì giữ thẻ riêng. */}
                {course && !outline && peTabs.length === 0 && <Card title="Học kỳ đã mở">{openedSemesters}</Card>}
            </Space>
        </section>
    );
};

export default CourseDetailPage;
