import { useRef } from 'react';
import { Alert, Card, Collapse, Descriptions, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import { LuCircleCheck, LuUpload } from 'react-icons/lu';
import { EmptyState, IOutLinedBtn } from '@/components';
import { getMybkProgress, importMybk } from '@/apis/planner';
import { useApiMutation, useApiQuery } from '@/hooks';
import type { MybkImportResult, MybkProgressBlock, MybkProgressCourse } from '@/types';
import { toastMessage } from '@/utils/toast';

const { Text } = Typography;

const MYBK_PROGRESS_KEY = ['mybk-progress'];

const KIND_LABEL: Record<string, string> = { BB: 'Bắt buộc', TC: 'Tự chọn', NGOAICTDT: 'Ngoài chương trình' };

/** yyyy-mm-dd -> dd/mm/yyyy như myBK ghi. */
const viDate = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');

/**
 * Nút "Tải PDF tiến độ myBK" (T29). Backend đọc file, lưu nội dung theo tài khoản và ghi trạng thái môn
 * đúng như file (✓ -> Đã hoàn thành, "--" -> Chưa học). Không có bước xác nhận (người duyệt chốt 20/11).
 */
export const MybkUploadButton = () => {
    const queryClient = useQueryClient();
    const inputRef = useRef<HTMLInputElement>(null);
    const upload = useApiMutation<MybkImportResult, File>({
        mutationFn: importMybk,
        onSuccess: (result) => {
            queryClient.setQueryData(MYBK_PROGRESS_KEY, { imported_at: result.imported_at, data: result.data });
            void queryClient.invalidateQueries({ queryKey: ['my-courses'] });
            void queryClient.invalidateQueries({ queryKey: ['student-courses'] });
            const unknown = result.unknown_codes.length
                ? ` ${result.unknown_codes.length} mã không có trong danh mục web (${result.unknown_codes.join(', ')}) chỉ được lưu trong tiến độ.`
                : '';
            toastMessage.success(`Đã lưu tiến độ từ file myBK, cập nhật trạng thái ${result.written_courses} môn.${unknown}`);
        },
    });

    return (
        <>
            <IOutLinedBtn icon={<LuUpload />} loading={upload.isPending} onClick={() => inputRef.current?.click()}>
                Tải PDF tiến độ myBK
            </IOutLinedBtn>
            <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                hidden
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) upload.mutate(file);
                }}
            />
        </>
    );
};

const courseColumns: ColumnsType<MybkProgressCourse> = [
    { title: 'Stt', key: 'index', width: 56, render: (_v, _row, index) => index + 1 },
    { title: 'Mã môn học', dataIndex: 'code', key: 'code', width: 130 },
    { title: 'Tên môn học', dataIndex: 'name', key: 'name', render: (name: string | null) => name ?? '—' },
    { title: 'Tín chỉ', dataIndex: 'credits', key: 'credits', width: 80, align: 'center' },
    {
        title: 'Đạt',
        dataIndex: 'passed',
        key: 'passed',
        width: 64,
        align: 'center',
        render: (passed: boolean) => (passed ? <LuCircleCheck color="#52c41a" aria-label="Đạt" /> : <Text type="secondary">--</Text>),
    },
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
 * Hiện lại đúng trang "Tiến độ hoàn thành CTĐT" của myBK từ nội dung file đã lưu (T29).
 * Điểm, ghi chú và thông tin sinh viên có trong dữ liệu nhưng chưa hiện (người duyệt chốt 20/11).
 */
export const MybkProgressCard = () => {
    const query = useApiQuery(MYBK_PROGRESS_KEY, getMybkProgress);
    const data = query.data?.data;

    if (!query.isLoading && !data) {
        return (
            <Card>
                <EmptyState
                    title="Chưa có tiến độ học tập"
                    description='Trên myBK, vào "Tiến độ hoàn thành CTĐT", in ra PDF rồi tải file lên đây.'
                    action={<MybkUploadButton />}
                />
            </Card>
        );
    }

    const conditions = data?.graduation_conditions ?? [];
    return (
        <Card title="Tiến độ hoàn thành CTĐT (theo file myBK)" loading={query.isLoading}>
            {data && (
                <Space orientation="vertical" style={{ width: '100%' }} size="middle">
                    <Descriptions size="small" column={{ xs: 1, md: 2 }}>
                        <Descriptions.Item label="Ngành">
                            {[data.specialization, data.official_program_code].filter(Boolean).join(' - ')}
                        </Descriptions.Item>
                        <Descriptions.Item label="Số tín chỉ tích lũy">{data.total_earned}/{data.total_required}</Descriptions.Item>
                        <Descriptions.Item label="Cập nhật cuối (myBK)">{viDate(data.updated_at)}</Descriptions.Item>
                        <Descriptions.Item label="Tải lên web">{viDate(query.data?.imported_at ?? null)}</Descriptions.Item>
                    </Descriptions>
                    <Collapse
                        size="small"
                        items={[
                            ...data.blocks.map((block, index) => ({
                                key: `block-${index}`,
                                label: blockLabel(block),
                                children: (
                                    <Table<MybkProgressCourse>
                                        size="small"
                                        rowKey="code"
                                        pagination={false}
                                        columns={courseColumns}
                                        dataSource={block.courses}
                                    />
                                ),
                            })),
                            ...(conditions.length ? [{
                                key: 'conditions',
                                label: <Text strong>Điều kiện tốt nghiệp</Text>,
                                children: (
                                    <Table<MybkProgressCourse>
                                        size="small"
                                        rowKey="code"
                                        pagination={false}
                                        columns={courseColumns.filter(c => c.key !== 'credits')}
                                        dataSource={conditions}
                                    />
                                ),
                            }] : []),
                        ]}
                    />
                    <Alert
                        type="info"
                        showIcon
                        title="Trạng thái môn ở bảng dưới lấy đúng từ file này: môn có dấu ✓ là Đã hoàn thành, môn ghi -- là Chưa học. Tải file mới để cập nhật."
                    />
                </Space>
            )}
        </Card>
    );
};
