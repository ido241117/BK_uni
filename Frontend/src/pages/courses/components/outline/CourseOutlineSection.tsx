import { useMemo, useState, type ReactNode } from 'react';
import { Alert, Card, Descriptions, Empty, Segmented, Select, Space, Spin, Tabs, Tag, Tooltip, Typography, type TabsProps } from 'antd';
import { LuCircleAlert, LuCircleCheck } from 'react-icons/lu';
import { Link } from 'react-router';
import { getCourseOutline } from '@/apis/outline';
import { RELATION_TONE, ToneChip } from '@/components';
import { useApiQuery } from '@/hooks';
import {
    COURSE_RELATION_TYPE_LABEL,
    type CourseOutlineByCode,
    type CourseOutlineDetail,
    type CourseRelationType,
    type OutlineComponents,
    type OutlineContent,
    type OutlineExam,
} from '@/types';
import { currentSemester } from '@/utils/semester';
import { CategoryStackBar, DonutChart } from '../charts';
import {
    COMPONENT_LABEL,
    COMPONENT_ORDER,
    FRAMEWORK_LABEL,
    KNOWLEDGE_BLOCK_LABEL,
    pickText,
    type OutlineLang,
} from './outline-labels';
import i18n from '@/i18n';

const { Text, Title } = Typography;

/** Điều kiện của môn này theo chương trình đào tạo của sinh viên (để đặt cạnh điều kiện trong đề cương). */
export interface CurriculumRelationView {
    related_course_code: string;
    type: CourseRelationType;
}

interface CourseOutlineSectionProps {
    data: CourseOutlineByCode;
    /** `undefined`: không xét chương trình (không phải sinh viên hoặc chưa chọn chương trình). */
    curriculumRelations?: CurriculumRelationView[];
    curriculumCode?: string;
    /** Nội dung tab "Học kỳ đã mở" (lấy từ dữ liệu mở lớp của hệ thống); bỏ trống thì không có tab. */
    openedSemesters?: ReactNode;
    /** Tab thêm vào đầu dãy tab (ví dụ "Các môn thể chất" ở PE1003/PE1005). */
    extraTabs?: NonNullable<TabsProps['items']>;
}

const courseLink = (code: string) => <Link to={`/courses/${encodeURIComponent(code)}`}><Text strong>{code}</Text></Link>;

// Mã chuẩn đầu ra = ToneChip hồng, mã hoạt động đánh giá = ToneChip hổ phách (không dùng `Tag`: skin chung vẽ Tag
// thành chấm tròn + chữ, các loại mã trông giống hệt nhau).

const TextBlock = ({ title, text }: { title: string; text: string | null }) => (text ? (
    <div className="outline-block">
        <Title level={5} className="outline-block-title">{title}</Title>
        <div className="outline-text">{text}</div>
    </div>
) : null);

const componentRows = (components: OutlineComponents) => COMPONENT_ORDER
    .filter(key => (components[key] ?? 0) > 0)
    .map(key => ({ key, label: COMPONENT_LABEL[key], value: components[key]! }));

const examText = (exam: OutlineExam | null, lang: OutlineLang) => {
    if (!exam) return null;
    const format = pickText(exam.format?.name, lang) ?? exam.format?.code;
    return [format, exam.duration_minutes ? i18n.t('{{duration_minutes}} phút', { duration_minutes: exam.duration_minutes }) : null].filter(Boolean).join(' · ') || null;
};

/* ------------------------------------ Tab: khối lượng & đánh giá ------------------------------------ */

const WorkloadTab = ({ content, lang }: { content: OutlineContent; lang: OutlineLang }) => {
    const weights = componentRows(content.assessment.weights);
    const hours = componentRows(content.hours.breakdown);
    const credits = componentRows(content.credit_breakdown);
    const exams = [
        { key: 'midterm', label: i18n.t('Kiểm tra giữa kỳ'), text: examText(content.assessment.midterm, lang) },
        { key: 'final', label: i18n.t('Thi cuối kỳ'), text: examText(content.assessment.final_exam, lang) },
        { key: 'other', label: i18n.t('Hình thức khác'), text: examText(content.assessment.other, lang) },
    ].filter(item => item.text);

    return (
        <div className="analysis-grid">
            <Card size="small" title={i18n.t('Cách tính điểm')}>
                {weights.length ? <DonutChart rows={weights} centerCaption={i18n.t('tổng điểm')} /> : <Text type="secondary">{i18n.t('Đề cương không ghi tỷ lệ đánh giá.')}</Text>}
                {exams.length > 0 && (
                    <Descriptions column={1} size="small" style={{ marginTop: 16 }}>
                        {exams.map(item => <Descriptions.Item key={item.key} label={item.label}>{item.text}</Descriptions.Item>)}
                    </Descriptions>
                )}
            </Card>
            <Card size="small" title={i18n.t('Khối lượng học tập')}>
                <Space wrap size={[16, 8]} style={{ marginBottom: 12 }}>
                    {content.hours.total_periods && <Text>{i18n.t('Tổng')}{' '}<Text strong>{content.hours.total_periods}</Text>{' '}{i18n.t('tiết')}</Text>}
                    {content.hours.total_study_hours && <Text>≈ <Text strong>{content.hours.total_study_hours}</Text>{' '}{i18n.t('giờ học tập')}</Text>}
                    {content.credits_ects && <Text type="secondary">{content.credits_ects} ECTS</Text>}
                </Space>
                {hours.length > 0 && <CategoryStackBar rows={hours} unit={i18n.t('tiết')} title={i18n.t('Số tiết')} />}
                {credits.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{i18n.t('Phân bổ tín chỉ:')}{' '}</Text>
                        <Space wrap size={[4, 4]}>
                            {credits.map(row => <Tag key={row.key}>{row.label} {row.value}{' '}{i18n.t('TC')}</Tag>)}
                        </Space>
                    </div>
                )}
                {content.teaching_methods.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>{i18n.t('Phương pháp giảng dạy:')}{' '}</Text>
                        <Space wrap size={[4, 4]}>
                            {content.teaching_methods.map(method => <Tag key={method.code ?? pickText(method.name, lang)}>{pickText(method.name, lang)}</Tag>)}
                        </Space>
                    </div>
                )}
            </Card>
        </div>
    );
};

/* ------------------------------------ Tab: nội dung từng buổi ------------------------------------ */

const SessionsTab = ({ content, lang }: { content: OutlineContent; lang: OutlineLang }) => {
    const outcomes = useMemo(() => new Map(content.learning_outcomes.map(item => [item.key, item])), [content]);
    const activities = useMemo(() => new Map(content.assessment_activities.map(item => [item.code, item])), [content]);
    if (!content.sessions.length) return <Empty description={i18n.t('Đề cương không có nội dung chi tiết.')} />;

    return (
        <div className="outline-sessions">
            {content.sessions.map(session => {
                const outcomeKeys = [...new Set(session.items.map(item => item.outcome_key).filter((key): key is string => Boolean(key)))];
                const activityCodes = [...new Set(session.items.flatMap(item => item.assessment_codes))];
                const studentWork = [...new Set(session.items.map(item => pickText(item.student_activity, lang)).filter(Boolean))];
                return (
                    <div key={`${session.order}-${session.label}`} className="outline-session">
                        <div className="outline-session-label">{session.label ? i18n.t('Buổi {{label}}', { label: session.label }) : `#${session.order}`}</div>
                        <div className="outline-session-body">
                            <div className="outline-text">{pickText(session.content, lang) ?? '—'}</div>
                            {studentWork.length > 0 && (
                                <div className="outline-session-meta">
                                    <Text type="secondary">{i18n.t('Sinh viên:')}{' '}</Text>{studentWork.join(' · ')}
                                </div>
                            )}
                            {(outcomeKeys.length > 0 || activityCodes.length > 0) && (
                                <Space wrap size={[4, 4]} style={{ marginTop: 6 }}>
                                    {outcomeKeys.map(key => (
                                        <Tooltip key={key} title={pickText(outcomes.get(key)?.name, lang)}>
                                            <ToneChip tone="rose">{outcomes.get(key)?.code ?? key}</ToneChip>
                                        </Tooltip>
                                    ))}
                                    {activityCodes.map(code => (
                                        <Tooltip key={code} title={pickText(activities.get(code)?.name, lang)}>
                                            <ToneChip tone="warn">{code}</ToneChip>
                                        </Tooltip>
                                    ))}
                                </Space>
                            )}
                        </div>
                    </div>
                );
            })}
            <div className="outline-legend">
                <ToneChip tone="rose">{i18n.t('Chuẩn đầu ra')}</ToneChip>
                <ToneChip tone="warn">{i18n.t('Hoạt động đánh giá')}</ToneChip>
                <span className="hint">{i18n.t('Rê chuột lên thẻ để xem nội dung.')}</span>
            </div>
        </div>
    );
};

/* ------------------------------------ Tab: chuẩn đầu ra ------------------------------------ */

const OutcomesTab = ({ content, lang }: { content: OutlineContent; lang: OutlineLang }) => {
    const frameworks = [...new Set(content.learning_outcomes.map(item => item.framework))];
    const [framework, setFramework] = useState(frameworks.includes('LO') ? 'LO' : frameworks[0]);
    const activities = useMemo(() => new Map(content.assessment_activities.map(item => [item.code, item])), [content]);
    const assessedBy = useMemo(
        () => new Map(content.outcome_assessments.map(item => [item.outcome_key, item.activity_codes])),
        [content],
    );
    if (!content.learning_outcomes.length) return <Empty description={i18n.t('Đề cương không có chuẩn đầu ra.')} />;
    const active = frameworks.includes(framework) ? framework : frameworks[0];

    return (
        <div className="stack">
            {frameworks.length > 1 && (
                <Segmented
                    value={active}
                    onChange={value => setFramework(String(value))}
                    options={frameworks.map(item => ({ value: item, label: FRAMEWORK_LABEL[item] ?? item }))}
                />
            )}
            <div className="outline-outcomes">
                {content.learning_outcomes.filter(item => item.framework === active).map(outcome => (
                    <div key={outcome.key} className={`outline-outcome level-${Math.max(1, Math.min(outcome.level, 3))}`}>
                        <Text strong className="outline-outcome-code">{outcome.code}</Text>
                        <div>
                            <div className="outline-outcome-name">{pickText(outcome.name, lang)}</div>
                            {(assessedBy.get(outcome.key)?.length ?? 0) > 0 && (
                                <Space wrap size={[4, 4]} style={{ marginTop: 4 }}>
                                    {assessedBy.get(outcome.key)!.map(code => (
                                        <Tooltip key={code} title={pickText(activities.get(code)?.name, lang)}>
                                            <ToneChip tone="warn">{code}</ToneChip>
                                        </Tooltip>
                                    ))}
                                </Space>
                            )}
                            {outcome.note && <div className="hint">{outcome.note}</div>}
                        </div>
                    </div>
                ))}
            </div>
            {content.assessment_activities.length > 0 && (
                <Card size="small" title={i18n.t('Hoạt động đánh giá')}>
                    <div className="outline-outcomes">
                        {content.assessment_activities.map(activity => (
                            <div key={activity.code} className={`outline-outcome level-${Math.max(1, Math.min(activity.level, 3))}`}>
                                <Text strong className="outline-outcome-code">{activity.code}</Text>
                                <div>
                                    <div className="outline-outcome-name">
                                        {pickText(activity.name, lang)}
                                        {activity.category && <Tag style={{ marginLeft: 8 }}>{pickText(activity.category.name, lang)}</Tag>}
                                    </div>
                                    {pickText(activity.description, lang) && pickText(activity.description, lang) !== pickText(activity.name, lang) && (
                                        <div className="hint">{pickText(activity.description, lang)}</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
};

/* ------------------------------------ Tab: điều kiện môn ------------------------------------ */

// Tiên quyết = đỏ (chặn cứng), học trước / song hành = hổ phách, khuyến nghị = xám (RELATION_TONE dùng chung với sơ đồ).
const typeTag = (type: CourseRelationType | null, raw?: string | null) => (type
    ? <ToneChip tone={RELATION_TONE[type]}>{COURSE_RELATION_TYPE_LABEL[type]}</ToneChip>
    : <ToneChip tone="muted">{raw ?? '?'}</ToneChip>);

const PrerequisitesTab = ({ outline, curriculumRelations, curriculumCode }: {
    outline: CourseOutlineDetail;
    curriculumRelations?: CurriculumRelationView[];
    curriculumCode?: string;
}) => {
    const rows = useMemo(() => {
        const codes = new Set([
            ...outline.prerequisites.map(item => item.related_course_code),
            ...(curriculumRelations ?? []).map(item => item.related_course_code),
        ]);
        return [...codes].sort().map(code => {
            const fromOutline = outline.prerequisites.find(item => item.related_course_code === code);
            const fromCurriculum = curriculumRelations?.find(item => item.related_course_code === code);
            return { code, fromOutline, fromCurriculum, same: (fromOutline?.type ?? null) === (fromCurriculum?.type ?? null) };
        });
    }, [outline, curriculumRelations]);
    const compare = curriculumRelations !== undefined;
    const different = rows.filter(row => !row.same).length;

    if (!rows.length) return <Empty description={i18n.t('Đề cương và chương trình đều không ghi điều kiện cho môn này.')} />;

    return (
        <div className="stack">
            {compare && (different
                ? <Alert type="warning" showIcon title={i18n.t('{{different}} điều kiện khác nhau giữa đề cương và chương trình {{v1}}', { different: different, v1: curriculumCode ?? '' })} description={i18n.t('Hai nguồn được giữ nguyên để đối chiếu. Khi xét đăng ký, trang Phân tích học tập dùng điều kiện theo chương trình đào tạo.')} />
                : <Alert type="success" showIcon title={i18n.t('Điều kiện trong đề cương khớp với chương trình đào tạo của bạn.')} />)}
            <div className="outline-prereq">
                <div className="outline-prereq-head">
                    <span>{i18n.t('Môn liên quan')}</span>
                    <span>{i18n.t('Theo đề cương')}</span>
                    {compare && <span>{i18n.t('Theo chương trình')}{' '}{curriculumCode}</span>}
                </div>
                {rows.map(row => (
                    <div key={row.code} className={`outline-prereq-row${compare && !row.same ? ' is-different' : ''}`}>
                        <span>{courseLink(row.code)}</span>
                        <span>{row.fromOutline ? typeTag(row.fromOutline.type, row.fromOutline.type_raw) : <Text type="secondary">—</Text>}</span>
                        {compare && (
                            <span>
                                {row.fromCurriculum ? typeTag(row.fromCurriculum.type) : <Text type="secondary">—</Text>}
                                {row.same
                                    ? <LuCircleCheck className="outline-prereq-icon is-same" aria-label={i18n.t('Khớp')} />
                                    : <LuCircleAlert className="outline-prereq-icon is-diff" aria-label={i18n.t('Khác nhau')} />}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

/* ------------------------------------ Khung chính ------------------------------------ */

const sortVersions = (data: CourseOutlineByCode) => [...data.versions].sort((a, b) => (
    (b.applies_from ?? '').localeCompare(a.applies_from ?? '')
    || b.version.localeCompare(a.version, 'en', { numeric: true })
));

export const CourseOutlineSection = ({
    data, curriculumRelations, curriculumCode, openedSemesters, extraTabs = [],
}: CourseOutlineSectionProps) => {
    const versions = useMemo(() => sortVersions(data), [data]);
    const defaultId = data.selected?.id ?? versions[0]?.id;
    const [versionId, setVersionId] = useState(defaultId);
    const [lang, setLang] = useState<OutlineLang>('vi');
    const current = currentSemester();

    const otherQuery = useApiQuery(
        ['course-outline', versionId],
        () => getCourseOutline(versionId!),
        { enabled: Boolean(versionId) && versionId !== data.selected?.id },
    );
    const outline = versionId === data.selected?.id ? data.selected : otherQuery.data ?? null;
    const content = outline?.content;

    const versionLabel = (version: typeof versions[number]): ReactNode => (
        <span>
            v{version.version} · {version.applies_from ? i18n.t('áp dụng từ HK {{applies_from}}', { applies_from: version.applies_from }) : i18n.t('không rõ học kỳ')}
            {version.id === data.selected?.id && <Tag color="green" style={{ marginLeft: 6 }}>{i18n.t('Đang áp dụng')}</Tag>}
            {version.applies_from && version.applies_from > current && <Tag color="purple" style={{ marginLeft: 6 }}>{i18n.t('Sắp áp dụng')}</Tag>}
        </span>
    );

    return (
        <Card
            title={i18n.t('Đề cương môn học')}
            extra={(
                <Space wrap>
                    <Segmented<OutlineLang> size="small" value={lang} onChange={setLang} options={[{ value: 'vi', label: i18n.t('Tiếng Việt') }, { value: 'en', label: 'English' }]} />
                    <Select
                        size="small"
                        style={{ minWidth: 260 }}
                        value={versionId}
                        onChange={setVersionId}
                        options={versions.map(version => ({ value: version.id, label: versionLabel(version) }))}
                        aria-label={i18n.t('Phiên bản đề cương')}
                    />
                </Space>
            )}
        >
            {!data.selected && (
                <Alert style={{ marginBottom: 16 }} type="info" showIcon title={i18n.t('Chưa có đề cương áp dụng cho HK {{semester}}; đang hiển thị bản mới nhất.', { semester: data.semester })} />
            )}
            {!content ? (
                otherQuery.isError ? <Alert type="error" showIcon title={i18n.t('Không tải được phiên bản đề cương này.')} /> : <Spin />
            ) : (
                <>
                    <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="small" style={{ marginBottom: 8 }}>
                        <Descriptions.Item label={i18n.t('Tên (EN)')}>{content.name?.en ?? '—'}</Descriptions.Item>
                        <Descriptions.Item label={i18n.t('Khoa')}>{pickText(content.faculty?.name, lang) ?? '—'}</Descriptions.Item>
                        <Descriptions.Item label={i18n.t('Bộ môn')}>{pickText(content.department?.name, lang) ?? '—'}</Descriptions.Item>
                        <Descriptions.Item label={i18n.t('Loại môn')}>{pickText(content.course_type?.name, lang) ?? content.course_type?.code ?? '—'}</Descriptions.Item>
                        <Descriptions.Item label={i18n.t('Bậc')}>{pickText(content.level?.name, lang) ?? '—'}</Descriptions.Item>
                        <Descriptions.Item label={i18n.t('Khối kiến thức')}>
                            {content.knowledge_blocks.length
                                ? content.knowledge_blocks.map(block => KNOWLEDGE_BLOCK_LABEL[block] ?? block).join(', ')
                                : '—'}
                        </Descriptions.Item>
                        {content.programs.length > 0 && (
                            <Descriptions.Item label={i18n.t('Ngành áp dụng')} span={3}>
                                <Space wrap size={[4, 4]}>
                                    {content.programs.slice(0, 8).map(program => (
                                        <Tag key={program.code ?? pickText(program.name, lang)}>{pickText(program.name, lang)}</Tag>
                                    ))}
                                    {content.programs.length > 8 && <Text type="secondary">+{content.programs.length - 8}{' '}{i18n.t('ngành')}</Text>}
                                </Space>
                            </Descriptions.Item>
                        )}
                    </Descriptions>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {i18n.t('Nguồn: Đề cương môn học myBK')}{outline?.source_code ? ` (${outline.source_code})` : ''}
                        {outline?.source_updated_at ? i18n.t(' · cập nhật {{v0}}', { v0: new Date(outline.source_updated_at).toLocaleDateString('vi-VN') }) : ''}.
                    </Text>

                    <Tabs
                        style={{ marginTop: 12 }}
                        items={[
                            ...extraTabs,
                            {
                                key: 'intro',
                                label: i18n.t('Giới thiệu'),
                                children: (
                                    <div className="outline-intro">
                                        <TextBlock title={i18n.t('Mục tiêu môn học')} text={pickText(content.objectives, lang)} />
                                        <TextBlock title={i18n.t('Nội dung tóm tắt')} text={pickText(content.summary, lang)} />
                                        <TextBlock title={i18n.t('Hướng dẫn cách học')} text={pickText(content.study_guide, lang)} />
                                        <TextBlock title={i18n.t('Tài liệu học tập')} text={pickText(content.references, lang)} />
                                        <TextBlock title={i18n.t('Ghi chú')} text={pickText(content.notes, lang)} />
                                    </div>
                                ),
                            },
                            { key: 'workload', label: i18n.t('Khối lượng & đánh giá'), children: <WorkloadTab content={content} lang={lang} /> },
                            { key: 'sessions', label: i18n.t('Nội dung ({{length}})', { length: content.sessions.length }), children: <SessionsTab content={content} lang={lang} /> },
                            {
                                key: 'outcomes',
                                label: i18n.t('Chuẩn đầu ra'),
                                // key theo phiên bản để Segmented hệ chuẩn đầu ra về mặc định khi đổi bản.
                                children: <OutcomesTab key={outline!.id} content={content} lang={lang} />,
                            },
                            {
                                key: 'prerequisites',
                                label: i18n.t('Điều kiện môn ({{length}})', { length: outline!.prerequisites.length }),
                                children: <PrerequisitesTab outline={outline!} curriculumRelations={curriculumRelations} curriculumCode={curriculumCode} />,
                            },
                            ...(openedSemesters ? [{ key: 'opened', label: i18n.t('Học kỳ đã mở'), children: openedSemesters }] : []),
                        ]}
                    />
                </>
            )}
        </Card>
    );
};

export default CourseOutlineSection;
