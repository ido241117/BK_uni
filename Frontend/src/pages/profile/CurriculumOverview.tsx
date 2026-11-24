import { useMemo, useState } from 'react';
import { Alert, Descriptions, Empty, Segmented, Skeleton, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    getCurriculum,
    listCourseGroups,
    listCurriculumCourses,
    listRegulations,
    listSpecializations,
} from '@/apis/curriculum';
import { useApiQuery } from '@/hooks';
import {
    COURSE_GROUP_KIND,
    COURSE_GROUP_KIND_LABEL,
    COURSE_GROUP_SCOPE,
    CURRICULUM_PROFILE_FIELD_LABEL,
    CURRICULUM_PROFILE_FIELDS,
    type CourseGroup,
    type CourseSummary,
    type Curriculum,
    type CurriculumCourse,
    type CurriculumProfileText,
    type CurriculumRegulation,
    type CurriculumSpecialization,
} from '@/types';
import { describeGroupRequirement, groupRequiredCredits, summarizeCurriculumCredits } from '@/utils/curriculum-credits';

const { Paragraph, Text, Title } = Typography;

type Lang = 'vi' | 'en';

const termLabel = (term: number) => (term === 3 ? 'Học kỳ hè' : `Học kỳ ${term}`);

const groupRequirement = describeGroupRequirement;

const courseColumns: ColumnsType<CourseSummary> = [
    { title: 'Mã môn', dataIndex: 'code', width: 110, render: (code: string) => <Text strong>{code}</Text> },
    { title: 'Tên môn', dataIndex: 'name' },
    { title: 'TC', dataIndex: 'credits', width: 60, align: 'right' },
];

const CourseTable = ({ courses }: { courses: CourseSummary[] }) => (
    <Table<CourseSummary>
        rowKey="id"
        size="small"
        pagination={false}
        columns={courseColumns}
        dataSource={courses}
        className="table-wrap-text"
    />
);

/** Văn bản thuần từ myBK: đoạn cách bằng dòng trống, mục danh sách bắt đầu bằng "- ". */
const ProfileText = ({ text }: { text: string }) => (
    <>
        {text.split(/\n{2,}/).map((block, index) => {
            const lines = block.split('\n').filter(Boolean);
            if (lines.length && lines.every(line => line.startsWith('- '))) {
                return (
                    <ul key={index} style={{ margin: '0 0 12px', paddingLeft: 20 }}>
                        {lines.map((line, item) => <li key={item}>{line.slice(2)}</li>)}
                    </ul>
                );
            }
            return (
                <Paragraph key={index} style={{ marginBottom: 12, whiteSpace: 'pre-line' }}>
                    {block}
                </Paragraph>
            );
        })}
    </>
);

const hasText = (text?: CurriculumProfileText) => CURRICULUM_PROFILE_FIELDS.some(field => text?.[field]);

const ProfileTab = ({ curriculum }: { curriculum: Curriculum }) => {
    const profile = curriculum.profile;
    const languages = (['vi', 'en'] as const).filter(lang => hasText(profile?.[lang]));
    const [chosen, setChosen] = useState<Lang>('vi');
    const lang = languages.includes(chosen) ? chosen : languages[0];

    if (!lang) {
        return <Empty description="Chương trình này chưa có phần giới thiệu trên myBK." />;
    }
    const text = profile?.[lang] ?? {};
    const borrowed = curriculum.profile_source_code && curriculum.profile_source_code !== curriculum.source_code;

    return (
        <div className="stack">
            {languages.length > 1 && (
                <Segmented<Lang>
                    value={lang}
                    onChange={setChosen}
                    options={[{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }]}
                    style={{ alignSelf: 'flex-start' }}
                />
            )}
            {borrowed && (
                <Alert
                    type="info"
                    showIcon
                    title={`myBK chưa có giới thiệu riêng cho khóa ${curriculum.cohort}; nội dung lấy từ chương trình ${curriculum.profile_source_code} cùng ngành.`}
                />
            )}
            {CURRICULUM_PROFILE_FIELDS.filter(field => text[field]).map(field => (
                <div key={field}>
                    <Title level={5} style={{ marginTop: 0 }}>{CURRICULUM_PROFILE_FIELD_LABEL[field][lang]}</Title>
                    <ProfileText text={text[field]!} />
                </div>
            ))}
        </div>
    );
};

interface SemesterBlock {
    year: number;
    term: number;
    courses: CourseSummary[];
    groups: CourseGroup[];
}

const PlanTab = ({ courses, groups }: { courses: CurriculumCourse[]; groups: CourseGroup[] }) => {
    const { semesters, unscheduled } = useMemo(() => {
        const blocks = new Map<string, SemesterBlock>();
        const block = (year: number, term: number) => {
            const key = `${year}-${term}`;
            if (!blocks.has(key)) blocks.set(key, { year, term, courses: [], groups: [] });
            return blocks.get(key)!;
        };
        for (const item of courses) {
            if (item.recommended_year !== null && item.recommended_term !== null) {
                block(item.recommended_year, item.recommended_term).courses.push(item.course);
            }
        }
        for (const group of groups) {
            if (group.specialization_id === null && group.recommended_year !== null && group.recommended_term !== null) {
                block(group.recommended_year, group.recommended_term).groups.push(group);
            }
        }
        const sorted = [...blocks.values()].sort((a, b) => a.year - b.year || a.term - b.term);
        sorted.forEach(item => item.courses.sort((a, b) => a.code.localeCompare(b.code)));
        return {
            semesters: sorted,
            unscheduled: courses.filter(item => item.recommended_year === null).length,
        };
    }, [courses, groups]);

    if (!semesters.length) return <Empty description="Chương trình chưa có kế hoạch giảng dạy theo học kỳ." />;

    return (
        <div className="stack">
            <Paragraph type="secondary" style={{ margin: 0 }}>
                Môn bắt buộc xếp theo kỳ gợi ý của kế hoạch giảng dạy; khối tự chọn hiện ở kỳ nên bắt đầu học.
                {unscheduled > 0 && ` ${unscheduled} môn tự chọn không gắn kỳ cố định (xem tab Khối kiến thức).`}
            </Paragraph>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))', gap: 16 }}>
                {semesters.map(semester => {
                    const credits = semester.courses.reduce((total, course) => total + course.credits, 0)
                        + semester.groups.reduce((total, group) => total + groupRequiredCredits(group), 0);
                    return (
                        <div key={`${semester.year}-${semester.term}`}>
                            <Text strong>{`Năm ${semester.year} · ${termLabel(semester.term)}`}</Text>
                            <Text type="secondary">{` — ${credits} TC`}</Text>
                            <div style={{ marginTop: 8 }}>
                                <CourseTable courses={semester.courses} />
                                {semester.groups.map(group => (
                                    <div key={group.id} style={{ padding: '6px 8px', fontSize: 13 }}>
                                        <Tag color="blue">Tự chọn</Tag>
                                        {group.name} <Text type="secondary">({groupRequirement(group)})</Text>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const groupColumns: ColumnsType<CourseGroup> = [
    { title: 'Khối', dataIndex: 'name' },
    {
        title: 'Loại',
        dataIndex: 'kind',
        width: 100,
        render: (kind: CourseGroup['kind']) => (
            <Tag color={kind === COURSE_GROUP_KIND.REQUIRED ? 'green' : 'blue'}>{COURSE_GROUP_KIND_LABEL[kind]}</Tag>
        ),
    },
    { title: 'Yêu cầu', key: 'requirement', width: 180, render: (_, group) => groupRequirement(group) },
    {
        title: 'Số môn',
        key: 'members',
        width: 80,
        align: 'right',
        render: (_, group) => (group.pool_scope === COURSE_GROUP_SCOPE.ANY ? '—' : group.members.length),
    },
    {
        title: 'Kỳ gợi ý',
        key: 'semester',
        width: 150,
        render: (_, group) => (group.recommended_year !== null && group.recommended_term !== null
            ? `Năm ${group.recommended_year} · ${termLabel(group.recommended_term)}`
            : '—'),
    },
];

const GroupsTab = ({ groups }: { groups: CourseGroup[] }) => {
    const roots = groups.filter(group => group.specialization_id === null);
    if (!roots.length) return <Empty description="Chương trình không có khối tự chọn." />;
    return (
        <Table<CourseGroup>
            rowKey="id"
            size="small"
            pagination={false}
            columns={groupColumns}
            dataSource={roots}
            className="table-wrap-text"
            scroll={{ x: 640 }}
            expandable={{
                rowExpandable: group => group.members.length > 0,
                expandedRowRender: group => (
                    <CourseTable courses={group.members.map(member => member.course).sort((a, b) => a.code.localeCompare(b.code))} />
                ),
            }}
        />
    );
};

const SpecializationsTab = ({
    specializations,
    required,
}: {
    specializations: CurriculumSpecialization[];
    required: boolean;
}) => {
    if (!specializations.length) return <Empty description="Chương trình không chia chuyên ngành." />;
    return (
        <div className="stack">
            <Paragraph type="secondary" style={{ margin: 0 }}>
                {required
                    ? 'Sinh viên phải đạt đúng một chuyên ngành mới đủ điều kiện tốt nghiệp.'
                    : 'Chuyên ngành không bắt buộc; không đạt chuyên ngành nào thì tốt nghiệp theo ngành.'}
            </Paragraph>
            {specializations.map(specialization => (
                <div key={specialization.id}>
                    <Text strong>{specialization.name}</Text> <Tag>{specialization.code}</Tag>
                    {specialization.description && (
                        <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>{specialization.description}</Paragraph>
                    )}
                    {specialization.groups.map(group => (
                        <div key={group.id} style={{ marginTop: 8 }}>
                            <Text>{group.name}</Text> <Text type="secondary">({groupRequirement(group)})</Text>
                            {group.members.length > 0 && (
                                <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {group.members.map(member => (
                                        <Tag key={member.id} title={`${member.course.name} · ${member.course.credits} TC`}>
                                            {member.course.code} {member.course.name}
                                        </Tag>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
};

const RegulationsTab = ({ regulations }: { regulations: CurriculumRegulation[] }) => {
    if (!regulations.length) return <Empty description="Chương trình chưa có quy định riêng." />;
    return (
        <div className="stack">
            {regulations.map(regulation => (
                <div key={regulation.id}>
                    <Text strong>{regulation.name}</Text>
                    {regulation.detail && (
                        <Paragraph style={{ margin: '4px 0 0', whiteSpace: 'pre-line' }}>{regulation.detail}</Paragraph>
                    )}
                </div>
            ))}
        </div>
    );
};

/** Toàn bộ dữ liệu chương trình đào tạo sinh viên đang theo học (card ở trang Hồ sơ). */
const CurriculumOverview = ({ curriculumId }: { curriculumId: string }) => {
    // Dùng chung cache với trang Môn học & kế hoạch / Phân tích học tập.
    const curriculumQuery = useApiQuery(['curriculum', curriculumId], () => getCurriculum(curriculumId));
    const coursesQuery = useApiQuery(['curriculum-courses', curriculumId], () => listCurriculumCourses(curriculumId));
    const groupsQuery = useApiQuery(['curriculum-groups', curriculumId], () => listCourseGroups(curriculumId));
    const specializationsQuery = useApiQuery(
        ['curriculum-specializations', curriculumId],
        () => listSpecializations(curriculumId),
    );
    const regulationsQuery = useApiQuery(['curriculum', curriculumId, 'regulations'], () => listRegulations(curriculumId));

    const curriculum = curriculumQuery.data;
    const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
    const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
    const specializations = specializationsQuery.data ?? [];
    const regulations = regulationsQuery.data ?? [];
    const credits = useMemo(() => summarizeCurriculumCredits(courses, groups), [courses, groups]);

    if (curriculumQuery.isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;
    if (curriculumQuery.isError || !curriculum) {
        return <Alert type="error" showIcon title="Không tải được chương trình đào tạo" description="Vui lòng tải lại trang để thử lại." />;
    }

    const loadingContent = coursesQuery.isLoading || groupsQuery.isLoading;
    const scheduled = courses.filter(item => item.recommended_year !== null).length;
    const electiveGroups = groups.filter(group => group.specialization_id === null && group.kind === COURSE_GROUP_KIND.ELECTIVE).length;

    return (
        <div className="stack">
            <div>
                <Title level={4} style={{ margin: 0 }}>{curriculum.name}</Title>
                {curriculum.name_en && <Text type="secondary">{curriculum.name_en}</Text>}
            </div>

            <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small" bordered>
                <Descriptions.Item label="Mã chương trình"><Text strong>{curriculum.code}</Text></Descriptions.Item>
                <Descriptions.Item label="Ngành">{curriculum.major}</Descriptions.Item>
                <Descriptions.Item label="Khoa">{curriculum.faculty}</Descriptions.Item>
                <Descriptions.Item label="Khóa">{curriculum.cohort}</Descriptions.Item>
                <Descriptions.Item label="Thời gian đào tạo">{`${curriculum.duration_years} năm`}</Descriptions.Item>
                <Descriptions.Item label="Tổng tín chỉ tốt nghiệp">
                    {curriculum.total_credits !== null
                        ? `${curriculum.total_credits} TC`
                        : loadingContent ? '…' : `${credits.totalCredits} TC (tính từ các khối)`}
                </Descriptions.Item>
                <Descriptions.Item label="Tín chỉ mỗi học kỳ">
                    {`${curriculum.min_semester_credits} – ${curriculum.max_semester_credits} TC`}
                </Descriptions.Item>
                <Descriptions.Item label="Chuyên ngành">
                    {specializations.length
                        ? `${specializations.length} chuyên ngành${curriculum.specialization_required ? ' · bắt buộc chọn 1' : ' · không bắt buộc'}`
                        : 'Không chia chuyên ngành'}
                </Descriptions.Item>
                <Descriptions.Item label="Cấu trúc">
                    {loadingContent
                        ? '…'
                        : `${courses.length} môn · ${scheduled} môn xếp kỳ · ${electiveGroups} khối tự chọn · ${regulations.length} quy định`}
                </Descriptions.Item>
                {curriculum.source_code && (
                    <Descriptions.Item label="Nguồn">
                        {`${curriculum.source_system === 'mybk' ? 'myBK' : curriculum.source_system ?? ''} · ${curriculum.source_version ?? curriculum.source_code}`}
                    </Descriptions.Item>
                )}
                {curriculum.source_synced_at && (
                    <Descriptions.Item label="myBK cập nhật">
                        {new Date(curriculum.source_synced_at).toLocaleDateString('vi-VN')}
                    </Descriptions.Item>
                )}
            </Descriptions>

            <Tabs
                defaultActiveKey="profile"
                items={[
                    { key: 'profile', label: 'Giới thiệu', children: <ProfileTab curriculum={curriculum} /> },
                    {
                        key: 'plan',
                        label: 'Kế hoạch giảng dạy',
                        children: loadingContent ? <Skeleton active /> : <PlanTab courses={courses} groups={groups} />,
                    },
                    {
                        key: 'groups',
                        label: `Khối kiến thức (${groups.filter(group => group.specialization_id === null).length})`,
                        children: groupsQuery.isLoading ? <Skeleton active /> : <GroupsTab groups={groups} />,
                    },
                    {
                        key: 'specializations',
                        label: `Chuyên ngành (${specializations.length})`,
                        children: specializationsQuery.isLoading
                            ? <Skeleton active />
                            : <SpecializationsTab specializations={specializations} required={curriculum.specialization_required} />,
                    },
                    {
                        key: 'regulations',
                        label: `Quy định (${regulations.length})`,
                        children: regulationsQuery.isLoading ? <Skeleton active /> : <RegulationsTab regulations={regulations} />,
                    },
                ]}
            />
        </div>
    );
};

export default CurriculumOverview;
