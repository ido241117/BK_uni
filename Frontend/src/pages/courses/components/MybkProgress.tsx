import { type ReactNode, useMemo, useRef, useState } from 'react';
import { Alert, Card, Collapse, Descriptions, Input, Modal, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import { LuCircleCheck, LuClipboardPaste, LuFileText, LuPencil, LuUpload } from 'react-icons/lu';
import { EmptyState, IOutLinedBtn, ISolidBtn } from '@/components';
import { listCourses } from '@/apis/course';
import { adjustMybk, getMybkProgress, importMybk, reviewMybk } from '@/apis/planner';
import { listMyCourses } from '@/apis/student';
import { useApiMutation, useApiQuery, useDebounce } from '@/hooks';
import { semesterLabel } from '@/pages/courses/analysis/semester';
import {
    STUDENT_COURSE_STATUS,
    STUDENT_COURSE_STATUS_COLOR,
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

const { Text } = Typography;

const MYBK_PROGRESS_KEY = ['mybk-progress'];

const KIND_LABEL: Record<string, string> = { BB: 'Bắt buộc', TC: 'Tự chọn', NGOAICTDT: 'Ngoài chương trình' };
const STATUS_LABEL: Record<string, string> = {
    'completed': 'Đã hoàn thành', 'not-started': 'Chưa học', 'in-progress': 'Đang học', 'failed': 'Rớt',
};
const LEVEL_TYPE = { error: 'error', warning: 'warning', info: 'info' } as const;

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
};

const STATUS_OPTIONS = Object.values(STUDENT_COURSE_STATUS).map(value => ({ value, label: STUDENT_COURSE_STATUS_LABEL[value] }));
const fileStatus = (passed: boolean): StudentCourseStatus => (passed ? 'completed' : 'not-started');

/** GDTC: người duyệt 21/11 không hiện mã (CCGDTC, PE1003, PE1005), chỉ nói Giáo dục thể chất đạt hay chưa. */
const GDTC_FILE_CODE = 'CCGDTC';
const GDTC_WEB_CODES = ['PE1003', 'PE1005'];

/** Hộp xác nhận cho mỗi lần đổi trạng thái hoặc xóa ở chế độ Hiệu chỉnh (người duyệt 21/11). */
const confirmThen = (title: string, action: () => void) => {
    Modal.confirm({ title, okText: 'OK', cancelText: 'Hủy', onOk: action });
};
const rowLabel = (row: MybkProgressCourse) => (row.code === GDTC_FILE_CODE ? 'Giáo dục thể chất' : row.code);

/**
 * Cột bảng môn. Người duyệt 21/11: frontend **không hiện điểm** (điểm số, điểm chữ vẫn lưu trong JSON).
 * Có `web` thì thêm cột "Trên web": trạng thái đang lưu, nhãn "Khác file" khi khác ✓/-- của file; chế độ sửa là ô chọn.
 */
const courseColumns = (web?: WebStatusView, withCredits = true): ColumnsType<MybkProgressCourse> => [
    { title: 'Stt', key: 'index', width: 56, render: (_v, _row, index) => index + 1 },
    {
        title: 'Mã môn học', dataIndex: 'code', key: 'code', width: 120,
        render: (code: string) => (code === GDTC_FILE_CODE ? '' : code),
    },
    {
        title: 'Tên môn học', dataIndex: 'name', key: 'name',
        render: (name: string | null, row) => (row.code === GDTC_FILE_CODE ? 'Giáo dục thể chất' : dash(name)),
    },
    ...(withCredits ? [{ title: 'Tín chỉ', dataIndex: 'credits', key: 'credits', width: 72, align: 'center' as const }] : []),
    {
        title: 'Đạt (file)',
        dataIndex: 'passed',
        key: 'passed',
        width: 84,
        align: 'center',
        render: (passed: boolean, row) => {
            if (row.outside_file) return <Text type="secondary">—</Text>;
            return passed ? <LuCircleCheck color="#52c41a" aria-label="Đạt" /> : <Text type="secondary">--</Text>;
        },
    },
    ...(web ? [{
        title: 'Trên web',
        key: 'web',
        width: 200,
        render: (_v: unknown, row: MybkProgressCourse) => {
            const entry = web.byCode.get(row.code);
            if (!entry) return <Text type="secondary">—</Text>;
            const shown = web.draft.get(entry.course_id) ?? entry.status;
            const differs = !row.outside_file && shown !== fileStatus(row.passed);
            return (
                <Space size={4} wrap>
                    {web.editing
                        ? (
                            <Select<StudentCourseStatus>
                                size="small" style={{ width: 130 }} value={shown} options={STATUS_OPTIONS}
                                aria-label={`Trạng thái ${rowLabel(row)}`}
                                onChange={value => confirmThen(
                                    `Đổi ${rowLabel(row)} sang "${STUDENT_COURSE_STATUS_LABEL[value]}"?`,
                                    () => web.setStatus(entry.ids, value),
                                )}
                            />
                        )
                        : <Tag color={STUDENT_COURSE_STATUS_COLOR[shown]}>{STUDENT_COURSE_STATUS_LABEL[shown]}</Tag>}
                    {differs && <Tag color="warning">Khác file tiến độ</Tag>}
                    {web.editing && row.outside_file && (
                        <IOutLinedBtn
                            size="small" danger
                            onClick={() => confirmThen(`Xóa ${row.code} khỏi tiến độ trên web?`, () => web.remove(entry.course_id))}
                        >
                            Xóa
                        </IOutLinedBtn>
                    )}
                </Space>
            );
        },
    }] : []),
    { title: 'Ghi chú', dataIndex: 'note', key: 'note', render: (v?: string | null) => v ?? '' },
];

const blockLabel = (block: MybkProgressBlock) => {
    const done = block.earned_credits >= block.required_credits;
    return (
        <Space wrap>
            <Text strong>{block.name}</Text>
            <Text type={done ? 'success' : 'secondary'}>{block.earned_credits}/{block.required_credits}</Text>
            {done && <LuCircleCheck color="#52c41a" aria-label="Hoàn thành khối" />}
            <Tag>{KIND_LABEL[block.kind] ?? block.kind}</Tag>
        </Space>
    );
};

/**
 * Nội dung file (trừ điểm): thông tin sinh viên, từng khối, từng môn, điều kiện tốt nghiệp. Có `web` thì thêm cột
 * "Trên web" và (`extra`) khối "Môn trên web ngoài file"; `onlyUnpassed` lọc môn chưa đạt theo file.
 */
const MybkFileDetails = ({ data, importedAt, web, extra = [], onlyUnpassed = false, header }: {
    data: MybkProgressData; importedAt?: string | null; web?: WebStatusView;
    extra?: MybkProgressCourse[]; onlyUnpassed?: boolean; header?: ReactNode;
}) => {
    const s = data.student;
    const keep = (rows: MybkProgressCourse[]) => (onlyUnpassed ? rows.filter(r => !r.passed) : rows);
    const conditions = keep(data.graduation_conditions ?? []);
    const blocks = data.blocks.map(block => ({ ...block, courses: keep(block.courses) }))
        .filter(block => !onlyUnpassed || block.courses.length);
    return (
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <Descriptions size="small" column={{ xs: 1, md: 2 }} bordered>
                <Descriptions.Item label="Họ và tên">{dash(s?.full_name)}</Descriptions.Item>
                <Descriptions.Item label="Mã sinh viên">{dash(s?.student_number)}</Descriptions.Item>
                <Descriptions.Item label="Mã lớp">{dash(s?.class_code)}</Descriptions.Item>
                <Descriptions.Item label="Khoa">{dash(s?.faculty)}</Descriptions.Item>
                <Descriptions.Item label="Ngành">
                    {[data.specialization, data.official_program_code].filter(Boolean).join(' - ') || '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Áp dụng từ năm">{dash(s?.applied_from_year)}</Descriptions.Item>
                <Descriptions.Item label="Số tín chỉ tích lũy">{data.total_earned}/{data.total_required}</Descriptions.Item>
                <Descriptions.Item label="Cập nhật cuối (myBK)">{viDate(data.updated_at)}</Descriptions.Item>
                {importedAt !== undefined && <Descriptions.Item label="Nhập vào web">{viDate(importedAt)}</Descriptions.Item>}
            </Descriptions>
            {header}
            <Collapse
                size="small"
                items={[
                    ...blocks.map((block, index) => ({
                        key: `block-${index}`,
                        label: blockLabel(block),
                        children: (
                            <Table<MybkProgressCourse>
                                size="small" rowKey="code" pagination={false} scroll={{ x: 720 }}
                                columns={courseColumns(web)} dataSource={block.courses}
                            />
                        ),
                    })),
                    ...(conditions.length ? [{
                        key: 'conditions',
                        label: <Text strong>Điều kiện tốt nghiệp</Text>,
                        children: (
                            <Table<MybkProgressCourse>
                                size="small" rowKey="code" pagination={false} scroll={{ x: 640 }}
                                columns={courseColumns(web, false)} dataSource={conditions}
                            />
                        ),
                    }] : []),
                    ...(extra.length ? [{
                        key: 'extra',
                        label: <Text strong>Môn ngoài chương trình đào tạo</Text>,
                        children: (
                            <Table<MybkProgressCourse>
                                size="small" rowKey="code" pagination={false} scroll={{ x: 720 }}
                                columns={courseColumns(web)} dataSource={extra}
                            />
                        ),
                    }] : []),
                ]}
            />
        </Space>
    );
};

/* ------------------------------ Hộp xác nhận (T32) ------------------------------ */

/**
 * Mã CTĐT myBK trong file là gốc: tài khoản luôn theo chương trình của file (người duyệt 21/11), không có ô chọn.
 * Mã nội bộ của web (vd CS-2023-KHMT) không hiện cho người dùng.
 */
const MybkReviewContent = ({ review }: { review: MybkReview }) => {
    const { program, conflicts, equivalents, status_changes: changes } = review;
    const matched = program.matched;
    const problems = conflicts.filter(c => c.level !== 'info');
    return (
        <Space orientation="vertical" style={{ width: '100%' }} size="middle">
            <Descriptions size="small" column={1} bordered title="Chương trình đào tạo">
                <Descriptions.Item label="Mã CTĐT (myBK)">{dash(program.official_program_code)}</Descriptions.Item>
                <Descriptions.Item label="Chương trình trên web">
                    {matched
                        ? `${matched.name} (khóa ${matched.cohort}, ${matched.total_credits ?? '?'} TC, ${matched.course_count} môn; phiên bản ${dash(matched.source_version)})`
                        : 'Không tìm thấy chương trình mang mã này'}
                </Descriptions.Item>
                <Descriptions.Item label="Tài khoản đang theo">
                    {program.profile ? dash(program.profile.source_code ?? program.profile.name) : 'Chưa có'}
                    {program.same_as_profile && <Tag color="success" style={{ marginLeft: 8 }}>Khớp file</Tag>}
                </Descriptions.Item>
            </Descriptions>

            {problems.length === 0 && <Alert type="success" showIcon title="Không thấy mâu thuẫn giữa file và chương trình trên web." />}
            {conflicts.map(c => (
                <Alert
                    key={c.id}
                    type={LEVEL_TYPE[c.level]}
                    showIcon
                    title={c.title}
                    description={c.codes?.length ? <Space wrap size={4}>{c.codes.map(code => <Tag key={code}>{code}</Tag>)}</Space> : undefined}
                />
            ))}

            {equivalents.map(eq => (
                <Alert
                    key={eq.file_code}
                    type="info"
                    showIcon
                    title={`Giáo dục thể chất: ${eq.passed ? 'Đạt' : 'Chưa đạt'}`}
                />
            ))}

            {review.has_previous_import ? (
                <Card size="small" title={`Trạng thái môn sẽ đổi khi xác nhận (${changes.length})`}>
                    {changes.length ? (
                        <Table
                            size="small" rowKey="code" pagination={false} dataSource={changes}
                            columns={[
                                { title: 'Mã', dataIndex: 'code', width: 110 },
                                { title: 'Tên môn', dataIndex: 'name' },
                                { title: 'Web đang ghi', dataIndex: 'web', width: 130, render: (v: string | null) => (v ? STATUS_LABEL[v] ?? v : 'Chưa khai') },
                                {
                                    title: 'Theo file', dataIndex: 'file', width: 170,
                                    render: (v: string | null) => (v === null
                                        ? <Text type="warning">Chưa học (file không có)</Text>
                                        : STATUS_LABEL[v] ?? v),
                                },
                            ]}
                        />
                    ) : <Text type="secondary">Không môn nào đổi trạng thái.</Text>}
                </Card>
            ) : (
                <Text>Lần đầu tải file: sẽ ghi trạng thái {changes.length} môn đúng như file.</Text>
            )}

            <Collapse
                size="small"
                items={[{ key: 'file', label: <Text strong>Toàn bộ thông tin đọc được từ file</Text>, children: <MybkFileDetails data={review.file} /> }]}
            />
        </Space>
    );
};

/** Hướng dẫn hai cách nhập (người duyệt 21/11): PDF phải lưu bằng "Lưu dưới dạng PDF", hoặc dán cả trang. */
const PdfGuide = () => (
    <ol style={{ paddingInlineStart: 20, margin: 0 }}>
        <li>Trên myBK mở <Text strong>Tiến độ hoàn thành chương trình đào tạo</Text>, bấm <Text strong>Cập nhật</Text> để lấy số mới nhất.</li>
        <li>Bấm <Text strong>In</Text>. Ở ô <Text strong>Máy in đích</Text> chọn <Text strong>Lưu dưới dạng PDF</Text>.</li>
        <li>Lưu file rồi chọn file đó ở đây.</li>
    </ol>
);

const PasteGuide = () => (
    <ol style={{ paddingInlineStart: 20, margin: 0 }}>
        <li>Trên máy tính, mở myBK trang <Text strong>Tiến độ hoàn thành chương trình đào tạo</Text>, bấm <Text strong>Cập nhật</Text>.</li>
        <li>Bấm <Text keyboard>Ctrl</Text>+<Text keyboard>A</Text> rồi <Text keyboard>Ctrl</Text>+<Text keyboard>C</Text>.</li>
        <li>Dán vào ô dưới (<Text keyboard>Ctrl</Text>+<Text keyboard>V</Text>) rồi bấm <Text strong>Đọc nội dung</Text>.</li>
        <li>
            <Text type="secondary">
                Dấu ✓ của myBK không copy được, nên web suy "đạt" từ điểm: 4–10, 12 (miễn) và 21 (đạt) là đạt; "--" là chưa đạt.
            </Text>
        </li>
    </ol>
);

/**
 * Nút "Nhập tiến độ từ myBK": chọn cách nhập (PDF hoặc dán nội dung trang) -> backend đọc và đối chiếu
 * (T32, không ghi) -> hộp xác nhận -> Xác nhận thì ghi tiến độ, trạng thái môn và chương trình theo mã CTĐT.
 * Nội dung dán được gửi thành file .txt qua cùng API (`format: 'text'`).
 */
export const MybkUploadButton = () => {
    const queryClient = useQueryClient();
    const inputRef = useRef<HTMLInputElement>(null);
    const [chooserOpen, setChooserOpen] = useState(false);
    const [pasted, setPasted] = useState('');
    const [pending, setPending] = useState<{ file: File; review: MybkReview } | null>(null);

    const review = useApiMutation<MybkReview, File>({
        mutationFn: reviewMybk,
        onSuccess: (result, file) => {
            setChooserOpen(false);
            setPasted('');
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
                ? ` Tài khoản theo chương trình ${result.curriculum.source_code ?? result.curriculum.name}.` : '';
            toastMessage.success(`Đã lưu tiến độ từ file myBK, cập nhật trạng thái ${result.written_courses} môn.${curriculum}`);
        },
    });

    // Chương trình của file khác chương trình tài khoản đang theo (hoặc chưa có) thì đặt theo file.
    const willApply = !!pending?.review.program.matched && !pending.review.program.same_as_profile;

    return (
        <>
            <IOutLinedBtn icon={<LuUpload />} onClick={() => setChooserOpen(true)}>
                Nhập tiến độ từ myBK
            </IOutLinedBtn>
            <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                hidden
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) review.mutate(file);
                }}
            />
            <Modal
                open={chooserOpen}
                title="Nhập tiến độ từ myBK"
                width={720}
                footer={null}
                onCancel={() => setChooserOpen(false)}
            >
                <Tabs
                    items={[
                        {
                            key: 'pdf',
                            label: <Space size={6}><LuFileText />Tải file PDF</Space>,
                            children: (
                                <Space orientation="vertical" style={{ width: '100%' }} size="middle">
                                    <PdfGuide />
                                    <ISolidBtn icon={<LuUpload />} loading={review.isPending} onClick={() => inputRef.current?.click()}>
                                        Chọn file PDF
                                    </ISolidBtn>
                                </Space>
                            ),
                        },
                        {
                            key: 'paste',
                            label: <Space size={6}><LuClipboardPaste />Dán nội dung trang</Space>,
                            children: (
                                <Space orientation="vertical" style={{ width: '100%' }} size="middle">
                                    <PasteGuide />
                                    <Input.TextArea
                                        rows={10}
                                        value={pasted}
                                        onChange={event => setPasted(event.target.value)}
                                        placeholder="Dán toàn bộ nội dung trang Tiến độ hoàn thành CTĐT vào đây"
                                        aria-label="Nội dung trang Tiến độ hoàn thành CTĐT"
                                    />
                                    <ISolidBtn
                                        loading={review.isPending}
                                        disabled={!pasted.trim()}
                                        onClick={() => review.mutate(new File([pasted], 'mybk-tien-do.txt', { type: 'text/plain' }))}
                                    >
                                        Đọc nội dung
                                    </ISolidBtn>
                                </Space>
                            ),
                        },
                    ]}
                />
            </Modal>
            <Modal
                open={!!pending}
                title="Kiểm tra tiến độ trước khi lưu"
                width={960}
                okText="Xác nhận và lưu"
                cancelText="Hủy"
                okButtonProps={{ disabled: !pending?.review.can_confirm, loading: upload.isPending }}
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
 * Ô tìm môn trong danh mục để đánh dấu Đang học. Môn đã có trong bảng (`existing`) vẫn hiện, ghi chú "đã có trong bảng";
 * chọn thì chuyển môn đó sang Đang học, không thêm dòng trùng (người duyệt 21/11 gõ CO3021 bị "Không có môn khớp").
 */
const AddCourseSelect = ({ onPick, existing }: { onPick: (course: CourseSummary) => void; existing: Set<string> }) => {
    const [search, setSearch] = useState('');
    const keyword = useDebounce(search, 300).trim();
    const query = useApiQuery(['courses-pick', keyword], () => listCourses({ page: 1, take: 20, search: keyword }), {
        enabled: keyword.length >= 2,
    });
    const options = (query.data?.items ?? []).map(c => ({
        value: c.id,
        label: `${c.code} - ${c.name} (${c.credits} TC)${existing.has(c.code) ? ' · đã có trong bảng' : ''}`,
        course: c,
    }));
    return (
        <Select
            showSearch
            value={null}
            style={{ minWidth: 320 }}
            placeholder="+ Môn đang học (gõ mã hoặc tên)"
            filterOption={false}
            onSearch={setSearch}
            loading={query.isFetching}
            notFoundContent={keyword.length >= 2 ? 'Không có môn khớp' : 'Gõ ít nhất 2 ký tự'}
            options={options}
            onSelect={(_value, option) => { onPick(option.course); setSearch(''); }}
            aria-label="Thêm môn"
        />
    );
};

/**
 * Hiện lại trang "Tiến độ hoàn thành CTĐT" (T29) cạnh trạng thái đang lưu trên web, và nút **Hiệu chỉnh** (21/11):
 * sửa trạng thái mọi môn, thêm môn, khai học kỳ hiện tại (môn Đang học là môn của kỳ đó). Lưu thì ghi database
 * (`PUT mybk/adjustments`); nội dung file giữ nguyên, dòng khác file có nhãn "Khác file".
 */
export const MybkProgressCard = () => {
    const queryClient = useQueryClient();
    const query = useApiQuery(MYBK_PROGRESS_KEY, getMybkProgress);
    const statusesQuery = useApiQuery(['student-courses'], listMyCourses);
    const data = query.data?.data;

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Map<string, StudentCourseStatus>>(new Map());
    const [added, setAdded] = useState<CourseSummary[]>([]);
    const [semester, setSemester] = useState<string>();
    const [onlyUnpassed, setOnlyUnpassed] = useState(false);

    const [removed, setRemoved] = useState<Set<string>>(new Set()); // course_id sẽ xóa khi Lưu

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
    const currentSemester = semester ?? query.data?.current_semester ?? '';
    const isSummer = currentSemester.endsWith('3');
    const loadWarning = inProgressCredits > (isSummer ? 12 : 25)
        ? `nhiều hơn mức tối đa ${isSummer ? 12 : 25} TC`
        : !isSummer && inProgressCredits > 0 && inProgressCredits < 11 ? 'ít hơn mức tối thiểu 11 TC' : null;

    const reset = () => {
        setEditing(false); setDraft(new Map()); setAdded([]); setRemoved(new Set()); setSemester(undefined); setOnlyUnpassed(false);
    };
    const save = useApiMutation<MybkProgress & { written_courses: number; removed_courses: number }, MybkAdjustPayload>({
        mutationFn: adjustMybk,
        onSuccess: (result) => {
            queryClient.setQueryData(MYBK_PROGRESS_KEY, result);
            void queryClient.invalidateQueries({ queryKey: ['student-courses'] });
            void queryClient.invalidateQueries({ queryKey: ['my-courses'] });
            reset();
            const removedText = result.removed_courses ? `, xóa ${result.removed_courses} môn` : '';
            toastMessage.success(`Đã lưu hiệu chỉnh: ${result.written_courses} môn${removedText}; học kỳ hiện tại ${semesterLabel(result.current_semester)}.`);
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
    };
    const fromYear = Number(data?.student?.applied_from_year) || new Date().getFullYear() - 4;

    if (!query.isLoading && !data) {
        return (
            <Card>
                <EmptyState
                    title="Chưa có tiến độ học tập"
                    description='Lấy từ trang "Tiến độ hoàn thành CTĐT" của myBK: lưu thành PDF, hoặc copy cả trang rồi dán vào.'
                    action={<MybkUploadButton />}
                />
            </Card>
        );
    }

    const header = (
        <Card size="small" style={{ background: editing ? 'var(--brand-soft)' : undefined }}>
            <Space wrap size="middle" style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space wrap size="middle">
                    <Space size={6}>
                        <Text>Học kỳ hiện tại:</Text>
                        {editing
                            ? (
                                <Select
                                    size="small" style={{ width: 220 }} value={currentSemester}
                                    options={semesterOptions(fromYear)} onChange={setSemester} aria-label="Học kỳ hiện tại"
                                />
                            )
                            : <Text strong>{currentSemester ? semesterLabel(currentSemester) : '—'}</Text>}
                        {!editing && query.data?.current_semester_source === 'auto' && <Tag>tự tính theo ngày</Tag>}
                    </Space>
                    <Space size={6}>
                        <Text>Đang học:</Text>
                        <Text strong>{inProgress.length} môn, {inProgressCredits} TC</Text>
                        {loadWarning && <Tag color="warning">{loadWarning}</Tag>}
                    </Space>
                </Space>
                {editing
                    ? (
                        <Space wrap>
                            <Space size={6}><Switch size="small" checked={onlyUnpassed} onChange={setOnlyUnpassed} />Chỉ môn chưa đạt</Space>
                            <AddCourseSelect
                                existing={new Set(byCode.keys())}
                                onPick={(course) => {
                                    const entry = byCode.get(course.code);
                                    if (entry) {
                                        web.setStatus(entry.ids, 'in-progress');
                                        toastMessage.success(`${course.code} đã có trong bảng: chuyển sang Đang học (bấm Lưu để ghi).`);
                                    } else {
                                        setAdded(prev => [...prev, course]);
                                    }
                                }}
                            />
                            <IOutLinedBtn onClick={reset}>Hủy</IOutLinedBtn>
                            <ISolidBtn loading={save.isPending} onClick={submit}>Lưu hiệu chỉnh</ISolidBtn>
                        </Space>
                    )
                    : <IOutLinedBtn icon={<LuPencil />} onClick={() => setEditing(true)}>Hiệu chỉnh</IOutLinedBtn>}
            </Space>
        </Card>
    );

    return (
        <Card title="Tiến độ hoàn thành CTĐT (theo myBK)" loading={query.isLoading || statusesQuery.isLoading}>
            {data && (
                <MybkFileDetails
                    data={data} importedAt={query.data?.imported_at ?? null} web={web} extra={extra}
                    onlyUnpassed={editing && onlyUnpassed} header={header}
                />
            )}
        </Card>
    );
};
