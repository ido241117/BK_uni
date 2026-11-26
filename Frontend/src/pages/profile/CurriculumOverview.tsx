import { useMemo, useState } from 'react';
import { Alert, Empty, Segmented, Skeleton, Table, Tabs, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    getCurriculum,
    listCourseGroups,
    listCurriculumCourses,
    listRegulations,
    listSpecializations,
} from '@/apis/curriculum';
import { RowItem, RowList, StatusLine, ToneChip } from '@/components';
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
import i18n from '@/i18n';
import { trLive } from '@/i18n/live';

const { Paragraph, Text, Title } = Typography;

type Lang = 'vi' | 'en';

const termLabel = (term: number) => (term === 3 ? i18n.t('Học kỳ hè') : i18n.t('Học kỳ {{term}}', { term: term }));

const groupRequirement = describeGroupRequirement;

const courseColumns: ColumnsType<CourseSummary> = trLive([
    { title: 'Mã môn', dataIndex: 'code', width: 110, render: (code: string) => <Text strong>{code}</Text> },
    { title: 'Tên môn', dataIndex: 'name' },
    { title: 'TC', dataIndex: 'credits', width: 60, align: 'right' },
]);

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
    <div className="doc-body">
        {text.split(/\n{2,}/).map((block, index) => {
            const lines = block.split('\n').filter(Boolean);
            if (lines.length && lines.every(line => line.startsWith('- '))) {
                return (
                    <ul key={index}>
                        {lines.map((line, item) => <li key={item}>{line.slice(2)}</li>)}
                    </ul>
                );
            }
            return <p key={index}>{block}</p>;
        })}
    </div>
);

/** Danh sách môn gọn (mã · tên · TC) trong nhóm chuyên ngành; thay cho Tag (skin chung vẽ Tag thành chấm + chữ). */
const CourseList = ({ courses }: { courses: CourseSummary[] }) => (
    <div className="course-list">
        {courses.map(course => (
            <div key={course.id} className="course-list-item">
                <span className="course-list-code">{course.code}</span>
                <span className="course-list-name">{course.name}</span>
                <span className="course-list-credits">{course.credits}{' '}{i18n.t('TC')}</span>
            </div>
        ))}
    </div>
);

const hasText = (text?: CurriculumProfileText) => CURRICULUM_PROFILE_FIELDS.some(field => text?.[field]);

const ProfileTab = ({ curriculum }: { curriculum: Curriculum }) => {
    const profile = curriculum.profile;
    const languages = (['vi', 'en'] as const).filter(lang => hasText(profile?.[lang]));
    const [chosen, setChosen] = useState<Lang>('vi');
    const lang = languages.includes(chosen) ? chosen : languages[0];

    if (!lang) {
        return <Empty description={i18n.t('Chương trình này chưa có phần giới thiệu trên myBK.')} />;
    }
    const text = profile?.[lang] ?? {};
    const borrowed = curriculum.profile_source_code && curriculum.profile_source_code !== curriculum.source_code;

    return (
        <div className="stack">
            {languages.length > 1 && (
                <Segmented<Lang>
                    value={lang}
                    onChange={setChosen}
                    options={[{ value: 'vi', label: i18n.t('Tiếng Việt') }, { value: 'en', label: 'English' }]}
                    style={{ alignSelf: 'flex-start' }}
                />
            )}
            {borrowed && (
                <StatusLine tone="info">
                    {i18n.t('myBK chưa có giới thiệu riêng cho khóa {{cohort}}; nội dung lấy từ chương trình {{profile_source_code}} cùng ngành.', { cohort: curriculum.cohort, profile_source_code: curriculum.profile_source_code })}
                </StatusLine>
            )}
            <div className="doc-sections">
                {CURRICULUM_PROFILE_FIELDS.filter(field => text[field]).map(field => (
                    <section key={field} className="doc-section">
                        <h3 className="doc-section-title">{CURRICULUM_PROFILE_FIELD_LABEL[field][lang]}</h3>
                        <ProfileText text={text[field]!} />
                    </section>
                ))}
            </div>
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

    if (!semesters.length) return <Empty description={i18n.t('Chương trình chưa có kế hoạch giảng dạy theo học kỳ.')} />;

    return (
        <div className="stack">
            <Paragraph type="secondary" style={{ margin: 0 }}>
                {i18n.t('Môn bắt buộc xếp theo kỳ gợi ý của kế hoạch giảng dạy; khối tự chọn hiện ở kỳ nên bắt đầu học.')}
                {unscheduled > 0 && i18n.t(' {{unscheduled}} môn tự chọn không gắn kỳ cố định (xem tab Khối kiến thức).', { unscheduled: unscheduled })}
            </Paragraph>
            <div className="plan-semesters">
                {semesters.map(semester => {
                    const credits = semester.courses.reduce((total, course) => total + course.credits, 0)
                        + semester.groups.reduce((total, group) => total + groupRequiredCredits(group), 0);
                    return (
                        <section key={`${semester.year}-${semester.term}`}>
                            <div className="plan-semester-head">
                                <h3 className="plan-semester-title">{i18n.t('Năm {{year}} · {{v1}}', { year: semester.year, v1: termLabel(semester.term) })}</h3>
                                <span className="plan-semester-credits">{i18n.t('{{credits}} TC', { credits: credits })}</span>
                            </div>
                            {semester.courses.length > 0 && <CourseTable courses={semester.courses} />}
                            {semester.groups.map(group => (
                                <div key={group.id} className="plan-elective">
                                    <ToneChip tone="brand">{i18n.t('Tự chọn')}</ToneChip>
                                    <span className="plan-elective-name">{group.name}</span>
                                    <span className="plan-elective-req">{groupRequirement(group)}</span>
                                </div>
                            ))}
                        </section>
                    );
                })}
            </div>
        </div>
    );
};

const groupColumns: ColumnsType<CourseGroup> = trLive([
    { title: 'Khối', dataIndex: 'name' },
    {
        title: 'Loại',
        dataIndex: 'kind',
        width: 100,
        // Cùng màu với bảng Chương trình: xanh lá = khối bắt buộc, xanh dương = khối tự chọn.
        render: (kind: CourseGroup['kind']) => (
            <ToneChip tone={kind === COURSE_GROUP_KIND.REQUIRED ? 'good' : 'brand'}>{COURSE_GROUP_KIND_LABEL[kind]}</ToneChip>
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
]);

const GroupsTab = ({ groups }: { groups: CourseGroup[] }) => {
    const roots = groups.filter(group => group.specialization_id === null);
    if (!roots.length) return <Empty description={i18n.t('Chương trình không có khối tự chọn.')} />;
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
    if (!specializations.length) return <Empty description={i18n.t('Chương trình không chia chuyên ngành.')} />;
    return (
        <div className="stack">
            <Paragraph type="secondary" style={{ margin: 0 }}>
                {required
                    ? i18n.t('Sinh viên phải đạt đúng một chuyên ngành mới đủ điều kiện tốt nghiệp.')
                    : i18n.t('Chuyên ngành không bắt buộc; không đạt chuyên ngành nào thì tốt nghiệp theo ngành.')}
            </Paragraph>
            <div className="doc-sections">
                {specializations.map(specialization => (
                    <section key={specialization.id} className="doc-section">
                        <div className="doc-section-head">
                            <h3 className="doc-section-title">{specialization.name}</h3>
                            <ToneChip tone="muted">{specialization.code}</ToneChip>
                        </div>
                        {specialization.description && <p className="doc-body doc-body-muted" style={{ margin: 0 }}>{specialization.description}</p>}
                        {specialization.groups.length > 0 && (
                            <div className="spec-groups">
                                {specialization.groups.map(group => (
                                    <div key={group.id} className="spec-group">
                                        <div className="spec-group-head">
                                            <span className="spec-group-title">{group.name}</span>
                                            <ToneChip tone={group.kind === COURSE_GROUP_KIND.REQUIRED ? 'good' : 'brand'}>{groupRequirement(group)}</ToneChip>
                                        </div>
                                        {group.members.length > 0 && (
                                            <CourseList courses={group.members.map(member => member.course).sort((a, b) => a.code.localeCompare(b.code))} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                ))}
            </div>
        </div>
    );
};

const RegulationsTab = ({ regulations }: { regulations: CurriculumRegulation[] }) => {
    if (!regulations.length) return <Empty description={i18n.t('Chương trình chưa có quy định riêng.')} />;
    return (
        <div className="doc-sections">
            {regulations.map((regulation, index) => (
                <section key={regulation.id} className="doc-section">
                    <div className="doc-section-head">
                        <span className="reg-index">{index + 1}.</span>
                        <h3 className="doc-section-title">{regulation.name}</h3>
                    </div>
                    {regulation.detail
                        ? <div className="doc-body"><p>{regulation.detail}</p></div>
                        : <span className="hint">{i18n.t('Chưa có mô tả chi tiết')}</span>}
                </section>
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
        return <Alert type="error" showIcon title={i18n.t('Không tải được chương trình đào tạo')} description={i18n.t('Vui lòng tải lại trang để thử lại.')} />;
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

            <RowList wrap>
                <RowItem label={i18n.t('Mã chương trình')} chip value={curriculum.code} />
                <RowItem label={i18n.t('Ngành')} value={curriculum.major} />
                <RowItem label={i18n.t('Khoa')} value={curriculum.faculty} />
                <RowItem label={i18n.t('Khóa')} value={curriculum.cohort} />
                <RowItem label={i18n.t('Thời gian đào tạo')} value={i18n.t('{{duration_years}} năm', { duration_years: curriculum.duration_years })} />
                <RowItem label={i18n.t('Tổng tín chỉ tốt nghiệp')} value={curriculum.total_credits !== null
                        ? i18n.t('{{total_credits}} TC', { total_credits: curriculum.total_credits })
                        : loadingContent ? '…' : i18n.t('{{totalCredits}} TC (tính từ các khối)', { totalCredits: credits.totalCredits })} />
                <RowItem label={i18n.t('Tín chỉ mỗi học kỳ')} value={i18n.t('{{min_semester_credits}} – {{max_semester_credits}} TC', { min_semester_credits: curriculum.min_semester_credits, max_semester_credits: curriculum.max_semester_credits })} />
                <RowItem label={i18n.t('Chuyên ngành')} value={specializations.length
                        ? i18n.t('{{length}} chuyên ngành{{v1}}', { length: specializations.length, v1: curriculum.specialization_required ? ' · bắt buộc chọn 1' : ' · không bắt buộc' })
                        : i18n.t('Không chia chuyên ngành')} />
                <RowItem label={i18n.t('Cấu trúc')} value={loadingContent
                        ? '…'
                        : i18n.t('{{length}} môn · {{scheduled}} môn xếp kỳ · {{electiveGroups}} khối tự chọn · {{length2}} quy định', { length: courses.length, scheduled: scheduled, electiveGroups: electiveGroups, length2: regulations.length })} />
                {curriculum.source_code && (
                    <RowItem label={i18n.t('Nguồn')} value={`${curriculum.source_system === 'mybk' ? 'myBK' : curriculum.source_system ?? ''} · ${curriculum.source_version ?? curriculum.source_code}`} />
                )}
                {curriculum.source_synced_at && (
                    <RowItem label={i18n.t('myBK cập nhật')} value={new Date(curriculum.source_synced_at).toLocaleDateString('vi-VN')} />
                )}
            </RowList>

            <Tabs
                defaultActiveKey="profile"
                items={[
                    { key: 'profile', label: i18n.t('Giới thiệu'), children: <ProfileTab curriculum={curriculum} /> },
                    {
                        key: 'plan',
                        label: i18n.t('Kế hoạch giảng dạy'),
                        children: loadingContent ? <Skeleton active /> : <PlanTab courses={courses} groups={groups} />,
                    },
                    {
                        key: 'groups',
                        label: i18n.t('Khối kiến thức ({{length}})', { length: groups.filter(group => group.specialization_id === null).length }),
                        children: groupsQuery.isLoading ? <Skeleton active /> : <GroupsTab groups={groups} />,
                    },
                    {
                        key: 'specializations',
                        label: i18n.t('Chuyên ngành ({{length}})', { length: specializations.length }),
                        children: specializationsQuery.isLoading
                            ? <Skeleton active />
                            : <SpecializationsTab specializations={specializations} required={curriculum.specialization_required} />,
                    },
                    {
                        key: 'regulations',
                        label: i18n.t('Quy định ({{length}})', { length: regulations.length }),
                        children: regulationsQuery.isLoading ? <Skeleton active /> : <RegulationsTab regulations={regulations} />,
                    },
                ]}
            />
        </div>
    );
};

export default CurriculumOverview;
