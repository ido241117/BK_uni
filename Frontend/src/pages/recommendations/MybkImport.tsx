import { useMemo, useRef, useState } from 'react';
import { Alert, Collapse, Modal, Segmented, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import { LuCircleCheck, LuCircleX, LuUpload } from 'react-icons/lu';
import { Link } from 'react-router';
import { IOutLinedBtn } from '@/components';
import { previewMybk } from '@/apis/planner';
import { bulkUpsertMyCourses } from '@/apis/student';
import { useApiMutation } from '@/hooks';
import {
    STUDENT_COURSE_STATUS as S,
    STUDENT_COURSE_STATUS_COLOR as STATUS_COLOR,
    STUDENT_COURSE_STATUS_LABEL as STATUS_LABEL,
    type MybkCourseRow,
    type MybkPreview,
    type StudentCourseStatus,
} from '@/types';
import { ApiError } from '@/utils/error';
import { toastMessage } from '@/utils/toast';
import { semesterLabel } from '@/utils/semester';

const { Text } = Typography;

type Choice = typeof S.NOT_STARTED | typeof S.IN_PROGRESS | typeof S.FAILED;
const CHOICES: { value: Choice; label: string }[] = [
    { value: S.NOT_STARTED, label: 'Chưa học' },
    { value: S.IN_PROGRESS, label: 'Đang học' },
    { value: S.FAILED, label: 'Rớt' },
];
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Môn file không có: web ghi "đã hoàn thành" thì mặc định về "chưa học" (myBK là nguồn đúng của môn đã đạt). */
const defaultChoice = (row: MybkCourseRow): Choice => (
    row.current_status === S.IN_PROGRESS || row.current_status === S.FAILED ? row.current_status : S.NOT_STARTED
);

const StatusTag = ({ status }: { status: StudentCourseStatus | null }) => (status
    ? <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>
    : <Text type="secondary">Chưa khai</Text>);

interface Change { course_id: string; code: string; from: StudentCourseStatus | null; to: StudentCourseStatus }

/**
 * Nút "Tải file tiến độ myBK" và màn hình xác nhận (T19–T23).
 * File gửi lên backend để đọc rồi bỏ, không lưu. Chỉ khi bấm Lưu mới ghi trạng thái môn.
 */
const MybkImport = () => {
    const queryClient = useQueryClient();
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<{ fileName: string; data: MybkPreview } | null>(null);
    const [choices, setChoices] = useState<Record<string, Choice>>({});
    const [onlyFlagged, setOnlyFlagged] = useState(false);

    const read = useApiMutation({
        mutationFn: (file: File) => previewMybk(file),
        onSuccess: (data, file) => {
            setChoices(Object.fromEntries(data.not_passed.map(row => [row.code, defaultChoice(row)])));
            setPreview({ fileName: file.name, data });
        },
    });

    const changes: Change[] = useMemo(() => {
        if (!preview) return [];
        const out: Change[] = [];
        for (const row of preview.data.passed) {
            if (row.current_status !== S.COMPLETED) {
                out.push({ course_id: row.course_id, code: row.code, from: row.current_status, to: S.COMPLETED });
            }
        }
        for (const row of preview.data.not_passed) {
            const to = choices[row.code] ?? defaultChoice(row);
            if (to !== (row.current_status ?? S.NOT_STARTED)) {
                out.push({ course_id: row.course_id, code: row.code, from: row.current_status, to });
            }
        }
        return out;
    }, [preview, choices]);

    const save = useApiMutation({
        mutationFn: (items: Change[]) => bulkUpsertMyCourses(items.map(c => ({ course_id: c.course_id, status: c.to }))),
        successMessage: 'Đã lưu trạng thái môn từ file myBK.',
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['my-courses'] });
            void queryClient.invalidateQueries({ queryKey: ['student-courses'] });
            setPreview(null);
        },
    });

    const data = preview?.data;
    const passedChanged = data?.passed.filter(r => r.current_status !== S.COMPLETED) ?? [];
    const flagged = (row: MybkCourseRow) => row.current_status === S.COMPLETED || (choices[row.code] ?? S.NOT_STARTED) !== S.NOT_STARTED;
    const notPassedRows = (data?.not_passed ?? []).filter(r => !onlyFlagged || flagged(r));
    const check = data?.data_check;
    const dataIssues = check
        ? check.not_in_curriculum.length + check.credit_mismatches.length + check.unknown_codes.length
            + check.missing_in_file.length
        : 0;

    const notPassedColumns: ColumnsType<MybkCourseRow> = [
        {
            title: 'Môn',
            key: 'course',
            render: (_v, row) => (
                <Space orientation="vertical" size={0}>
                    <span><Text strong>{row.code}</Text> · {row.name} <Text type="secondary">({row.credits} TC)</Text></span>
                    {row.current_status === S.COMPLETED && (
                        <Text type="warning">Web đang ghi "Đã hoàn thành" nhưng myBK chưa ghi đạt</Text>
                    )}
                </Space>
            ),
        },
        { title: 'Web đang ghi', key: 'current', width: 130, render: (_v, row) => <StatusTag status={row.current_status} /> },
        {
            title: 'Kỳ này',
            key: 'choice',
            width: 230,
            render: (_v, row) => (
                <Segmented
                    size="small"
                    value={choices[row.code] ?? defaultChoice(row)}
                    options={CHOICES}
                    onChange={value => setChoices({ ...choices, [row.code]: value as Choice })}
                />
            ),
        },
    ];

    return (
        <>
            <IOutLinedBtn icon={<LuUpload />} loading={read.isPending} onClick={() => inputRef.current?.click()}>
                Tải file tiến độ myBK
            </IOutLinedBtn>
            <input
                ref={inputRef}
                type="file"
                accept=".pdf,.xlsx"
                hidden
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                        read.mutate(file, {
                            onError: (error) => {
                                if (!(error instanceof ApiError)) toastMessage.error('Không đọc được file.');
                            },
                        });
                    }
                    event.target.value = '';
                }}
            />

            <Modal
                open={preview !== null}
                width={880}
                title={preview ? `Xác nhận từ file myBK: ${preview.fileName}` : ''}
                okText={changes.length ? `Lưu ${changes.length} thay đổi` : 'Đóng'}
                cancelText="Huỷ"
                confirmLoading={save.isPending}
                onCancel={() => setPreview(null)}
                onOk={() => (changes.length ? save.mutate(changes) : setPreview(null))}
                destroyOnHidden
            >
                {data && (
                    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                        <Space wrap>
                            <Tag>{data.file.format === 'pdf' ? 'PDF' : 'Excel'}</Tag>
                            {data.file.official_program_code && <Tag>{data.file.official_program_code}</Tag>}
                            <Tag color="blue">{data.file.passed_count} môn đã đạt</Tag>
                            {data.file.total_earned !== null && (
                                <Tag>Tích lũy {data.file.total_earned}/{data.file.total_required ?? '?'} TC</Tag>
                            )}
                            {data.file.updated_at
                                ? <Tag>myBK cập nhật {data.file.updated_at.split('-').reverse().join('/')}</Tag>
                                : data.file.exported_semester && <Tag>Xuất ở {semesterLabel(data.file.exported_semester)}</Tag>}
                            {data.file.graduation_conditions.map(c => (
                                <Tag key={c.code} color={c.passed ? 'green' : 'default'}>
                                    {c.code}: {c.passed ? 'đã đạt' : 'chưa đạt'}
                                </Tag>
                            ))}
                            {data.file.checks.map(c => (
                                <Tag key={c.id} color={c.ok ? 'green' : 'red'} icon={c.ok ? <LuCircleCheck /> : <LuCircleX />}>
                                    {c.detail}
                                </Tag>
                            ))}
                        </Space>

                        {data.detection.warning
                            ? (
                                <Alert
                                    type="warning"
                                    showIcon
                                    title={data.detection.warning}
                                    action={<Link to="/profile">Sửa hồ sơ</Link>}
                                />
                            )
                            : data.detection.chosen && (
                                <Alert
                                    type="success"
                                    showIcon
                                    title={`File khớp chương trình bạn chọn: ${data.detection.chosen.code} (${pct(data.detection.chosen.coverage)} môn đã đạt)`}
                                />
                            )}

                        <div>
                            <Text strong>1. Môn đã đạt theo myBK → "Đã hoàn thành"</Text>
                            <br />
                            <Text type="secondary">
                                {passedChanged.length
                                    ? `${passedChanged.length} môn sẽ đổi; ${data.passed.length - passedChanged.length} môn web đã ghi đúng.`
                                    : `Cả ${data.passed.length} môn web đã ghi đúng.`}
                            </Text>
                            {passedChanged.length > 0 && (
                                <Space wrap size={[4, 4]} style={{ marginTop: 8 }}>
                                    {passedChanged.map(r => (
                                        <Tag key={r.code} color={r.outside_curriculum ? 'default' : 'green'}>
                                            {r.code}{r.outside_curriculum ? ' (ngoài chương trình)' : ''}
                                        </Tag>
                                    ))}
                                </Space>
                            )}
                        </div>

                        <div>
                            <Text strong>2. Môn chưa đạt trong chương trình: kỳ này bạn đang học hay đã rớt?</Text>
                            <br />
                            <Text type="secondary">
                                {data.file.lists_only_passed
                                    ? 'File Excel của myBK chỉ ghi môn đã đạt, không phân biệt chưa học, đang học hay rớt. Bạn chọn giúp; để "Chưa học" nếu chưa học.'
                                    : 'PDF của myBK ghi "--" cho cả môn chưa học lẫn môn rớt, và không ghi môn đang học. Bạn chọn giúp; để "Chưa học" nếu chưa học.'}
                            </Text>
                            <Space style={{ margin: '8px 0' }}>
                                <Switch size="small" checked={onlyFlagged} onChange={setOnlyFlagged} />
                                <Text>Chỉ hiện môn đang học, rớt, hoặc web ghi khác myBK</Text>
                            </Space>
                            <Table<MybkCourseRow>
                                size="small"
                                rowKey="code"
                                columns={notPassedColumns}
                                dataSource={notPassedRows}
                                pagination={notPassedRows.length > 8 ? { pageSize: 8, size: 'small' } : false}
                            />
                        </div>

                        <Collapse
                            items={[{
                                key: 'data',
                                label: dataIssues
                                    ? `Dữ liệu chương trình của web lệch với myBK: ${dataIssues} chỗ`
                                    : 'Dữ liệu chương trình của web khớp với myBK',
                                children: check && (
                                    <Space orientation="vertical">
                                        <Text type="secondary">
                                            Dùng để nhóm sửa dữ liệu; không ảnh hưởng việc lưu. Môn không có trong danh mục web sẽ bị bỏ qua.
                                        </Text>
                                        {check.not_in_curriculum.length > 0 && (
                                            <Text>
                                                Môn trong khối CTĐT của myBK nhưng không thuộc chương trình đã chọn:{' '}
                                                {check.not_in_curriculum.map(c => `${c.code} (${c.block})`).join(', ')}
                                            </Text>
                                        )}
                                        {check.credit_mismatches.length > 0 && (
                                            <Text>
                                                Tín chỉ lệch:{' '}
                                                {check.credit_mismatches.map(c => `${c.code} myBK ${c.file_credits}, web ${c.web_credits}`).join('; ')}
                                            </Text>
                                        )}
                                        {check.unknown_codes.length > 0 && (
                                            <Text>Không có trong danh mục môn của web: {check.unknown_codes.join(', ')}</Text>
                                        )}
                                        {check.missing_in_file.length > 0 && (
                                            <Text>
                                                Chương trình của web có nhưng PDF myBK không liệt kê: {check.missing_in_file.join(', ')}
                                            </Text>
                                        )}
                                        {data.detection.candidates.length > 0 && (
                                            <Text type="secondary">
                                                Chương trình khớp nhất:{' '}
                                                {data.detection.candidates.map(c => `${c.code} ${pct(c.coverage)}`).join(' · ')}
                                            </Text>
                                        )}
                                    </Space>
                                ),
                            }]}
                        />
                    </Space>
                )}
            </Modal>
        </>
    );
};

export default MybkImport;
