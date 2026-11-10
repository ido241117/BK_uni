import { type ReactNode } from 'react';
import { Alert, Card, Empty, Space, Statistic, Tabs, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LuArrowLeft, LuCircleAlert, LuCircleCheck, LuInfo, LuTriangleAlert } from 'react-icons/lu';
import { Link } from 'react-router';
import { IOutLinedBtn, ISolidBtn, ITable, PageHeader, TablePageSkeleton } from '@/components';
import { COURSE_RELATION_TYPE_LABEL, STUDENT_COURSE_STATUS_COLOR, STUDENT_COURSE_STATUS_LABEL, type OutlineSummary } from '@/types';
import { type Analysis, type CourseCheck, type Warning } from './analyze';
import { BlockBars, ColumnChart, Legend, ProgressRing, StackedBar } from './charts';
import { semesterLabel } from './semester';
import { useStudentAnalysis } from './useStudentAnalysis';

const { Text, Paragraph } = Typography;

const courseLink = (code: string) => <Link to={`/courses/${encodeURIComponent(code)}`}><Text strong>{code}</Text></Link>;

/** Một dòng tóm tắt từ đề cương: hình thức thi cuối kỳ và tổng giờ học tập. */
const outlineHint = (outline: OutlineSummary | null): string | null => {
    if (!outline) return null;
    const exam = outline.final_exam
        ? `Thi ${[outline.final_exam.format?.toLowerCase(), outline.final_exam.duration_minutes ? `${outline.final_exam.duration_minutes}′` : null].filter(Boolean).join(' ')}`
        : null;
    const extras = [outline.has_lab ? 'có thí nghiệm' : null, outline.has_project ? 'có đồ án' : null].filter(Boolean).join(', ');
    return [exam, outline.total_study_hours ? `≈ ${Math.round(outline.total_study_hours)} giờ` : null, extras || null]
        .filter(Boolean).join(' · ') || null;
};

const WARNING_UI: Record<Warning['level'], { type: 'error' | 'warning' | 'info'; icon: ReactNode }> = {
    error: { type: 'error', icon: <LuCircleAlert /> },
    warning: { type: 'warning', icon: <LuTriangleAlert /> },
    info: { type: 'info', icon: <LuInfo /> },
};

/** Cột chung cho các bảng môn: mã, tên, tín chỉ, kỳ khuyến nghị, điều kiện, mở lớp. */
const checkColumns = (analysis: Analysis, options: { showGroup?: boolean } = {}): ColumnsType<CourseCheck> => {
    const columns: ColumnsType<CourseCheck> = [
        { title: 'Mã môn', key: 'code', width: 100, render: (_v, row) => courseLink(row.course.code) },
        {
            title: 'Học phần',
            key: 'name',
            render: (_v, row) => (
                <div>
                    <div>{row.course.name}</div>
                    {outlineHint(row.course.outline) && <div className="hint">{outlineHint(row.course.outline)}</div>}
                    {row.course.specializationCodes.length > 0 && (
                        <Space size={[4, 4]} wrap style={{ marginTop: 4 }}>
                            {row.course.specializationCodes.map(code => <Tag key={code} color="geekblue">{code}</Tag>)}
                        </Space>
                    )}
                </div>
            ),
        },
        { title: 'TC', key: 'credits', width: 60, align: 'center', render: (_v, row) => row.course.credits },
    ];
    if (!options.showGroup) {
        columns.push({
            title: 'Khuyến nghị',
            key: 'recommended',
            width: 130,
            render: (_v, row) => (row.course.recommendedLabel
                ? <span>{row.course.recommendedLabel}{row.overdue && <Tag color="red" style={{ marginLeft: 6 }}>Quá hạn</Tag>}</span>
                : <Text type="secondary">Tự chọn</Text>),
        });
    }
    columns.push(
        {
            title: 'Điều kiện',
            key: 'prereq',
            width: 190,
            render: (_v, row) => (
                <Space direction="vertical" size={2}>
                    {row.missing.length
                        ? <Tag color="red" icon={<LuCircleAlert style={{ marginRight: 4, verticalAlign: -2 }} />}>Thiếu {row.missing.join(', ')}</Tag>
                        : <Tag color="green" icon={<LuCircleCheck style={{ marginRight: 4, verticalAlign: -2 }} />}>Đủ điều kiện</Tag>}
                    {row.corequisites.length > 0 && <Text type="secondary" style={{ fontSize: 12 }}>Song hành: {row.corequisites.join(', ')}</Text>}
                    {row.outlineMissing.length > 0 && (
                        <Tooltip title="Đề cương ghi điều kiện này nhưng chương trình đào tạo không khai; hệ thống vẫn xét theo chương trình.">
                            <Tag color="orange">
                                Đề cương: {row.outlineMissing.map(item => `${COURSE_RELATION_TYPE_LABEL[item.type].toLowerCase()} ${item.code}`).join(', ')}
                            </Tag>
                        </Tooltip>
                    )}
                </Space>
            ),
        },
        {
            title: `Mở lớp (kỳ ${analysis.next.at(-1)})`,
            key: 'opened',
            width: 160,
            render: (_v, row) => {
                const opened = row.course.openedSemesters;
                const tag = row.offered === null
                    ? <Tag>Chưa có dữ liệu</Tag>
                    : row.offered ? <Tag color="green">Thường mở</Tag> : <Tag color="orange">Chưa từng mở</Tag>;
                return (
                    <Tooltip title={opened.length ? `Đã mở: ${opened.join(', ')}` : undefined}>
                        <div>
                            {tag}
                            {row.course.lastOpened && <div className="hint">Gần nhất: HK {row.course.lastOpened}</div>}
                        </div>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Trạng thái',
            key: 'status',
            width: 130,
            render: (_v, row) => (
                <Space direction="vertical" size={2}>
                    {row.course.status
                        ? <Tag color={STUDENT_COURSE_STATUS_COLOR[row.course.status]}>{STUDENT_COURSE_STATUS_LABEL[row.course.status]}</Tag>
                        : <Text type="secondary">Chưa khai</Text>}
                    {row.course.plannedSemester && <Tag color="purple">HK {row.course.plannedSemester}</Tag>}
                </Space>
            ),
        },
    );
    return columns;
};

const CheckTable = ({ rows, analysis, empty, showGroup }: { rows: CourseCheck[]; analysis: Analysis; empty: string; showGroup?: boolean }) => (
    <ITable<CourseCheck>
        rowKey={row => row.course.id}
        columns={checkColumns(analysis, { showGroup })}
        dataSource={rows}
        pagination={false}
        syncLocation={false}
        size="small"
        emptyText={empty}
    />
);

const AnalysisPage = () => {
    const { profileLoading, curriculumId, curriculum: loadedCurriculum, isError, outlinesUnavailable, analysis } = useStudentAnalysis();

    const back = <Link to="/courses"><IOutLinedBtn icon={<LuArrowLeft />}>Về trang môn học</IOutLinedBtn></Link>;

    if (profileLoading) return <TablePageSkeleton />;

    if (!curriculumId) {
        return (
            <section>
                <PageHeader title="Phân tích học tập" extra={back} />
                <Alert
                    type="info"
                    showIcon
                    title="Chưa chọn chương trình đào tạo"
                    description="Phân tích so sánh dữ liệu của bạn với chương trình đào tạo. Hãy chọn chương trình trong hồ sơ trước."
                    action={<Link to="/profile"><ISolidBtn size="small">Điền hồ sơ</ISolidBtn></Link>}
                />
            </section>
        );
    }

    if (isError) {
        return (
            <section>
                <PageHeader title="Phân tích học tập" extra={back} />
                <Alert type="error" showIcon title="Không tải được dữ liệu để phân tích" description="Thử tải lại trang." />
            </section>
        );
    }

    if (!analysis || !loadedCurriculum) return <TablePageSkeleton />;

    const { overview } = analysis;
    const curriculum = loadedCurriculum;
    const percent = overview.totalCredits ? (overview.completedCredits / overview.totalCredits) * 100 : 0;
    const electiveNeedCount = analysis.electives.reduce((total, option) => total + option.block.remainingCount, 0);
    const lateGraduation = analysis.projectedGraduation !== null && analysis.projectedGraduation > analysis.standardGraduation;

    return (
        <section>
            <PageHeader
                title="Phân tích học tập"
                subtitle={`Đọc từ chương trình ${curriculum.code}, trạng thái môn và kế hoạch bạn đã khai. Tính tại ${semesterLabel(analysis.current)} — năm thứ ${analysis.studyYear} (khóa ${analysis.admissionYear}).${analysis.outlineCoverage.withOutline ? ` Đề cương (bản áp dụng ${semesterLabel(analysis.next)}): ${analysis.outlineCoverage.withOutline}/${analysis.outlineCoverage.total} môn.` : ''}`}
                extra={back}
            />

            <div className="stack">
                {outlinesUnavailable && (
                    <Alert type="warning" showIcon title="Không tải được đề cương môn học" description="Phân tích vẫn đầy đủ theo chương trình đào tạo; chỉ thiếu phần giờ học, hình thức thi và điều kiện theo đề cương." />
                )}
                {/* ----------------------------- Tổng quan ----------------------------- */}
                <Card>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
                        <ProgressRing
                            percent={percent}
                            label={`${overview.completedCredits} / ${overview.totalCredits} TC`}
                            sublabel={`${overview.completedCourses} / ${overview.requiredCourses} môn được tính vào chuẩn tốt nghiệp`}
                        />
                        <div className="stat-row" style={{ flex: 1, minWidth: 280 }}>
                            <Statistic title="Đang học" value={overview.inProgressCredits} suffix="TC" />
                            <Statistic title="Đã lên kế hoạch" value={overview.plannedCredits} suffix="TC" />
                            <Statistic title="Còn thiếu (chưa xếp)" value={overview.remainingCredits} suffix="TC" />
                            <Statistic
                                title="Nhịp đã học"
                                value={overview.averagePerSemester !== null ? overview.averagePerSemester.toFixed(1) : '—'}
                                suffix={overview.averagePerSemester !== null ? `TC/kỳ · ${overview.elapsedSemesters} kỳ` : undefined}
                            />
                            <Statistic
                                title="Cần để tốt nghiệp đúng hạn"
                                value={overview.neededPerSemester !== null ? overview.neededPerSemester.toFixed(1) : '—'}
                                suffix={overview.neededPerSemester !== null ? `TC/kỳ · ${overview.semestersLeft} kỳ` : undefined}
                            />
                            <Statistic
                                title="Dự kiến tốt nghiệp"
                                value={analysis.projectedGraduation ? `HK ${analysis.projectedGraduation}` : 'Chưa xác định'}
                                suffix={<Text type={lateGraduation ? 'danger' : 'secondary'} style={{ fontSize: 13 }}>chuẩn HK {analysis.standardGraduation}</Text>}
                            />
                        </div>
                    </div>
                    <div style={{ marginTop: 20 }}>
                        <StackedBar
                            title="Tổng tín chỉ chuẩn tốt nghiệp"
                            height={18}
                            total={overview.totalCredits}
                            segments={[
                                { key: 'done', value: overview.completedCredits },
                                { key: 'inProgress', value: overview.inProgressCredits },
                                { key: 'planned', value: overview.plannedCredits },
                            ]}
                        />
                        <div style={{ marginTop: 8 }}><Legend keys={['done', 'inProgress', 'planned', 'remaining']} /></div>
                    </div>
                </Card>

                {/* ----------------------------- Biểu đồ ----------------------------- */}
                <div className="analysis-grid">
                    <Card title="Tiến độ theo khối kiến thức" size="small">
                        <BlockBars
                            rows={analysis.blocks.filter(block => block.needCredits > 0).map(block => ({
                                key: block.key,
                                label: block.name,
                                hint: block.kind === 'required'
                                    ? `${block.doneCount}/${block.needCount} môn`
                                    : block.kind === 'any'
                                        ? 'Chọn môn bất kỳ'
                                        : `Chọn ${block.needCount} môn · đã tính ${block.doneCount}`,
                                total: block.needCredits,
                                segments: [
                                    { key: 'done', value: block.done },
                                    { key: 'inProgress', value: block.inProgress },
                                    { key: 'planned', value: block.planned },
                                ],
                                valueText: `${block.done}/${block.needCredits} TC`,
                            }))}
                        />
                    </Card>

                    <Card title="Theo khung chương trình (môn bắt buộc)" size="small">
                        {analysis.timeline.length ? (
                            <>
                                <ColumnChart
                                    columns={analysis.timeline.map(column => ({
                                        key: column.code,
                                        label: column.label,
                                        sublabel: column.code,
                                        highlight: column.isCurrent,
                                        segments: [
                                            { key: 'done', value: column.done },
                                            { key: 'inProgress', value: column.inProgress },
                                            { key: 'planned', value: column.planned },
                                            { key: 'remaining', value: column.remaining },
                                        ],
                                        tooltip: column.isPast && column.remaining > 0
                                            ? <div style={{ marginTop: 4 }}>⚠ Kỳ đã qua còn {column.remaining} TC chưa học/chưa xếp</div>
                                            : undefined,
                                    }))}
                                />
                                <div style={{ marginTop: 8 }}><Legend keys={['done', 'inProgress', 'planned', 'remaining']} /></div>
                                <Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 12 }}>
                                    Mỗi cột là một học kỳ theo khung (N = năm, K = kỳ) quy ra học kỳ thực theo năm nhập học; cột tô nền là kỳ hiện tại.
                                    Phần xám ở các cột bên trái kỳ hiện tại là môn đang bị chậm.
                                </Paragraph>
                            </>
                        ) : <Empty description="Chương trình chưa xếp kỳ khuyến nghị cho môn nào." />}
                    </Card>
                </div>

                {/* ----------------------------- Cảnh báo ----------------------------- */}
                <Card title={`Cảnh báo & lưu ý (${analysis.warnings.length})`} size="small">
                    {analysis.warnings.length ? (
                        <div className="stack" style={{ gap: 8 }}>
                            {analysis.warnings.map((warning, index) => (
                                <Alert
                                    key={`${index}-${warning.title}`}
                                    type={WARNING_UI[warning.level].type}
                                    showIcon
                                    icon={WARNING_UI[warning.level].icon}
                                    title={warning.title}
                                    description={warning.detail}
                                />
                            ))}
                        </div>
                    ) : <Alert type="success" showIcon title="Không phát hiện vấn đề nào trong dữ liệu hiện tại." />}
                </Card>

                {/* ----------------------------- Môn còn thiếu ----------------------------- */}
                <Card title="Môn còn thiếu" size="small">
                    <Tabs
                        items={[
                            {
                                key: 'overdue',
                                label: `Quá kỳ khuyến nghị (${analysis.overdue.length})`,
                                children: <CheckTable rows={analysis.overdue} analysis={analysis} empty="Không có môn bắt buộc nào bị chậm." />,
                            },
                            {
                                key: 'required',
                                label: `Bắt buộc còn lại (${analysis.requiredLeft.length})`,
                                children: <CheckTable rows={analysis.requiredLeft} analysis={analysis} empty="Đã xong mọi môn bắt buộc." />,
                            },
                            {
                                key: 'electives',
                                label: `Tự chọn còn thiếu (${electiveNeedCount} môn)`,
                                children: analysis.electives.length ? (
                                    <div className="stack">
                                        {analysis.electives.map(option => (
                                            <Paragraph key={option.group.id} style={{ margin: 0 }}>
                                                <Text strong>{option.group.name}</Text>: còn {option.block.remainingCount} môn
                                                {' '}({Math.max(0, option.block.needCredits - option.block.done - option.block.inProgress)} TC)
                                                {' '}— {option.candidates.length} môn để chọn. Xem chi tiết ở mục “Các lựa chọn”.
                                            </Paragraph>
                                        ))}
                                        {analysis.blocks.filter(block => block.kind === 'any' && block.remaining > 0).map(block => (
                                            <Paragraph key={block.key} style={{ margin: 0 }}>
                                                <Text strong>{block.name}</Text>: còn {block.remaining} TC, chọn môn bất kỳ (kể cả ngoài chương trình).
                                            </Paragraph>
                                        ))}
                                    </div>
                                ) : <Empty description="Đã đủ các khối tự chọn." />,
                            },
                            {
                                key: 'failed',
                                label: `Chưa đạt (${analysis.failed.length})`,
                                children: analysis.failed.length
                                    ? <Space wrap>{analysis.failed.map(course => <Tag key={course.id} color="red">{course.code} · {course.name}</Tag>)}</Space>
                                    : <Empty description="Không có môn chưa đạt." />,
                            },
                        ]}
                    />
                </Card>

                {/* ----------------------------- Lựa chọn ----------------------------- */}
                <Card title="Các lựa chọn" size="small">
                    <div className="stack">
                        {analysis.specializations.length > 0 && (
                            <div>
                                <Text strong>Chuyên ngành (không bắt buộc)</Text>
                                <Paragraph type="secondary" style={{ margin: '4px 0 12px', fontSize: 12 }}>
                                    Đạt chuyên ngành khi các môn tự chọn của khối gốc đều thuộc danh sách chuyên ngành. Thanh thể hiện số môn đã học/đang học trong danh sách.
                                </Paragraph>
                                <BlockBars
                                    rows={analysis.specializations.map(option => ({
                                        key: option.specialization.id,
                                        label: (
                                            <span>
                                                {option.specialization.code}
                                                {option.isTarget && <Tag color="gold" style={{ marginLeft: 6 }}>Mục tiêu</Tag>}
                                            </span>
                                        ),
                                        hint: (
                                            <span>
                                                {option.specialization.name}
                                                {' · '}
                                                {option.achievable
                                                    ? <Text type="success" style={{ fontSize: 12 }}>còn khả thi</Text>
                                                    : <Text type="danger" style={{ fontSize: 12 }}>
                                                        {option.outsideList.length
                                                            ? `đã học ngoài danh sách: ${option.outsideList.map(course => course.code).join(', ')}`
                                                            : 'không đủ môn còn lại'}
                                                    </Text>}
                                            </span>
                                        ),
                                        total: option.need,
                                        segments: [{ key: 'done', value: option.doneInList }],
                                        valueText: `${option.doneInList}/${option.need} môn`,
                                    }))}
                                />
                            </div>
                        )}

                        {analysis.electives.map(option => (
                            <div key={option.group.id}>
                                <Text strong>{option.group.name}</Text>
                                <Text type="secondary"> — còn chọn {option.block.remainingCount} môn trong {option.candidates.length} môn</Text>
                                <div style={{ marginTop: 8 }}>
                                    <CheckTable rows={option.candidates} analysis={analysis} empty="Không còn môn để chọn." showGroup />
                                </div>
                            </div>
                        ))}
                        {analysis.electives.length === 0 && analysis.specializations.length === 0 && (
                            <Empty description="Không còn khối tự chọn nào cần chọn." />
                        )}
                    </div>
                </Card>

                {/* ----------------------------- Học kỳ tới ----------------------------- */}
                <div className="analysis-grid">
                    <Card title={`Có thể đăng ký ở ${semesterLabel(analysis.next)}`} size="small">
                        <Paragraph type="secondary" style={{ marginTop: 0, fontSize: 12 }}>
                            Môn còn cần học, đã đủ tiên quyết/học trước (coi môn đang học là sẽ đạt) và không bị ghi nhận là chưa từng mở ở kỳ {analysis.next.at(-1)}.
                        </Paragraph>
                        {analysis.eligibleNext.length ? (
                            <Space wrap size={[6, 6]}>
                                {analysis.eligibleNext.map(check => (
                                    <Tooltip
                                        key={check.course.id}
                                        title={`${check.course.name} · ${check.course.credits} TC${check.course.recommendedLabel ? ` · ${check.course.recommendedLabel}` : ' · tự chọn'}`}
                                    >
                                        <Tag color={check.overdue ? 'red' : check.course.groupId ? 'geekblue' : 'blue'}>
                                            <Link to={`/courses/${encodeURIComponent(check.course.code)}`}>{check.course.code}</Link>
                                            {' '}· {check.course.credits} TC
                                        </Tag>
                                    </Tooltip>
                                ))}
                            </Space>
                        ) : <Empty description="Không có môn nào đủ điều kiện." />}
                        <div className="hint" style={{ marginTop: 8 }}>Đỏ: môn bắt buộc quá hạn · Xanh đậm: môn tự chọn · Xanh: môn bắt buộc.</div>
                    </Card>

                    <Card title="Môn “nút thắt” (mở khóa nhiều môn nhất)" size="small">
                        {analysis.bottlenecks.length ? (
                            <BlockBars
                                rows={analysis.bottlenecks.map(item => ({
                                    key: item.course.id,
                                    label: courseLink(item.course.code),
                                    hint: item.course.name,
                                    total: analysis.bottlenecks[0].unlocks.length,
                                    segments: [{ key: item.course.status === 'in-progress' ? 'inProgress' : 'remaining', value: item.unlocks.length }],
                                    valueText: (
                                        <Tooltip title={`Mở khóa: ${item.unlocks.join(', ')}`}>
                                            <span>{item.unlocks.length} môn</span>
                                        </Tooltip>
                                    ),
                                }))}
                            />
                        ) : <Empty description="Chương trình chưa có quan hệ tiên quyết/học trước, hoặc bạn đã học hết các môn điều kiện." />}
                    </Card>
                </div>

                {analysis.blockedNext.length > 0 && (
                    <Card title={`Chưa đủ điều kiện đăng ký (${analysis.blockedNext.length})`} size="small">
                        <CheckTable rows={analysis.blockedNext} analysis={analysis} empty="" />
                    </Card>
                )}

                {/* ----------------------------- Lộ trình ----------------------------- */}
                <Card title="Lộ trình đề xuất đến tốt nghiệp" size="small">
                    <Paragraph type="secondary" style={{ marginTop: 0, fontSize: 12 }}>
                        Giữ nguyên các môn bạn đã xếp kỳ, rồi tự xếp môn còn thiếu theo thứ tự khung chương trình, tiên quyết, lịch mở lớp các năm trước
                        và tối đa {overview.capacity} TC/kỳ{overview.capacity !== curriculum.max_semester_credits ? ' (theo mục tiêu tín chỉ trong hồ sơ)' : ''}.
                        Môn tự chọn ưu tiên môn đã lên kế hoạch, môn của chuyên ngành mục tiêu và môn hay mở lớp. Không xếp kỳ hè.
                        {analysis.outlineCoverage.withOutline > 0 && ' Số giờ mỗi kỳ là tổng giờ học tập trong đề cương của các môn có đề cương.'}
                    </Paragraph>
                    {analysis.roadmap.length ? (
                        <div className="stack">
                            <ColumnChart
                                columns={analysis.roadmap.map(semester => ({
                                    key: semester.code,
                                    label: `HK ${semester.code}`,
                                    highlight: semester.code > analysis.standardGraduation,
                                    segments: [
                                        { key: 'planned', value: semester.items.filter(item => item.fromPlan).reduce((t, item) => t + item.credits, 0) },
                                        { key: 'suggested', value: semester.items.filter(item => !item.fromPlan).reduce((t, item) => t + item.credits, 0) },
                                    ],
                                    tooltip: semester.code > analysis.standardGraduation
                                        ? <div style={{ marginTop: 4 }}>Sau mốc tốt nghiệp chuẩn</div>
                                        : undefined,
                                }))}
                                references={[
                                    { value: curriculum.max_semester_credits, label: `Tối đa ${curriculum.max_semester_credits}` },
                                    { value: curriculum.min_semester_credits, label: `Tối thiểu ${curriculum.min_semester_credits}` },
                                ]}
                            />
                            <Legend keys={['planned', 'suggested']} />
                            <div className="roadmap">
                                {analysis.roadmap.map(semester => (
                                    <div key={semester.code} className="roadmap-semester">
                                        <div className="roadmap-semester-head">
                                            <Text strong>HK {semester.code}</Text>
                                            <Tooltip
                                                title={semester.hoursKnown
                                                    ? `Tổng giờ học tập theo đề cương của ${semester.hoursKnown}/${semester.items.length} môn có đề cương${semester.heavyCount ? `; ${semester.heavyCount} môn có thí nghiệm/đồ án` : ''}`
                                                    : undefined}
                                            >
                                                <Text type="secondary">
                                                    {semester.credits} TC{semester.hoursKnown ? ` · ≈ ${semester.studyHours} giờ` : ''}
                                                </Text>
                                            </Tooltip>
                                        </div>
                                        {semester.items.map(item => (
                                            <div key={item.key} className="roadmap-item">
                                                <span>
                                                    {item.code !== '—' ? courseLink(item.code) : null}{' '}
                                                    <Text type={item.kind === 'free' ? 'secondary' : undefined}>{item.name}</Text>
                                                    {item.fromPlan && <Tag color="gold" style={{ marginLeft: 4 }}>KH</Tag>}
                                                    {item.groupName && item.kind === 'elective' && <div className="hint">{item.groupName}</div>}
                                                </span>
                                                <Text type="secondary" style={{ whiteSpace: 'nowrap' }}>{item.credits} TC</Text>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <Empty description={overview.remainingCredits === 0 && overview.inProgressCredits === 0 ? 'Bạn đã đủ tín chỉ tốt nghiệp.' : 'Không còn môn nào để xếp.'} />
                    )}
                    {analysis.unplaced.length > 0 && (
                        <Alert
                            style={{ marginTop: 12 }}
                            type="warning"
                            showIcon
                            title={`${analysis.unplaced.length} môn chưa xếp được`}
                            description={`${analysis.unplaced.map(course => course.code).join(', ')} — vướng điều kiện tiên quyết vòng tròn hoặc thiếu dữ liệu. Kiểm tra lại quan hệ môn.`}
                        />
                    )}
                </Card>

                {analysis.regulationCount > 0 && (
                    <Card title="Điều kiện tốt nghiệp khác" size="small" extra={<Link to="/regulations">Cập nhật</Link>}>
                        {analysis.unmetRegulations.length ? (
                            <Space direction="vertical" size={4}>
                                {analysis.unmetRegulations.map(regulation => (
                                    <Text key={regulation.id}><LuCircleAlert style={{ verticalAlign: -2, marginRight: 6 }} />{regulation.name}</Text>
                                ))}
                            </Space>
                        ) : <Text type="success"><LuCircleCheck style={{ verticalAlign: -2, marginRight: 6 }} />Đã đạt mọi điều kiện ({analysis.regulationCount}).</Text>}
                    </Card>
                )}
            </div>
        </section>
    );
};

export default AnalysisPage;
