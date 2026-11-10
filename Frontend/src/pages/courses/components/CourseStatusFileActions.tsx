import { useRef, useState } from 'react';
import { Alert, Dropdown, Modal, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import { LuArrowRight, LuDownload, LuUpload } from 'react-icons/lu';
import { IOutLinedBtn } from '@/components';
import { listCoursesByCodes } from '@/apis/course';
import { bulkUpsertMyCourses } from '@/apis/student';
import { useApiMutation } from '@/hooks';
import {
    STUDENT_COURSE_STATUS_COLOR as STATUS_COLOR,
    STUDENT_COURSE_STATUS_LABEL,
    type CourseSummary,
    type StudentCourseStatus,
} from '@/types';
import { ApiError } from '@/utils/error';
import { toastMessage } from '@/utils/toast';
import {
    analyzeStatusFile,
    buildTemplateRows,
    downloadCsvTemplate,
    downloadXlsxTemplate,
    readStatusFile,
    type ImportAnalysis,
    type RowError,
    type StatusChange,
} from '@/utils/student-course-file';

const { Text } = Typography;

interface PendingImport {
    fileName: string;
    analysis: ImportAnalysis;
}

interface CourseStatusFileActionsProps {
    /** Trạng thái đang lưu của sinh viên (theo course_id). */
    statusByCourseId: Map<string, StudentCourseStatus>;
    /**
     * Môn điền sẵn vào file mẫu: môn của chương trình + môn đã khai/lên kế hoạch.
     * Không dùng cả danh mục (hàng nghìn môn); môn khác sinh viên tự thêm dòng.
     */
    templateCourses: CourseSummary[];
}

/**
 * Tải file mẫu (Excel/CSV, điền sẵn trạng thái hiện tại) và nộp lại file đã điền.
 * Trước khi lưu luôn hiện bảng xem trước: môn thay đổi và dòng lỗi.
 */
const CourseStatusFileActions = ({ statusByCourseId, templateCourses }: CourseStatusFileActionsProps) => {
    const queryClient = useQueryClient();
    const inputRef = useRef<HTMLInputElement>(null);
    const [exporting, setExporting] = useState(false);
    const [reading, setReading] = useState(false);
    const [pending, setPending] = useState<PendingImport | null>(null);

    const exportTemplate = async (format: 'xlsx' | 'csv') => {
        setExporting(true);
        try {
            const rows = buildTemplateRows(templateCourses, statusByCourseId);
            const fileName = `trang-thai-hoc-tap.${format}`;
            if (format === 'xlsx') await downloadXlsxTemplate(rows, fileName);
            else downloadCsvTemplate(rows, fileName);
        } catch {
            toastMessage.error('Không tạo được file mẫu. Vui lòng thử lại.');
        } finally {
            setExporting(false);
        }
    };

    const importFile = async (file: File) => {
        setReading(true);
        try {
            const rows = await readStatusFile(file);
            // Chỉ tra các mã có trong file thay vì tải cả danh mục.
            const courses = await listCoursesByCodes(rows.map(row => row.code));
            setPending({ fileName: file.name, analysis: analyzeStatusFile(rows, courses, statusByCourseId) });
        } catch (error) {
            if (!(error instanceof ApiError)) {
                const message = error instanceof Error ? error.message : 'Lỗi không xác định.';
                toastMessage.error(`Không đọc được file: ${message}`);
            }
        } finally {
            setReading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const save = useApiMutation({
        mutationFn: (changes: StatusChange[]) => bulkUpsertMyCourses(
            changes.map(change => ({ course_id: change.courseId, status: change.to })),
        ),
        successMessage: 'Đã lưu trạng thái học tập từ file.',
        onSuccess: (saved) => {
            queryClient.setQueryData(['student-courses'], saved);
            void queryClient.invalidateQueries({ queryKey: ['student-courses'] });
            setPending(null);
        },
    });

    const changeColumns: ColumnsType<StatusChange> = [
        {
            title: 'Môn học',
            key: 'course',
            render: (_value, change) => (
                <span><Text strong>{change.code}</Text> · {change.name}</span>
            ),
        },
        {
            title: 'Thay đổi',
            key: 'change',
            width: 260,
            render: (_value, change) => (
                <Space size={4}>
                    {change.from
                        ? <Tag color={STATUS_COLOR[change.from]}>{STUDENT_COURSE_STATUS_LABEL[change.from]}</Tag>
                        : <Text type="secondary">Chưa khai</Text>}
                    <LuArrowRight />
                    <Tag color={STATUS_COLOR[change.to]}>{STUDENT_COURSE_STATUS_LABEL[change.to]}</Tag>
                </Space>
            ),
        },
    ];

    const errorColumns: ColumnsType<RowError> = [
        { title: 'Dòng', dataIndex: 'line', width: 70 },
        { title: 'Mã môn', dataIndex: 'code', width: 110, render: (code: string) => code || '—' },
        { title: 'Lỗi', dataIndex: 'message' },
    ];

    const analysis = pending?.analysis;

    return (
        <>
            <Space wrap size={8}>
                <Dropdown
                    trigger={['click']}
                    disabled={exporting}
                    menu={{
                        items: [
                            { key: 'xlsx', label: 'Excel (.xlsx) – có ô chọn trạng thái' },
                            { key: 'csv', label: 'CSV (.csv)' },
                        ],
                        onClick: ({ key }) => void exportTemplate(key as 'xlsx' | 'csv'),
                    }}
                >
                    <IOutLinedBtn icon={<LuDownload />} loading={exporting}>Tải file mẫu</IOutLinedBtn>
                </Dropdown>

                <IOutLinedBtn icon={<LuUpload />} loading={reading} onClick={() => inputRef.current?.click()}>
                    Nhập từ file
                </IOutLinedBtn>
                <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.csv"
                    hidden
                    onChange={event => {
                        const file = event.target.files?.[0];
                        if (file) void importFile(file);
                    }}
                />
            </Space>

            <Modal
                open={pending !== null}
                width={760}
                title={pending ? `Xem trước: ${pending.fileName}` : 'Xem trước'}
                okText={analysis?.changes.length ? `Lưu ${analysis.changes.length} môn` : 'Đóng'}
                cancelText="Huỷ"
                confirmLoading={save.isPending}
                onCancel={() => setPending(null)}
                onOk={() => {
                    if (analysis?.changes.length) save.mutate(analysis.changes);
                    else setPending(null);
                }}
                destroyOnHidden
            >
                {analysis && (
                    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                        <Space wrap size={8}>
                            <Tag color="blue">{analysis.changes.length} môn thay đổi</Tag>
                            <Tag>{analysis.unchanged} môn không đổi</Tag>
                            <Tag>{analysis.blank} dòng để trống (giữ nguyên)</Tag>
                            {analysis.errors.length > 0 && <Tag color="red">{analysis.errors.length} dòng lỗi</Tag>}
                        </Space>

                        {analysis.errors.length > 0 && (
                            <Alert
                                type="warning"
                                showIcon
                                title="Các dòng lỗi sẽ bị bỏ qua"
                                description={(
                                    <Table<RowError>
                                        size="small"
                                        tableLayout="fixed"
                                        className="table-wrap-text"
                                        rowKey={row => `${row.line}-${row.code}`}
                                        columns={errorColumns}
                                        dataSource={analysis.errors}
                                        pagination={analysis.errors.length > 5 ? { pageSize: 5 } : false}
                                    />
                                )}
                            />
                        )}

                        {analysis.changes.length > 0
                            ? (
                                <Table<StatusChange>
                                    size="small"
                                    tableLayout="fixed"
                                    className="table-wrap-text"
                                    rowKey="courseId"
                                    columns={changeColumns}
                                    dataSource={analysis.changes}
                                    pagination={analysis.changes.length > 10 ? { pageSize: 10 } : false}
                                />
                            )
                            : <Text type="secondary">File không có thay đổi nào so với trạng thái đang lưu.</Text>}
                    </Space>
                )}
            </Modal>
        </>
    );
};

export default CourseStatusFileActions;
