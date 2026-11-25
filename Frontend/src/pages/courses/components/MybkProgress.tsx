import { type ReactNode, useMemo, useState } from 'react';
import { Alert, Input, Modal, Select, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import {
    PiArrowsClockwise, PiCheck, PiClipboardText, PiFileArrowUp, PiFileMagnifyingGlass, PiFilePdf, PiListChecks,
    PiMagnifyingGlass, PiPencilSimple, PiPencilSimpleLine,
} from 'react-icons/pi';
import {
    CollapsibleGroup, CourseCode, CourseOption, CourseStatus, CourseStatusSelect, CreditLabel, DiffFlag, Disclosure,
    EmptyState, EmptyTableLine, FileMark, IconBtn, ISolidBtn, ITextBtn, KpiCount, LabeledSwitch, LoadWarning,
    MetaSep, ModalTitle, NoteBox, NoteTrigger, PageLoading, ProgressThread, RowItem, RowList, SectionLabel, SourceBadge,
    StepList, TextTag, UploadZone,
} from '@/components';
import { listCourses } from '@/apis/course';
import { adjustMybk, getMybkProgress, importMybk, reviewMybk } from '@/apis/planner';
import { listCourseGroups } from '@/apis/curriculum';
import { getMyProfile, listMyCourses } from '@/apis/student';
import { useApiMutation, useApiQuery, useDebounce } from '@/hooks';
import { semesterLabel } from '@/utils/semester';
import {
    STUDENT_COURSE_STATUS_LABEL,
    type CourseSummary,
    type MybkAdjustPayload,
    type MybkImportResult,
    type MybkProgress,
    type MybkProgressBlock,
    type MybkProgressCourse,
    type MybkProgressData,
    type MybkReview,
    type StudentCourseStatus,
} from '@/types';
import { toastMessage } from '@/utils/toast';
import { RegulationList } from './RegulationList';
import i18n from '@/i18n';
import { trLive } from '@/i18n/live';

const { Text } = Typography;

const MYBK_PROGRESS_KEY = ['mybk-progress'];

const KIND_LABEL: Record<string, string> = trLive({ BB: 'Bắt buộc', TC: 'Tự chọn', NGOAICTDT: 'Ngoài chương trình' });
/** Conflicts between the file and the web are problems (terracotta, ui caveat 25/11); info stays info. */
const LEVEL_TYPE = { error: 'error', warning: 'error', info: 'info' } as const;
const isStatus = (value: string | null): value is StudentCourseStatus => !!value && value in STUDENT_COURSE_STATUS_LABEL;

/** yyyy-mm-dd -> dd/mm/yyyy như myBK ghi. */
const viDate = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const dash = (v: string | null | undefined) => v ?? '—';

/* ------------------------------ Hiện nội dung file ------------------------------ */

/**
 * Trạng thái trên web của từng mã môn (bảng `student_courses`) và phần đang sửa ở chế độ Hiệu chỉnh.
 * `ids`: các môn web đổi cùng lúc (dòng CCGDTC của file = PE1003 + PE1005).
 */
export type WebStatusView = {
    byCode: Map<string, { course_id: string; ids: string[]; status: StudentCourseStatus }>;
    editing: boolean;
    draft: Map<string, StudentCourseStatus>; // course_id -> trạng thái mới
    setStatus: (courseIds: string[], status: StudentCourseStatus) => void;
    remove: (courseId: string) => void;
    /** Ghi chú riêng của sinh viên theo mã môn (đã lưu + đang sửa). */
    notes: Map<string, string>;
    setNote: (code: string, note: string) => void;
    /** Row whose note box is open (code), at most one at a time. */
    openNote: string | null;
    setOpenNote: (code: string | null) => void;
    /** T46: khối của chương trình để chọn, khối sinh viên đã chọn theo mã môn, và hàm chọn (null = mặc định). */
    blocks: BlockPicker;
};

type BlockPicker = {
    groups: { id: string; name: string }[];
    choices: Map<string, string>;
    choose: (code: string, groupId: string | null) => void;
};

const DEFAULT_BLOCK = '__default__';
/** Khối Bắt buộc do backend suy ra (không có dòng trong course_groups), id cố định như backend `REQUIRED_BLOCK`. */
const REQUIRED_BLOCK = trLive({ id: 'required', name: 'Bắt buộc' });

/**
 * Ô "Tính vào khối" (T46, 22/11). Người duyệt: thông tin là của sinh viên nên sinh viên sửa được khối của mọi môn
 * (đã học, đang học, chưa học, trong hay ngoài CTĐT); web chỉ nhắc là có thể khác cách tính của myBK.
 */
const BlockCell = ({ code, defaultLabel, editing, picker }: {
    code: string; defaultLabel: string; editing: boolean; picker: BlockPicker;
}) => {
    const groups = [REQUIRED_BLOCK, ...picker.groups];
    const nameOf = (id: string) => groups.find(g => g.id === id)?.name ?? i18n.t('Khối không còn trong chương trình');
    const chosen = picker.choices.get(code);
    // Tên khối myBK (vd "Toán") khác tên khối database, nên mọi lựa chọn riêng đều nhắc (thay nhãn "Bạn chọn" cũ).
    const note = chosen !== undefined ? <Tag color="warning">{i18n.t('Có thể khác cách tính của myBK')}</Tag> : null;
    if (!editing) return <div className="cell-stack"><span>{chosen ? nameOf(chosen) : defaultLabel}</span>{note}</div>;
    return (
        <div className="cell-stack">
            <Select
                style={{ width: '100%' }} value={chosen ?? DEFAULT_BLOCK} showSearch optionFilterProp="label"
                aria-label={i18n.t('Khối của {{code}}', { code: code })}
                options={[{ value: DEFAULT_BLOCK, label: `Theo myBK: ${defaultLabel}` }, ...groups.map(g => ({ value: g.id, label: g.name }))]}
                onChange={(value: string) => confirmThen(
                    value === DEFAULT_BLOCK ? i18n.t('Tính {{code}} theo khối của myBK ({{defaultLabel}})?', { code: code, defaultLabel: defaultLabel }) : i18n.t('Tính {{code}} vào khối "{{v1}}"?', { code: code, v1: nameOf(value) }),
                    () => picker.choose(code, value === DEFAULT_BLOCK ? null : value),
                )}
            />
            {note}
        </div>
    );
};

const fileStatus = (passed: boolean): StudentCourseStatus => (passed ? 'completed' : 'not-started');

/** GDTC: người duyệt 21/11 không hiện mã (CCGDTC, PE1003, PE1005), chỉ nói Giáo dục thể chất đạt hay chưa. */
const GDTC_FILE_CODE = 'CCGDTC';
const GDTC_WEB_CODES = ['PE1003', 'PE1005'];

/** Hộp xác nhận cho mỗi lần đổi trạng thái hoặc xóa ở chế độ Hiệu chỉnh (người duyệt 21/11). */
const confirmThen = (title: string, action: () => void) => {
    Modal.confirm({ title, okText: i18n.t('Đồng ý'), cancelText: i18n.t('Hủy'), icon: null, onOk: action });
};
const rowLabel = (row: MybkProgressCourse) => (row.code === GDTC_FILE_CODE ? i18n.t('Giáo dục thể chất') : row.code);

/** Web status differs from the file's ✓ / -- (outside-file rows never differ). */
const differsFromFile = (row: MybkProgressCourse, web?: WebStatusView) => {
    if (!web || row.outside_file) return false;
    const entry = web.byCode.get(row.code);
    if (!entry) return false;
    return (web.draft.get(entry.course_id) ?? entry.status) !== fileStatus(row.passed);
};

/**
 * Cột bảng môn (ui-template/data-display.html, course table). Người duyệt 21/11: frontend **không hiện điểm**
 * (điểm số, điểm chữ vẫn lưu trong JSON). Có `web` thì thêm cột "Trên web" (trạng thái đang lưu; chế độ sửa là ô chọn)
 * và cờ "Khác file tiến độ" khi khác ✓/-- của file.
 */
const courseColumns = (web?: WebStatusView, withCredits = true, blockLabel?: string): ColumnsType<MybkProgressCourse> => [
    {
        title: i18n.t('Mã môn'), dataIndex: 'code', key: 'code', width: 110,
        render: (code: string) => (code === GDTC_FILE_CODE ? '' : <CourseCode>{code}</CourseCode>),
    },
    {
        title: i18n.t('Tên học phần'), dataIndex: 'name', key: 'name',
        render: (name: string | null, row) => (row.code === GDTC_FILE_CODE ? i18n.t('Giáo dục thể chất') : dash(name)),
    },
    ...(withCredits ? [{
        title: i18n.t('Tín chỉ'), dataIndex: 'credits', key: 'credits', width: 80,
        render: (credits: number | null) => <Text type="secondary">{credits ?? '—'}{' '}{i18n.t('TC')}</Text>,
    }] : []),
    {
        title: 'File', dataIndex: 'passed', key: 'passed', width: 64,
        render: (passed: boolean, row) => (row.outside_file ? <Text type="secondary">—</Text> : <FileMark passed={passed} />),
    },
    ...(web ? [{
        title: i18n.t('Trên web'),
        key: 'web',
        width: 190,
        render: (_v: unknown, row: MybkProgressCourse) => {
            const entry = web.byCode.get(row.code);
            if (!entry) return <Text type="secondary">—</Text>;
            const shown = web.draft.get(entry.course_id) ?? entry.status;
            if (!web.editing) return <CourseStatus status={shown} />;
            return (
                <div className="cell-stack">
                    <CourseStatusSelect
                        style={{ width: 170 }} value={shown} aria-label={i18n.t('Trạng thái {{v0}}', { v0: rowLabel(row) })}
                        onChange={value => confirmThen(
                            i18n.t('Đổi {{v0}} sang "{{v1}}"?', { v0: rowLabel(row), v1: STUDENT_COURSE_STATUS_LABEL[value] }),
                            () => web.setStatus(entry.ids, value),
                        )}
                    />
                    {row.outside_file && (
                        <ITextBtn
                            size="small" color="danger"
                            onClick={() => confirmThen(i18n.t('Xóa {{code}} khỏi tiến độ trên web?', { code: row.code }), () => web.remove(entry.course_id))}
                        >
                            {i18n.t('Xóa khỏi tiến độ')}
                        </ITextBtn>
                    )}
                </div>
            );
        },
    }] : []),
    // T46: khối môn được tính; GDTC không tính tín chỉ nên không có ô.
    ...(web && blockLabel ? [{
        title: i18n.t('Tính vào khối'),
        key: 'block',
        width: 240,
        render: (_v: unknown, row: MybkProgressCourse) => (row.code === GDTC_FILE_CODE
            ? <Text type="secondary">—</Text>
            : <BlockCell code={row.code} defaultLabel={blockLabel} editing={web.editing} picker={web.blocks} />),
    }] : []),
    {
        // Ghi chú riêng của sinh viên (22/11); ghi chú trong file myBK (nếu có) hiện chữ xám bên dưới.
        title: web ? i18n.t('Đối chiếu / Ghi chú') : i18n.t('Ghi chú'), key: 'note', width: web ? 230 : undefined,
        render: (_v: unknown, row: MybkProgressCourse) => {
            const own = web?.notes.get(row.code) ?? '';
            return (
                <div className="cell-stack">
                    {differsFromFile(row, web) && <DiffFlag />}
                    {web?.editing
                        ? <NoteTrigger note={own} onClick={() => web.setOpenNote(web.openNote === row.code ? null : row.code)} />
                        : own && <Text style={{ whiteSpace: 'pre-wrap' }}>{own}</Text>}
                    {row.note && <Text type="secondary" style={{ fontSize: 12 }}>myBK: {row.note}</Text>}
                </div>
            );
        },
    },
];

/** Course table of one group; in edit mode a row expands into its note box. */
const CourseTable = ({ rows, web, withCredits = true, blockLabel }: {
    rows: MybkProgressCourse[]; web?: WebStatusView; withCredits?: boolean; blockLabel?: string;
}) => (
    <Table<MybkProgressCourse>
        rowKey="code" pagination={false} scroll={{ x: 760 }} dataSource={rows}
        columns={courseColumns(web, withCredits, blockLabel)}
        rowClassName={row => (differsFromFile(row, web) ? 'is-diff' : '')}
        locale={{ emptyText: <EmptyTableLine>{i18n.t('Không có môn nào.')}</EmptyTableLine> }}
        expandable={web?.editing ? {
            showExpandColumn: false,
            expandedRowKeys: web.openNote ? [web.openNote] : [],
            expandedRowRender: row => (
                <NoteBox
                    key={row.code} code={rowLabel(row)} initial={web.notes.get(row.code) ?? ''}
                    onClose={() => web.setOpenNote(null)}
                    onSave={(note) => {
                        if (note === (web.notes.get(row.code) ?? '')) { web.setOpenNote(null); return; }
                        confirmThen(note ? i18n.t('Lưu ghi chú cho {{v0}}?', { v0: rowLabel(row) }) : i18n.t('Xóa ghi chú của {{v0}}?', { v0: rowLabel(row) }), () => {
                            web.setNote(row.code, note);
                            web.setOpenNote(null);
                        });
                    }}
                />
            ),
        } : undefined}
    />
);

/** Group header meta: "earned/required · Bắt buộc" (elective in rose). */
const blockMeta = (block: MybkProgressBlock) => (
    <>
        <CreditLabel earned={block.earned_credits} required={block.required_credits} />
        <MetaSep />
        <TextTag tone={block.kind === 'TC' ? 'rose' : 'muted'}>{KIND_LABEL[block.kind] ?? block.kind}</TextTag>
    </>
);

/**
 * Nội dung file (trừ điểm): thông tin sinh viên + tiến độ tích lũy (hai cột), rồi từng khối (nhóm thu gọn), điều kiện
 * tốt nghiệp. Có `web` thì thêm cột "Trên web" và (`extra`) nhóm "Môn ngoài chương trình đào tạo"; `onlyUnpassed` lọc
 * môn chưa đạt theo file. `summary`: thêm dòng ở cột phải (học kỳ hiện tại, đang học); `header`: phần nằm giữa
 * thông tin và các nhóm (khung Hiệu chỉnh).
 */
const MybkFileDetails = ({ data, importedAt, web, extra = [], onlyUnpassed = false, summary, header, regulations }: {
    data: MybkProgressData; importedAt?: string | null; web?: WebStatusView;
    extra?: MybkProgressCourse[]; onlyUnpassed?: boolean; summary?: ReactNode; header?: ReactNode;
    /** Curriculum regulations with their "đã đạt" switches, shown under the file's conditions. */
    regulations?: ReactNode;
}) => {
    const s = data.student;
    const keep = (rows: MybkProgressCourse[]) => (onlyUnpassed ? rows.filter(r => !r.passed) : rows);
    const conditions = keep(data.graduation_conditions ?? []);
    const blocks = data.blocks.map(block => ({ ...block, courses: keep(block.courses) }))
        .filter(block => !onlyUnpassed || block.courses.length);
    const percent = data.total_required ? (data.total_earned / data.total_required) * 100 : 0;
    return (
        <>
            <div className="info-panel">
                <div>
                    <SectionLabel>{i18n.t('Thông tin sinh viên')}</SectionLabel>
                    <RowList>
                        <RowItem label={i18n.t('Họ và tên')} value={dash(s?.full_name)} />
                        <RowItem label={i18n.t('MSSV')} value={dash(s?.student_number)} />
                        <RowItem label={i18n.t('Mã lớp')} value={dash(s?.class_code)} />
                        <RowItem label={i18n.t('Khoa')} value={dash(s?.faculty)} />
                        <RowItem label={i18n.t('Ngành')} value={[data.specialization, data.official_program_code].filter(Boolean).join(' - ') || '—'} />
                        <RowItem label={i18n.t('Áp dụng từ năm')} value={dash(s?.applied_from_year)} />
                    </RowList>
                </div>
                <div>
                    <SectionLabel>{i18n.t('Tiến độ tích lũy')}</SectionLabel>
                    <KpiCount value={data.total_earned} suffix={i18n.t('/ {{total_required}} TC', { total_required: data.total_required })} />
                    <ProgressThread percent={percent} label={i18n.t('Tín chỉ tích lũy')} />
                    <div className="info-panel-rows">
                        <RowList>
                            <RowItem label={i18n.t('Cập nhật lần cuối (myBK)')} value={viDate(data.updated_at)} />
                            {importedAt !== undefined && <RowItem label={i18n.t('Nhập vào web')} value={viDate(importedAt)} />}
                            {summary}
                        </RowList>
                    </div>
                </div>
            </div>
            {header}
            <div className="course-groups">
                {blocks.map((block, index) => (
                    <CollapsibleGroup
                        key={`block-${index}`} defaultOpen={false} title={block.name}
                        met={block.earned_credits >= block.required_credits} meta={blockMeta(block)}
                    >
                        <CourseTable rows={block.courses} web={web} blockLabel={block.name} />
                    </CollapsibleGroup>
                ))}
                {(conditions.length > 0 || regulations) && (
                    <CollapsibleGroup defaultOpen={false} title={i18n.t('Điều kiện tốt nghiệp')} met={conditions.every(c => c.passed)}>
                        {conditions.length > 0 && <CourseTable rows={conditions} web={web} withCredits={false} />}
                        {regulations && (
                            <div className="regulations-in-group">
                                <SectionLabel>{i18n.t('Quy định của chương trình')}</SectionLabel>
                                {regulations}
                            </div>
                        )}
                    </CollapsibleGroup>
                )}
                {extra.length > 0 && (
                    <CollapsibleGroup defaultOpen={false} title={i18n.t('Môn ngoài chương trình đào tạo')}>
                        <CourseTable rows={extra} web={web} blockLabel={i18n.t(OUTSIDE_DEFAULT)} />
                    </CollapsibleGroup>
                )}
            </div>
        </>
    );
};

/* ------------------------------ Hộp xác nhận (T32) ------------------------------ */

/** One side of a status change: the glyph label when it is a known status, otherwise plain text. */
const statusText = (value: string | null, empty: string) => (isStatus(value)
    ? <CourseStatus status={value} />
    : <Text type="secondary">{value ?? empty}</Text>);

/**
 * Mã CTĐT myBK trong file là gốc: tài khoản luôn theo chương trình của file (người duyệt 21/11), không có ô chọn.
 * Mã nội bộ của web (vd CS-2023-KHMT) không hiện cho người dùng. Bố cục: feedback.html, "Review after reading the file".
 */
const MybkReviewContent = ({ review }: { review: MybkReview }) => {
    const { program, conflicts, equivalents, status_changes: changes } = review;
    const matched = program.matched;
    const problems = conflicts.filter(c => c.level !== 'info');
    return (
        <div className="stack">
            <RowList>
                <RowItem label={i18n.t('Mã CTĐT (myBK)')} value={dash(program.official_program_code)} chip />
                <RowItem
                    label={i18n.t('Chương trình trên web')}
                    value={matched
                        ? i18n.t('{{name}} (khóa {{cohort}}, {{v2}} TC, {{course_count}} môn; phiên bản {{v4}})', { name: matched.name, cohort: matched.cohort, v2: matched.total_credits ?? '?', course_count: matched.course_count, v4: dash(matched.source_version) })
                        : i18n.t('Không tìm thấy chương trình mang mã này')}
                />
                <RowItem
                    label={i18n.t('Tài khoản đang theo')}
                    value={(
                        <>
                            {program.profile ? dash(program.profile.source_code ?? program.profile.name) : i18n.t('Chưa có')}
                            {program.same_as_profile && <Tag color="success" style={{ marginInlineStart: 8, marginInlineEnd: 0 }}>{i18n.t('Khớp file')}</Tag>}
                        </>
                    )}
                />
            </RowList>

            {problems.length === 0 && <Alert type="success" showIcon title={i18n.t('Không thấy mâu thuẫn giữa file và chương trình trên web.')} />}
            {conflicts.map(c => (
                <Alert key={c.id} type={LEVEL_TYPE[c.level]} showIcon title={c.title}
                    description={c.codes?.length ? c.codes.join(', ') : undefined} />
            ))}
            {equivalents.map(eq => (
                <Alert key={eq.file_code} type="info" showIcon title={i18n.t('Giáo dục thể chất: {{v0}}', { v0: eq.passed ? 'Đạt' : 'Chưa đạt' })} />
            ))}

            {review.has_previous_import ? (
                <div>
                    <SectionLabel>{i18n.t('Trạng thái môn sẽ đổi khi xác nhận (')}{changes.length})</SectionLabel>
                    {changes.length ? (
                        <table className="diff-mini-table">
                            <tbody>
                                {changes.map(change => (
                                    <tr key={change.code}>
                                        <td><CourseCode>{change.code}</CourseCode> · {change.name}</td>
                                        <td>
                                            <span className="status-change">
                                                {statusText(change.web, i18n.t('Chưa khai'))}
                                                <span aria-label={i18n.t('thành')}>→</span>
                                                {statusText(change.file, i18n.t('Chưa học (file không có)'))}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : <Text type="secondary">{i18n.t('Không môn nào đổi trạng thái.')}</Text>}
                </div>
            ) : (
                <Text>{i18n.t('Lần đầu tải file: sẽ ghi trạng thái')}{' '}{changes.length}{' '}{i18n.t('môn đúng như file.')}</Text>
            )}

            <CollapsibleGroup defaultOpen={false} title={i18n.t('Toàn bộ thông tin đọc được từ file')}>
                <MybkFileDetails data={review.file} />
            </CollapsibleGroup>
        </div>
    );
};

/** Hướng dẫn hai cách nhập (người duyệt 21/11): PDF phải lưu bằng "Lưu dưới dạng PDF", hoặc dán cả trang. */
const PdfGuide = () => (
    <p className="modal-prose">
        {i18n.t('Trên myBK mở')}{' '}<strong>{i18n.t('Tiến độ hoàn thành chương trình đào tạo')}</strong>{i18n.t(', bấm')}{' '}<strong>{i18n.t('Cập nhật')}</strong>{' '}{i18n.t('để lấy số mới nhất. Bấm')}{' '}<strong>In</strong>{i18n.t('. Ở ô')}{' '}<strong>{i18n.t('Máy in đích')}</strong>{' '}{i18n.t('chọn')}{' '}<strong>{i18n.t('Lưu dưới dạng PDF')}</strong>{i18n.t('. Lưu file rồi chọn file đó ở đây.')}
    </p>
);

const PasteGuide = () => (
    <StepList>
        <li><span>{i18n.t('Trên máy tính, mở myBK trang')}{' '}<strong>{i18n.t('Tiến độ hoàn thành chương trình đào tạo')}</strong>{i18n.t(', bấm')}{' '}<strong>{i18n.t('Cập nhật')}</strong>.</span></li>
        <li><span>{i18n.t('Bấm')}{' '}<code>Ctrl+A</code>{' '}{i18n.t('rồi')}{' '}<code>Ctrl+C</code>.</span></li>
        <li><span>{i18n.t('Dán vào ô dưới (')}<code>Ctrl+V</code>{i18n.t(') rồi bấm')}{' '}<strong>{i18n.t('Đọc nội dung')}</strong>.</span></li>
        <li>
            <span>
                {i18n.t('Dấu ✓ của myBK không copy được, nên web suy “đạt” từ điểm:')}{' '}<strong>4–10</strong>, <strong>12</strong>{' '}{i18n.t('(miễn) và')}{' '}<strong>21</strong>{' '}{i18n.t('(đạt) là đạt;')}{' '}<strong>“--”</strong>{' '}{i18n.t('là chưa đạt.')}
            </span>
        </li>
    </StepList>
);

/**
 * Nút "Nhập tiến độ học tập": chọn cách nhập (PDF hoặc dán nội dung trang, ui-template/feedback.html, modal) -> "Đọc nội dung":
 * backend đọc và đối chiếu (T32, không ghi) -> hộp xác nhận -> Xác nhận thì ghi tiến độ, trạng thái môn và chương
 * trình theo mã CTĐT. Nội dung dán được gửi thành file .txt qua cùng API (`format: 'text'`).
 */
export const MybkUploadButton = () => {
    const queryClient = useQueryClient();
    const [chooserOpen, setChooserOpen] = useState(false);
    const [tab, setTab] = useState<'pdf' | 'paste'>('pdf');
    const [pdf, setPdf] = useState<File | null>(null);
    const [pasted, setPasted] = useState('');
    const [pending, setPending] = useState<{ file: File; review: MybkReview } | null>(null);

    const closeChooser = () => { setChooserOpen(false); setPdf(null); setPasted(''); };
    const review = useApiMutation<MybkReview, File>({
        mutationFn: reviewMybk,
        onSuccess: (result, file) => {
            closeChooser();
            setPending({ file, review: result });
        },
    });
    const upload = useApiMutation<MybkImportResult, { file: File; applyCurriculum: boolean }>({
        mutationFn: importMybk,
        onSuccess: (result) => {
            setPending(null);
            queryClient.setQueryData(MYBK_PROGRESS_KEY, { imported_at: result.imported_at, data: result.data });
            void queryClient.invalidateQueries({ queryKey: ['my-courses'] });
            void queryClient.invalidateQueries({ queryKey: ['student-courses'] });
            if (result.curriculum) void queryClient.invalidateQueries({ queryKey: ['my-profile'] });
            const curriculum = result.curriculum
                ? i18n.t(' Tài khoản theo chương trình {{v0}}.', { v0: result.curriculum.source_code ?? result.curriculum.name }) : '';
            toastMessage.success(i18n.t('Đã lưu tiến độ từ file myBK, cập nhật trạng thái {{written_courses}} môn.{{curriculum}}', { written_courses: result.written_courses, curriculum: curriculum }));
        },
    });

    // Chương trình của file khác chương trình tài khoản đang theo (hoặc chưa có) thì đặt theo file.
    const willApply = !!pending?.review.program.matched && !pending.review.program.same_as_profile;
    const source = tab === 'pdf' ? pdf : (pasted.trim() ? new File([pasted], 'mybk-tien-do.txt', { type: 'text/plain' }) : null);
    const pastedLength = pasted.trim().length;

    return (
        <>
            <ISolidBtn icon={<PiFileArrowUp />} onClick={() => setChooserOpen(true)}>{i18n.t('Nhập tiến độ học tập')}</ISolidBtn>
            <Modal
                open={chooserOpen}
                width={620}
                title={<ModalTitle eyebrow={i18n.t('Đồng bộ dữ liệu học tập')} icon={<PiArrowsClockwise />}>{i18n.t('Nhập tiến độ từ myBK')}</ModalTitle>}
                okText={i18n.t('Đọc nội dung')}
                cancelText={i18n.t('Hủy')}
                okButtonProps={{ icon: <PiFileMagnifyingGlass />, disabled: !source, loading: review.isPending }}
                onOk={() => source && review.mutate(source)}
                onCancel={closeChooser}
            >
                <Tabs
                    activeKey={tab}
                    onChange={key => setTab(key as 'pdf' | 'paste')}
                    items={[
                        {
                            key: 'pdf',
                            label: <span className="tab-label"><PiFilePdf />{i18n.t('Tải file PDF')}</span>,
                            children: (
                                <>
                                    <PdfGuide />
                                    <UploadZone accept=".pdf,application/pdf" onFile={setPdf} fileName={pdf?.name}
                                        note={i18n.t('Kéo thả file PDF vào đây hoặc bấm nút bên dưới')} />
                                </>
                            ),
                        },
                        {
                            key: 'paste',
                            label: <span className="tab-label"><PiClipboardText />{i18n.t('Dán nội dung trang')}</span>,
                            children: (
                                <>
                                    <PasteGuide />
                                    <label className="paste-label" htmlFor="mybk-paste">
                                        <span>{i18n.t('Ô dán nội dung trang myBK')}</span>
                                        <span className="paste-count">{pastedLength ? i18n.t('{{pastedLength}} ký tự', { pastedLength: pastedLength }) : i18n.t('Trống')}</span>
                                    </label>
                                    <Input.TextArea
                                        id="mybk-paste"
                                        rows={6}
                                        value={pasted}
                                        onChange={event => setPasted(event.target.value)}
                                        placeholder={i18n.t('Dán nội dung đã sao chép từ trang Tiến độ hoàn thành chương trình đào tạo trên myBK vào đây...')}
                                    />
                                </>
                            ),
                        },
                    ]}
                />
            </Modal>
            <Modal
                open={!!pending}
                width={760}
                title={<ModalTitle eyebrow={i18n.t('Kiểm tra trước khi lưu')} icon={<PiListChecks />}>{i18n.t('Xác nhận tiến độ')}</ModalTitle>}
                okText={i18n.t('Xác nhận và lưu')}
                cancelText={i18n.t('Hủy')}
                okButtonProps={{ icon: <PiCheck />, disabled: !pending?.review.can_confirm, loading: upload.isPending }}
                onCancel={() => setPending(null)}
                onOk={() => pending && upload.mutate({ file: pending.file, applyCurriculum: willApply })}
            >
                {pending && <MybkReviewContent review={pending.review} />}
            </Modal>
        </>
    );
};

/** Các kỳ từ năm áp dụng tới 7 năm sau (kỳ 1, 2, hè), để chọn học kỳ hiện tại. */
const semesterOptions = (fromYear: number) => Array.from({ length: 8 }, (_, i) => fromYear + i)
    .flatMap(year => [1, 2, 3].map(term => `${String(year % 100).padStart(2, '0')}${term}`))
    .map(code => ({ value: code, label: semesterLabel(code) }));

/**
 * Ô tìm môn trong danh mục để đánh dấu Đang học (data-display.html, course search result). Môn đã có trong bảng vẫn hiện
 * (không ghi chú, người duyệt 24/11); chọn thì chuyển môn đó sang Đang học, không thêm dòng trùng (người duyệt 21/11
 * gõ CO3021 bị "Không có môn khớp").
 */
const AddCourseSelect = ({ onPick }: { onPick: (course: CourseSummary) => void }) => {
    const [search, setSearch] = useState('');
    const keyword = useDebounce(search, 300).trim();
    const query = useApiQuery(['courses-pick', keyword], () => listCourses({ page: 1, take: 20, search: keyword }), {
        enabled: keyword.length >= 2,
    });
    const options = (query.data?.items ?? []).map(c => ({
        value: c.id,
        label: `${c.code} ${c.name}`,
        course: c,
    }));
    return (
        <Select
            showSearch
            value={null}
            className="add-course-select"
            prefix={<PiMagnifyingGlass aria-hidden="true" />}
            suffixIcon={null}
            placeholder={i18n.t('+ Môn đang học (gõ mã hoặc tên)')}
            filterOption={false}
            onSearch={setSearch}
            loading={query.isFetching}
            notFoundContent={keyword.length >= 2 ? i18n.t('Không có môn khớp') : i18n.t('Gõ ít nhất 2 ký tự')}
            options={options}
            optionRender={option => (
                <CourseOption code={option.data.course.code} name={option.data.course.name} credits={option.data.course.credits} />
            )}
            onSelect={(_value, option) => { onPick(option.course); setSearch(''); }}
            aria-label={i18n.t('Thêm môn đang học')}
        />
    );
};

/** Khối mặc định của môn ngoài CTĐT: tự chọn tự do (như myBK và `normalize.py`). */
const OUTSIDE_DEFAULT = 'Tự chọn tự do (ngoài CTĐT)';

type InProgressRow = { id: string; code: string; name: string; credits: number; outside: boolean };

/**
 * T46 (22/11): danh sách môn Đang học của kỳ này, kèm khối môn được tính vào (cùng ô chọn khối với bảng các khối).
 */
const InProgressList = ({ rows, fileBlockOf, editing, picker }: {
    rows: InProgressRow[];
    fileBlockOf: Map<string, string>;
    editing: boolean;
    picker: BlockPicker;
}) => (
    <Table<InProgressRow>
        rowKey="id" pagination={false} scroll={{ x: 640 }} dataSource={rows}
        locale={{
            emptyText: (
                <EmptyTableLine>
                    {i18n.t('Chưa có môn đang học. Gõ mã môn ở ô')}{' '}<strong>{i18n.t('“+ Môn đang học”')}</strong>{' '}{i18n.t('phía trên.')}
                </EmptyTableLine>
            ),
        }}
        columns={[
            { title: i18n.t('Mã môn'), dataIndex: 'code', width: 110, render: (code: string) => <CourseCode>{code}</CourseCode> },
            {
                title: i18n.t('Tên môn'), dataIndex: 'name',
                render: (name: string, row) => <>{name}{row.outside && <Tag style={{ marginInlineStart: 8 }}>{i18n.t('Ngoài CTĐT')}</Tag>}</>,
            },
            { title: i18n.t('TC'), dataIndex: 'credits', width: 64 },
            {
                title: i18n.t('Tính vào khối'), key: 'block', width: 280,
                render: (_v, row) => (
                    <BlockCell
                        code={row.code} editing={editing} picker={picker}
                        defaultLabel={row.outside ? i18n.t(OUTSIDE_DEFAULT) : fileBlockOf.get(row.code) ?? i18n.t('Theo chương trình')}
                    />
                ),
            },
        ]}
    />
);

/**
 * Trang "Tiến độ hoàn thành CTĐT" (T29) cạnh trạng thái đang lưu trên web (ui-template/tien-do-hoc-tap-page.html).
 * Khung **Hiệu chỉnh** (21/11): mở là vào chế độ sửa trạng thái mọi môn, thêm môn, khai học kỳ hiện tại (môn Đang học
 * là môn của kỳ đó). Lưu thì ghi database (`PUT mybk/adjustments`); nội dung file giữ nguyên, dòng khác file có cờ.
 */
export const MybkProgressCard = () => {
    const queryClient = useQueryClient();
    const query = useApiQuery(MYBK_PROGRESS_KEY, getMybkProgress);
    const statusesQuery = useApiQuery(['student-courses'], listMyCourses);
    const profileQuery = useApiQuery(['my-profile'], getMyProfile);
    const curriculumId = profileQuery.data?.curriculum_id ?? undefined;
    const groupsQuery = useApiQuery(['curriculum-groups', curriculumId], () => listCourseGroups(curriculumId!), {
        enabled: Boolean(curriculumId),
    });
    const data = query.data?.data;

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Map<string, StudentCourseStatus>>(new Map());
    const [added, setAdded] = useState<CourseSummary[]>([]);
    const [semester, setSemester] = useState<string>();
    const [semesterEditing, setSemesterEditing] = useState(false);
    const [onlyUnpassed, setOnlyUnpassed] = useState(false);
    const [openNote, setOpenNote] = useState<string | null>(null);

    const [removed, setRemoved] = useState<Set<string>>(new Set()); // course_id sẽ xóa khi Lưu
    const [noteDraft, setNoteDraft] = useState<Map<string, string>>(new Map()); // mã môn -> ghi chú mới ('' = xóa)
    const [blockDraft, setBlockDraft] = useState<Map<string, string | null>>(new Map()); // mã môn -> id khối (null = mặc định)
    const blockChoices = useMemo(() => {
        const map = new Map(Object.entries(query.data?.block_choices ?? {}));
        blockDraft.forEach((id, code) => (id ? map.set(code, id) : map.delete(code)));
        return map;
    }, [query.data?.block_choices, blockDraft]);
    const notes = useMemo(() => {
        const map = new Map(Object.entries(query.data?.notes ?? {}));
        noteDraft.forEach((note, code) => (note ? map.set(code, note) : map.delete(code)));
        return map;
    }, [query.data?.notes, noteDraft]);

    const saved = useMemo(() => (statusesQuery.data ?? []).filter(sc => !removed.has(sc.course_id)), [statusesQuery.data, removed]);
    const byCode = useMemo(() => {
        const map = new Map(saved.map(sc => [sc.course.code, { course_id: sc.course_id, ids: [sc.course_id], status: sc.status }]));
        // Môn vừa thêm (chưa lưu) mặc định Đang học.
        added.forEach(c => { if (!map.has(c.code)) map.set(c.code, { course_id: c.id, ids: [c.id], status: 'in-progress' }); });
        // Dòng CCGDTC của file = PE1003 + PE1005 trên web (đổi cùng lúc, không hiện mã).
        const pe = GDTC_WEB_CODES.map(code => map.get(code)).filter((e): e is NonNullable<typeof e> => !!e);
        if (pe.length) map.set(GDTC_FILE_CODE, { course_id: pe[0].course_id, ids: pe.map(e => e.course_id), status: pe[0].status });
        return map;
    }, [saved, added]);

    const fileCodes = useMemo(() => new Set([
        ...(data?.blocks ?? []).flatMap(b => b.courses.map(c => c.code)),
        ...(data?.graduation_conditions ?? []).map(c => c.code),
    ]), [data]);
    /** Môn có trên web nhưng file không có (thêm tay), trừ PE1003/PE1005 (đã hiện ở dòng Giáo dục thể chất). */
    const extra = useMemo<MybkProgressCourse[]>(() => {
        const courses = new Map(saved.map(sc => [sc.course.code, sc.course] as const));
        added.forEach(c => courses.set(c.code, c));
        return [...courses.values()].filter(c => !fileCodes.has(c.code) && !GDTC_WEB_CODES.includes(c.code))
            .sort((a, b) => a.code.localeCompare(b.code))
            .map(c => ({ code: c.code, name: c.name, credits: c.credits, passed: false, outside_file: true }));
    }, [saved, added, fileCodes]);

    // Đếm Đang học trên các môn thật (không tính dòng gộp GDTC).
    const credits = new Map(saved.map(sc => [sc.course_id, sc.course.credits]));
    added.forEach(c => credits.set(c.id, c.credits));
    const courseIds = new Set([...saved.map(sc => sc.course_id), ...added.map(c => c.id)]);
    const statusById = new Map<string, StudentCourseStatus>(saved.map(sc => [sc.course_id, sc.status]));
    added.forEach(c => { if (!statusById.has(c.id)) statusById.set(c.id, 'in-progress'); });
    const inProgress = [...courseIds].filter(id => (draft.get(id) ?? statusById.get(id)) === 'in-progress');
    const inProgressCredits = inProgress.reduce((sum, id) => sum + (credits.get(id) ?? 0), 0);
    // T46: danh sách môn Đang học (mã, tên, TC, khối) để sinh viên nhìn lại kỳ này đã chọn những môn nào.
    const courseById = new Map<string, CourseSummary>(saved.map(sc => [sc.course_id, sc.course]));
    added.forEach(c => courseById.set(c.id, c));
    const fileBlockOf = new Map((data?.blocks ?? []).flatMap(b => b.courses.map(c => [c.code, b.name] as const)));
    const inProgressRows: InProgressRow[] = inProgress
        .map(id => courseById.get(id))
        .filter((c): c is CourseSummary => !!c)
        .map(c => ({ id: c.id, code: c.code, name: c.name, credits: c.credits, outside: !fileCodes.has(c.code) && !GDTC_WEB_CODES.includes(c.code) }))
        .sort((a, b) => a.code.localeCompare(b.code));
    // Chỉ khối gốc (khối chuyên ngành thu hẹp khối gốc, không cộng tín chỉ riêng).
    const blockGroups = (groupsQuery.data ?? []).filter(g => !g.parent_group_id).map(g => ({ id: g.id, name: g.name }));
    const currentSemester = semester ?? query.data?.current_semester ?? '';
    const isSummer = currentSemester.endsWith('3');
    const loadWarning = inProgressCredits > (isSummer ? 12 : 25)
        ? i18n.t('nhiều hơn mức tối đa {{v0}} TC', { v0: isSummer ? 12 : 25 })
        : !isSummer && inProgressCredits > 0 && inProgressCredits < 11 ? i18n.t('ít hơn mức tối thiểu 11 TC') : null;

    const dirty = draft.size > 0 || added.length > 0 || removed.size > 0 || noteDraft.size > 0 || blockDraft.size > 0
        || semester !== undefined;
    const reset = () => {
        setEditing(false); setDraft(new Map()); setAdded([]); setRemoved(new Set()); setSemester(undefined); setOnlyUnpassed(false);
        setNoteDraft(new Map()); setBlockDraft(new Map()); setOpenNote(null); setSemesterEditing(false);
    };
    const cancel = () => (dirty ? confirmThen(i18n.t('Bỏ các thay đổi chưa lưu?'), reset) : reset());
    const save = useApiMutation<MybkProgress & { written_courses: number; removed_courses: number }, MybkAdjustPayload>({
        mutationFn: adjustMybk,
        onSuccess: (result) => {
            queryClient.setQueryData(MYBK_PROGRESS_KEY, result);
            void queryClient.invalidateQueries({ queryKey: ['student-courses'] });
            void queryClient.invalidateQueries({ queryKey: ['my-courses'] });
            reset();
            const removedText = result.removed_courses ? i18n.t(', xóa {{removed_courses}} môn', { removed_courses: result.removed_courses }) : '';
            toastMessage.success(i18n.t('Đã lưu hiệu chỉnh: {{written_courses}} môn{{removedText}}; học kỳ hiện tại {{v2}}.', { written_courses: result.written_courses, removedText: removedText, v2: semesterLabel(result.current_semester) }));
        },
    });
    const submit = () => {
        const items = [...draft].filter(([id]) => !removed.has(id)).map(([course_id, status]) => ({ course_id, status }));
        // Môn vừa thêm mà không đổi trạng thái: ghi với trạng thái mặc định Đang học.
        added.forEach(c => {
            if (!draft.has(c.id) && !removed.has(c.id) && !(statusesQuery.data ?? []).some(sc => sc.course_id === c.id)) {
                items.push({ course_id: c.id, status: 'in-progress' });
            }
        });
        const savedIds = new Set((statusesQuery.data ?? []).map(sc => sc.course_id));
        save.mutate({
            items,
            ...(semester ? { current_semester: semester } : {}),
            ...(removed.size ? { remove_course_ids: [...removed].filter(id => savedIds.has(id)) } : {}),
            ...(noteDraft.size ? { notes: [...noteDraft].map(([code, note]) => ({ code, note })) } : {}),
            ...(blockDraft.size ? { block_choices: [...blockDraft].map(([code, group_id]) => ({ code, group_id })) } : {}),
        });
    };

    const web: WebStatusView = {
        byCode, editing, draft,
        setStatus: (courseIds, status) => setDraft((prev) => {
            const next = new Map(prev);
            courseIds.forEach(id => next.set(id, status));
            return next;
        }),
        remove: (courseId) => {
            setRemoved(prev => new Set(prev).add(courseId));
            setAdded(prev => prev.filter(c => c.id !== courseId));
        },
        notes,
        setNote: (code, note) => setNoteDraft(prev => new Map(prev).set(code, note)),
        openNote,
        setOpenNote,
        blocks: {
            groups: blockGroups,
            choices: blockChoices,
            choose: (code, groupId) => setBlockDraft(prev => new Map(prev).set(code, groupId)),
        },
    };
    const fromYear = Number(data?.student?.applied_from_year) || new Date().getFullYear() - 4;

    if (query.isLoading || statusesQuery.isLoading) return <PageLoading label={i18n.t('Đang tải dữ liệu tiến độ học tập...')} />;
    if (!data) {
        return (
            <EmptyState
                size="page"
                title={i18n.t('Chưa có tiến độ học tập')}
                description={i18n.t('Lấy từ trang "Tiến độ hoàn thành CTĐT" của myBK: lưu thành PDF, hoặc copy cả trang rồi dán vào.')}
                action={<MybkUploadButton />}
            />
        );
    }

    const semesterValue = (
        <>
            {currentSemester ? semesterLabel(currentSemester) : '—'}
            {query.data?.current_semester_source === 'auto' && semester === undefined && (
                <span style={{ marginInlineStart: 8 }}><SourceBadge>{i18n.t('tự tính theo ngày')}</SourceBadge></span>
            )}
        </>
    );
    const loadValue = (
        <span className="load-summary">
            {inProgress.length}{' '}{i18n.t('môn,')}{' '}{inProgressCredits}{' '}{i18n.t('TC')}
            {loadWarning && <LoadWarning>{loadWarning}</LoadWarning>}
        </span>
    );

    const adjust = (
        <Disclosure
            icon={<PiPencilSimpleLine />}
            title={i18n.t('Hiệu chỉnh môn đang học')}
            subtitle={i18n.t('Xác nhận các môn bạn đang học trong học kỳ này — myBK không ghi nhận phần này')}
            open={editing}
            onOpenChange={open => (open ? setEditing(true) : cancel())}
        >
            <p className="adjust-desc">
                {i18n.t('Bạn sửa được trạng thái và khối của mọi môn (cột "Tính vào khối" trong từng khối). Khối bạn chọn riêng được ghi vào tài khoản và bộ giải xếp lộ trình theo đúng lựa chọn đó; chỉ lưu ý là có thể khác cách tính của myBK.')}
            </p>

            <div className="adjust-meta">
                <div className="semester-row">
                    <span className="row-label">{i18n.t('Học kỳ hiện tại')}</span>
                    {semesterEditing
                        ? (
                            <Select
                                style={{ width: 240 }} value={currentSemester} options={semesterOptions(fromYear)}
                                aria-label={i18n.t('Học kỳ hiện tại')} autoFocus defaultOpen
                                onChange={value => confirmThen(i18n.t('Đổi học kỳ hiện tại sang {{v0}}?', { v0: semesterLabel(value) }), () => {
                                    setSemester(value);
                                    setSemesterEditing(false);
                                })}
                                onBlur={() => setSemesterEditing(false)}
                            />
                        )
                        : (
                            <>
                                <span className="row-value">{semesterValue}</span>
                                <IconBtn size="small" icon={<PiPencilSimple />} label={i18n.t('Sửa học kỳ')} onClick={() => setSemesterEditing(true)} />
                            </>
                        )}
                </div>
                <div className="semester-row">
                    <span className="row-label">{i18n.t('Đang học')}</span>
                    <span className="row-value">{loadValue}</span>
                </div>
            </div>

            <div className="adjust-toolbar">
                <AddCourseSelect
                    onPick={(course) => {
                        // Người duyệt 22/11: thêm môn Đang học cũng phải hỏi như mọi thay đổi khác.
                        const entry = byCode.get(course.code);
                        confirmThen(
                            entry ? i18n.t('Chuyển {{code}} sang "Đang học"?', { code: course.code }) : i18n.t('Thêm {{code}} ({{name}}) vào danh sách Đang học?', { code: course.code, name: course.name }),
                            () => {
                                if (entry) {
                                    web.setStatus(entry.ids, 'in-progress');
                                    toastMessage.success(i18n.t('{{code}}: chuyển sang Đang học (bấm Lưu để ghi).', { code: course.code }));
                                } else {
                                    setAdded(prev => [...prev, course]);
                                }
                            },
                        );
                    }}
                />
                <LabeledSwitch checked={onlyUnpassed} onChange={setOnlyUnpassed}>{i18n.t('Chỉ môn chưa đạt')}</LabeledSwitch>
            </div>

            <InProgressList rows={inProgressRows} fileBlockOf={fileBlockOf} editing={editing} picker={web.blocks} />

            <div className="adjust-actions">
                <ISolidBtn loading={save.isPending} onClick={submit}>{i18n.t('Lưu hiệu chỉnh')}</ISolidBtn>
                <ITextBtn onClick={cancel}>{i18n.t('Hủy')}</ITextBtn>
            </div>
        </Disclosure>
    );

    return (
        <MybkFileDetails
            data={data} importedAt={query.data?.imported_at ?? null} web={web} extra={extra}
            onlyUnpassed={editing && onlyUnpassed}
            summary={(
                <>
                    <RowItem label={i18n.t('Học kỳ hiện tại')} value={semesterValue} />
                    <RowItem label={i18n.t('Đang học')} value={loadValue} />
                </>
            )}
            header={adjust}
            regulations={curriculumId ? <RegulationList curriculumId={curriculumId} compact /> : undefined}
        />
    );
};

