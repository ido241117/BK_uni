import { type ReactNode, useState } from 'react';
import { Alert, Segmented, Tabs, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import {
    CollapsibleGroup, CourseCode, CourseStatus, EmptyState, EmptyTableLine, ISolidBtn, ITable, KpiCount, LoadWarning,
    PageLoading, ProgressThread, RowItem, RowList, SectionLabel,
} from '@/components';
import { COURSE_RELATION_TYPE_LABEL, type OutlineSummary } from '@/types';
import { semesterLabel } from '@/utils/semester';
import { BlockBars, ColumnChart } from '../components/charts';
import { RegulationList } from '../components/RegulationList';
import { type Analysis, type CourseCheck } from './analyze';
import { useStudentAnalysis } from './useStudentAnalysis';
import i18n from '@/i18n';

/*
 * "Phân tích" tab of Tiến độ học tập: merges the hidden analysis page and the regulations page.
 * Order: overview, warnings, then detail sub-tabs, all from saved data (useStudentAnalysis). The editable
 * board is on its own page (/program, "Chương trình"); saving there refreshes these queries.
 */

type T = TFunction;

const courseLink = (code: string) => <Link to={`/courses/${encodeURIComponent(code)}`}><CourseCode>{code}</CourseCode></Link>;

/** One-line outline summary: final exam format and total study hours. */
const outlineHint = (outline: OutlineSummary | null, t: T): string | null => {
    if (!outline) return null;
    const exam = outline.final_exam
        ? t('Thi {{format}}', {
            format: [outline.final_exam.format?.toLowerCase(), outline.final_exam.duration_minutes ? `${outline.final_exam.duration_minutes}′` : null]
                .filter(Boolean).join(' '),
        })
        : null;
    const extras = [outline.has_lab ? t('có thí nghiệm') : null, outline.has_project ? t('có đồ án') : null].filter(Boolean).join(', ');
    return [exam, outline.total_study_hours ? t('≈ {{hours}} giờ', { hours: Math.round(outline.total_study_hours) }) : null, extras || null]
        .filter(Boolean).join(' · ') || null;
};

/** Shared columns for the course tables: code, name, credits, recommended semester, prerequisites, opened, status. */
const checkColumns = (analysis: Analysis, t: T, showGroup = false): ColumnsType<CourseCheck> => [
    { title: t('Mã môn'), key: 'code', width: 100, render: (_v, row) => courseLink(row.course.code) },
    {
        title: t('Học phần'),
        key: 'name',
        render: (_v, row) => (
            <div className="cell-stack">
                <span>{row.course.name}</span>
                {outlineHint(row.course.outline, t) && <span className="hint">{outlineHint(row.course.outline, t)}</span>}
                {row.course.specializationCodes.length > 0 && (
                    <span>{row.course.specializationCodes.map(code => <Tag key={code} color="purple">{code}</Tag>)}</span>
                )}
            </div>
        ),
    },
    { title: t('TC'), key: 'credits', width: 60, render: (_v, row) => row.course.credits },
    ...(showGroup ? [] : [{
        title: t('Khuyến nghị'),
        key: 'recommended',
        width: 140,
        render: (_v: unknown, row: CourseCheck) => (row.course.recommendedLabel
            ? <span className="cell-stack">{row.course.recommendedLabel}{row.overdue && <LoadWarning>{t('Quá hạn')}</LoadWarning>}</span>
            : <span className="hint">{t('Tự chọn')}</span>),
    }]),
    {
        title: t('Điều kiện'),
        key: 'prereq',
        width: 200,
        render: (_v, row) => (
            <div className="cell-stack">
                {row.missing.length
                    ? <Tag color="red">{t('Thiếu {{codes}}', { codes: row.missing.join(', ') })}</Tag>
                    : <Tag color="green">{t('Đủ điều kiện')}</Tag>}
                {row.corequisites.length > 0 && <span className="hint">{t('Song hành: {{codes}}', { codes: row.corequisites.join(', ') })}</span>}
                {row.outlineMissing.length > 0 && (
                    <Tooltip title={t('Đề cương ghi điều kiện này nhưng chương trình đào tạo không khai; hệ thống vẫn xét theo chương trình.')}>
                        <Tag color="orange">
                            {t('Đề cương: {{items}}', {
                                items: row.outlineMissing.map(item => `${t(COURSE_RELATION_TYPE_LABEL[item.type]).toLowerCase()} ${item.code}`).join(', '),
                            })}
                        </Tag>
                    </Tooltip>
                )}
            </div>
        ),
    },
    {
        title: t('Mở lớp (kỳ {{term}})', { term: analysis.next.at(-1) }),
        key: 'opened',
        width: 160,
        render: (_v, row) => {
            const opened = row.course.openedSemesters;
            const tag = row.offered === null
                ? <Tag>{t('Chưa có dữ liệu')}</Tag>
                : row.offered ? <Tag color="green">{t('Thường mở')}</Tag> : <Tag color="orange">{t('Chưa từng mở')}</Tag>;
            return (
                <Tooltip title={opened.length ? t('Đã mở: {{list}}', { list: opened.join(', ') }) : undefined}>
                    <div className="cell-stack">
                        {tag}
                        {row.course.lastOpened && <span className="hint">{t('Gần nhất: HK {{code}}', { code: row.course.lastOpened })}</span>}
                    </div>
                </Tooltip>
            );
        },
    },
    {
        title: t('Trạng thái'),
        key: 'status',
        width: 150,
        render: (_v, row) => (
            <div className="cell-stack">
                {row.course.status ? <CourseStatus status={row.course.status} /> : <span className="hint">{t('Chưa khai')}</span>}
                {row.course.plannedSemester && <Tag color="purple">{t('HK {{code}}', { code: row.course.plannedSemester })}</Tag>}
            </div>
        ),
    },
];

const CheckTable = ({ rows, analysis, empty, showGroup }: { rows: CourseCheck[]; analysis: Analysis; empty: string; showGroup?: boolean }) => {
    const { t } = useTranslation();
    return (
        <ITable<CourseCheck>
            rowKey={row => row.course.id}
            columns={checkColumns(analysis, t, showGroup)}
            dataSource={rows}
            pagination={false}
            syncLocation={false}
            emptyText={<EmptyTableLine>{empty}</EmptyTableLine>}
        />
    );
};

/** Credit overview (left) and pace (right), then the block and timeline charts. */
const Overview = ({ analysis }: { analysis: Analysis }) => {
    const { t } = useTranslation();
    const { overview } = analysis;
    const percent = overview.totalCredits ? (overview.completedCredits / overview.totalCredits) * 100 : 0;
    const late = analysis.projectedGraduation !== null && analysis.projectedGraduation > analysis.standardGraduation;
    const perSemester = (value: number | null) => (value !== null ? t('{{value}} TC/kỳ', { value: value.toFixed(1) }) : '—');

    return (
        <>
            <div className="info-panel">
                <div>
                    <SectionLabel>{t('Tín chỉ tích lũy / chuẩn tốt nghiệp')}</SectionLabel>
                    <KpiCount value={overview.completedCredits} suffix={t('/ {{total}} TC', { total: overview.totalCredits })} />
                    <ProgressThread percent={percent} label={t('Tín chỉ tích lũy')} />
                    <div className="info-panel-rows">
                        <RowList>
                            <RowItem label={t('Môn được tính vào chuẩn tốt nghiệp')}
                                value={t('{{done}} / {{total}} môn', { done: overview.completedCourses, total: overview.requiredCourses })} />
                            <RowItem label={t('Đang học')} value={t('{{value}} TC', { value: overview.inProgressCredits })} />
                            <RowItem label={t('Đã lên kế hoạch')} value={t('{{value}} TC', { value: overview.plannedCredits })} />
                            <RowItem label={t('Còn thiếu (chưa học, chưa xếp kỳ)')} value={t('{{value}} TC', { value: overview.remainingCredits })} />
                        </RowList>
                    </div>
                </div>
                <div>
                    <SectionLabel>{t('Nhịp học')}</SectionLabel>
                    <RowList>
                        <RowItem label={t('Học kỳ đang tính')} value={semesterLabel(analysis.current)} />
                        <RowItem label={t('Năm học')} value={t('Năm thứ {{year}} (khóa {{cohort}})', { year: analysis.studyYear, cohort: analysis.admissionYear })} />
                        <RowItem
                            label={t('Nhịp đã học')}
                            value={overview.averagePerSemester !== null
                                ? t('{{value}} · {{count}} kỳ đã qua', { value: perSemester(overview.averagePerSemester), count: overview.elapsedSemesters })
                                : t('chưa có kỳ nào')}
                        />
                        <RowItem
                            label={t('Cần để tốt nghiệp đúng hạn')}
                            value={overview.neededPerSemester !== null
                                ? t('{{value}} · {{count}} kỳ còn lại', { value: perSemester(overview.neededPerSemester), count: overview.semestersLeft })
                                : '—'}
                        />
                        <RowItem
                            label={t('Dự kiến tốt nghiệp')}
                            value={(
                                <span className="load-summary">
                                    {analysis.projectedGraduation ? t('HK {{code}}', { code: analysis.projectedGraduation }) : t('Chưa rõ')}
                                    {late && <LoadWarning>{t('trễ hạn (chuẩn HK {{code}})', { code: analysis.standardGraduation })}</LoadWarning>}
                                </span>
                            )}
                        />
                    </RowList>
                </div>
            </div>

            <div className="analysis-grid">
                <div>
                    <SectionLabel>{t('Tiến độ theo khối kiến thức')}</SectionLabel>
                    <BlockBars
                        rows={analysis.blocks.filter(block => block.needCredits > 0).map(block => ({
                            key: block.key,
                            label: block.name,
                            hint: block.kind === 'required'
                                ? t('{{done}}/{{need}} môn', { done: block.doneCount, need: block.needCount })
                                : block.kind === 'any'
                                    ? t('Chọn môn bất kỳ')
                                    : t('Chọn {{need}} môn · đã tính {{done}}', { need: block.needCount, done: block.doneCount }),
                            total: block.needCredits,
                            segments: [
                                { key: 'done', value: block.done },
                                { key: 'inProgress', value: block.inProgress },
                                { key: 'planned', value: block.planned },
                            ],
                            valueText: t('{{done}}/{{need}} TC', { done: block.done, need: block.needCredits }),
                        }))}
                    />
                </div>
                <div>
                    <SectionLabel>{t('Theo khung chương trình (môn bắt buộc)')}</SectionLabel>
                    {analysis.timeline.length ? (
                        <>
                            <ColumnChart
                                columns={analysis.timeline.map(column => ({
                                    key: column.code,
                                    label: column.label,
                                    sublabel: column.code,
                                    highlight: column.isCurrent ? t('hiện tại') : undefined,
                                    segments: [
                                        { key: 'done', value: column.done },
                                        { key: 'inProgress', value: column.inProgress },
                                        { key: 'planned', value: column.planned },
                                        { key: 'remaining', value: column.remaining },
                                    ],
                                    note: column.isPast && column.remaining > 0
                                        ? t('⚠ kỳ đã qua còn {{count}} TC chưa học/chưa xếp', { count: column.remaining })
                                        : undefined,
                                }))}
                            />
                            <p className="hint">
                                {t('Mỗi cột là một học kỳ theo khung (N = năm, K = kỳ) quy ra học kỳ thực theo năm nhập học; cột có dấu ▲ là kỳ hiện tại. Phần xám ở các cột bên trái kỳ hiện tại là môn đang bị chậm.')}
                            </p>
                        </>
                    ) : <EmptyTableLine>{t('Chương trình chưa xếp kỳ khuyến nghị cho môn nào.')}</EmptyTableLine>}
                </div>
            </div>
        </>
    );
};

/** Warnings, open by default when something is an error. */
const Warnings = ({ analysis }: { analysis: Analysis }) => {
    const { t } = useTranslation();
    const level = { error: 'error', warning: 'warning', info: 'info' } as const;
    return (
        <CollapsibleGroup
            title={t('Cảnh báo & lưu ý ({{count}})', { count: analysis.warnings.length })}
            met={analysis.warnings.length === 0}
            defaultOpen={analysis.warnings.some(warning => warning.level === 'error')}
        >
            {analysis.warnings.length ? (
                <div className="stack" style={{ gap: 8 }}>
                    {analysis.warnings.map((warning, index) => (
                        <Alert key={`${index}-${warning.title}`} type={level[warning.level]} showIcon title={warning.title} description={warning.detail} />
                    ))}
                </div>
            ) : <Alert type="success" showIcon title={t('Không phát hiện vấn đề nào trong dữ liệu hiện tại.')} />}
        </CollapsibleGroup>
    );
};

const MissingCourses = ({ analysis }: { analysis: Analysis }) => {
    const { t } = useTranslation();
    const [list, setList] = useState<'overdue' | 'required' | 'electives' | 'failed'>('overdue');
    const electiveNeed = analysis.electives.reduce((total, option) => total + option.block.remainingCount, 0);
    return (
        <div className="stack">
            <Segmented
                value={list}
                onChange={setList}
                options={[
                    { value: 'overdue', label: t('Quá kỳ khuyến nghị ({{count}})', { count: analysis.overdue.length }) },
                    { value: 'required', label: t('Bắt buộc còn lại ({{count}})', { count: analysis.requiredLeft.length }) },
                    { value: 'electives', label: t('Tự chọn còn thiếu ({{count}} môn)', { count: electiveNeed }) },
                    { value: 'failed', label: t('Chưa đạt ({{count}})', { count: analysis.failed.length }) },
                ]}
            />
            {list === 'overdue' && <CheckTable rows={analysis.overdue} analysis={analysis} empty={t('Không có môn bắt buộc nào bị chậm.')} />}
            {list === 'required' && <CheckTable rows={analysis.requiredLeft} analysis={analysis} empty={t('Đã xong mọi môn bắt buộc.')} />}
            {list === 'electives' && (analysis.electives.length || analysis.blocks.some(block => block.kind === 'any' && block.remaining > 0) ? (
                <RowList>
                    {analysis.electives.map(option => (
                        <RowItem
                            key={option.group.id}
                            label={option.group.name}
                            value={t('còn {{count}} môn ({{credits}} TC) · {{options}} môn để chọn', {
                                count: option.block.remainingCount,
                                credits: Math.max(0, option.block.needCredits - option.block.done - option.block.inProgress),
                                options: option.candidates.length,
                            })}
                        />
                    ))}
                    {analysis.blocks.filter(block => block.kind === 'any' && block.remaining > 0).map(block => (
                        <RowItem key={block.key} label={block.name}
                            value={t('còn {{count}} TC, chọn môn bất kỳ (kể cả ngoài chương trình)', { count: block.remaining })} />
                    ))}
                </RowList>
            ) : <EmptyTableLine>{t('Đã đủ các khối tự chọn.')}</EmptyTableLine>)}
            {list === 'failed' && (analysis.failed.length
                ? <div>{analysis.failed.map(course => <Tag key={course.id} color="red">{course.code} · {course.name}</Tag>)}</div>
                : <EmptyTableLine>{t('Không có môn chưa đạt.')}</EmptyTableLine>)}
        </div>
    );
};

const Options = ({ analysis }: { analysis: Analysis }) => {
    const { t } = useTranslation();
    if (!analysis.electives.length && !analysis.specializations.length) {
        return <EmptyTableLine>{t('Không còn khối tự chọn nào cần chọn.')}</EmptyTableLine>;
    }
    return (
        <div className="stack">
            {analysis.specializations.length > 0 && (
                <div>
                    <SectionLabel>{t('Chuyên ngành (không bắt buộc)')}</SectionLabel>
                    <p className="hint">
                        {t('Đạt chuyên ngành khi các môn tự chọn của khối gốc đều thuộc danh sách chuyên ngành. Thanh thể hiện số môn đã học/đang học trong danh sách.')}
                    </p>
                    <BlockBars
                        unit={t('môn')}
                        rows={analysis.specializations.map(option => ({
                            key: option.specialization.id,
                            label: `${option.specialization.code}${option.isTarget ? ' ★' : ''}`,
                            hint: option.specialization.name,
                            total: option.need,
                            segments: [{ key: 'done', value: option.doneInList, label: t('Đã học / đang học') }],
                            valueText: t('{{done}}/{{need}} môn', { done: option.doneInList, need: option.need }),
                        }))}
                    />
                    <RowList>
                        {analysis.specializations.map(option => (
                            <RowItem
                                key={option.specialization.id}
                                label={`${option.specialization.code} · ${option.specialization.name}${option.isTarget ? ` · ${t('Mục tiêu')}` : ''}`}
                                value={option.achievable
                                    ? <span className="text-good">{t('còn khả thi')}</span>
                                    : <LoadWarning>
                                        {option.outsideList.length
                                            ? t('đã học ngoài danh sách: {{codes}}', { codes: option.outsideList.map(course => course.code).join(', ') })
                                            : t('không đủ môn còn lại')}
                                    </LoadWarning>}
                            />
                        ))}
                    </RowList>
                </div>
            )}
            {analysis.electives.map(option => (
                <div key={option.group.id}>
                    <SectionLabel>
                        {t('{{group}} — còn chọn {{count}} môn trong {{options}} môn', {
                            group: option.group.name, count: option.block.remainingCount, options: option.candidates.length,
                        })}
                    </SectionLabel>
                    <CheckTable rows={option.candidates} analysis={analysis} empty={t('Không còn môn để chọn.')} showGroup />
                </div>
            ))}
        </div>
    );
};

const NextSemester = ({ analysis }: { analysis: Analysis }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    return (
        <div className="stack">
            <div className="analysis-grid">
                <div>
                    <SectionLabel>{t('Có thể đăng ký ở {{semester}}', { semester: semesterLabel(analysis.next) })}</SectionLabel>
                    <p className="hint">
                        {t('Môn còn cần học, đã đủ tiên quyết/học trước (coi môn đang học là sẽ đạt) và không bị ghi nhận là chưa từng mở ở kỳ {{term}}.', { term: analysis.next.at(-1) })}
                    </p>
                    {analysis.eligibleNext.length ? (
                        <div>
                            {analysis.eligibleNext.map(check => (
                                <Tooltip
                                    key={check.course.id}
                                    title={i18n.t('{{name}} · {{credits}} TC{{v2}}', { name: check.course.name, credits: check.course.credits, v2: check.course.recommendedLabel ? ` · ${check.course.recommendedLabel}` : ` · ${t('tự chọn')}` })}
                                >
                                    <Tag color={check.overdue ? 'red' : check.course.groupId ? 'purple' : 'blue'}>
                                        <Link to={`/courses/${encodeURIComponent(check.course.code)}`}>{check.course.code}</Link> · {check.course.credits}{' '}{i18n.t('TC')}
                                    </Tag>
                                </Tooltip>
                            ))}
                            <p className="hint">{t('Đỏ: môn bắt buộc quá hạn · Hồng nhạt: môn tự chọn · Hồng: môn bắt buộc.')}</p>
                        </div>
                    ) : <EmptyTableLine>{t('Không có môn nào đủ điều kiện.')}</EmptyTableLine>}
                </div>
                <div>
                    <SectionLabel>{t('Môn “nút thắt” (mở khóa nhiều môn nhất)')}</SectionLabel>
                    {analysis.bottlenecks.length ? (
                        <BlockBars
                            unit={t('môn')}
                            normalize={false}
                            onRowClick={code => navigate(`/courses/${encodeURIComponent(code)}`)}
                            rows={analysis.bottlenecks.map(item => ({
                                key: item.course.code,
                                label: item.course.code,
                                hint: t('{{name}} · mở khóa: {{codes}}', { name: item.course.name, codes: item.unlocks.join(', ') }),
                                total: analysis.bottlenecks[0].unlocks.length,
                                segments: [item.course.status === 'in-progress'
                                    ? { key: 'inProgress', value: item.unlocks.length, label: t('Đang học') }
                                    : { key: 'done', value: item.unlocks.length, label: t('Chưa học') }],
                                valueText: t('{{count}} môn', { count: item.unlocks.length }),
                            }))}
                        />
                    ) : <EmptyTableLine>{t('Chương trình chưa có quan hệ tiên quyết/học trước, hoặc bạn đã học hết các môn điều kiện.')}</EmptyTableLine>}
                </div>
            </div>
            {analysis.blockedNext.length > 0 && (
                <div>
                    <SectionLabel>{t('Chưa đủ điều kiện đăng ký ({{count}})', { count: analysis.blockedNext.length })}</SectionLabel>
                    <CheckTable rows={analysis.blockedNext} analysis={analysis} empty="" />
                </div>
            )}
        </div>
    );
};

const Roadmap = ({ analysis, maxCredits, minCredits }: { analysis: Analysis; maxCredits: number; minCredits: number }) => {
    const { t } = useTranslation();
    const { overview } = analysis;
    return (
        <div className="stack">
            <p className="hint">
                {t('Giữ nguyên các môn bạn đã xếp kỳ, rồi tự xếp môn còn thiếu theo thứ tự khung chương trình, tiên quyết, lịch mở lớp các năm trước và tối đa {{capacity}} TC/kỳ. Môn tự chọn ưu tiên môn đã lên kế hoạch, môn của chuyên ngành mục tiêu và môn hay mở lớp. Không xếp kỳ hè.', { capacity: overview.capacity })}
            </p>
            {analysis.roadmap.length ? (
                <>
                    <ColumnChart
                        columns={analysis.roadmap.map(semester => ({
                            key: semester.code,
                            label: t('HK {{code}}', { code: semester.code }),
                            highlight: semester.code > analysis.standardGraduation ? t('sau hạn') : undefined,
                            segments: [
                                { key: 'planned', value: semester.items.filter(item => item.fromPlan).reduce((sum, item) => sum + item.credits, 0) },
                                { key: 'suggested', value: semester.items.filter(item => !item.fromPlan).reduce((sum, item) => sum + item.credits, 0) },
                            ],
                            note: semester.code > analysis.standardGraduation ? t('sau mốc tốt nghiệp chuẩn') : undefined,
                        }))}
                        references={[
                            { value: maxCredits, label: t('Tối đa {{value}}', { value: maxCredits }) },
                            { value: minCredits, label: t('Tối thiểu {{value}}', { value: minCredits }) },
                        ]}
                    />
                    <div className="roadmap">
                        {analysis.roadmap.map(semester => (
                            <div key={semester.code} className="roadmap-semester">
                                <div className="roadmap-semester-head">
                                    <span className="roadmap-code">{t('HK {{code}}', { code: semester.code })}</span>
                                    <span className="hint">
                                        {t('{{credits}} TC', { credits: semester.credits })}
                                        {semester.hoursKnown ? ` · ${t('≈ {{hours}} giờ', { hours: semester.studyHours })}` : ''}
                                    </span>
                                </div>
                                {semester.items.map(item => (
                                    <div key={item.key} className="roadmap-item">
                                        <span>
                                            {item.code !== '—' ? courseLink(item.code) : null}{' '}
                                            <span className={item.kind === 'free' ? 'hint' : undefined}>{item.name}</span>
                                            {item.fromPlan && <Tag color="gold" style={{ marginInlineStart: 6 }}>{t('KH')}</Tag>}
                                            {item.groupName && item.kind === 'elective' && <span className="hint" style={{ display: 'block' }}>{item.groupName}</span>}
                                        </span>
                                        <span className="hint">{item.credits}{' '}{i18n.t('TC')}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <EmptyTableLine>
                    {overview.remainingCredits === 0 && overview.inProgressCredits === 0 ? t('Bạn đã đủ tín chỉ tốt nghiệp.') : t('Không còn môn nào để xếp.')}
                </EmptyTableLine>
            )}
            {analysis.unplaced.length > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    title={t('{{count}} môn chưa xếp được', { count: analysis.unplaced.length })}
                    description={t('{{codes}} — vướng điều kiện tiên quyết vòng tròn hoặc thiếu dữ liệu. Kiểm tra lại quan hệ môn.', {
                        codes: analysis.unplaced.map(course => course.code).join(', '),
                    })}
                />
            )}
        </div>
    );
};

const Section = ({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) => (
    <section className="analysis-section">
        <h2 className="analysis-section-title">{title}</h2>
        {hint && <p className="hint">{hint}</p>}
        {children}
    </section>
);

/** The "Phân tích" tab. */
export const AnalysisTab = () => {
    const { t } = useTranslation();
    const { profileLoading, curriculumId, curriculum, isError, outlinesUnavailable, analysis } = useStudentAnalysis();

    if (profileLoading) return <PageLoading label={t('Đang tải dữ liệu phân tích...')} />;
    if (!curriculumId) {
        return (
            <EmptyState
                size="panel"
                title={t('Chưa chọn chương trình đào tạo')}
                description={t('Phân tích so sánh dữ liệu của bạn với chương trình đào tạo. Hãy nhập tiến độ từ myBK hoặc chọn chương trình trong hồ sơ trước.')}
                action={<Link to="/profile"><ISolidBtn size="small">{t('Mở hồ sơ')}</ISolidBtn></Link>}
            />
        );
    }
    if (isError) {
        return <EmptyState size="panel" illustration="error" title={t('Không tải được dữ liệu để phân tích')} description={t('Thử tải lại trang.')} />;
    }
    if (!analysis || !curriculum) return <PageLoading label={t('Đang tải dữ liệu phân tích...')} />;

    const detailTabs = [
        { key: 'missing', label: t('Môn còn thiếu'), children: <MissingCourses analysis={analysis} /> },
        { key: 'options', label: t('Các lựa chọn'), children: <Options analysis={analysis} /> },
        { key: 'next', label: t('Học kỳ tới'), children: <NextSemester analysis={analysis} /> },
        {
            key: 'roadmap',
            label: t('Lộ trình đề xuất'),
            children: <Roadmap analysis={analysis} maxCredits={curriculum.max_semester_credits} minCredits={curriculum.min_semester_credits} />,
        },
        {
            key: 'regulations',
            label: t('Điều kiện tốt nghiệp ({{done}}/{{total}})', {
                done: analysis.regulationCount - analysis.unmetRegulations.length, total: analysis.regulationCount,
            }),
            children: <RegulationList curriculumId={curriculumId} />,
        },
    ];

    return (
        <div className="analysis-tab">
            {outlinesUnavailable && (
                <Alert type="warning" showIcon title={t('Không tải được đề cương môn học')}
                    description={t('Phân tích vẫn đầy đủ theo chương trình đào tạo; chỉ thiếu phần giờ học, hình thức thi và điều kiện theo đề cương.')} />
            )}
            <Overview analysis={analysis} />
            <Warnings analysis={analysis} />
            <Section title={t('Phân tích chi tiết')}>
                <Tabs items={detailTabs} />
            </Section>
        </div>
    );
};

export default AnalysisTab;
