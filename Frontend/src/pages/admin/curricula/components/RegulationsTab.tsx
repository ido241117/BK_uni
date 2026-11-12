import { useState } from 'react';
import { Alert, Card, Form, Input, Modal, Popconfirm, Space, Spin, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import { LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { FormField, ISolidBtn, ITable, ITextBtn } from '@/components';
import { createRegulation, listRegulations, removeRegulation, updateRegulation } from '@/apis/curriculum';
import { useApiMutation, useApiQuery } from '@/hooks';
import type { CurriculumRegulation, CurriculumRegulationPayload } from '@/types';
import type { CurriculumTabProps } from '../types';

const { Paragraph, Text } = Typography;

type RegulationFormValues = {
    name: string;
    detail?: string;
};

type UpdateRegulationVariables = {
    regulationId: string;
    payload: CurriculumRegulationPayload;
};

/** Chuẩn hoá giá trị form: chuỗi rỗng ở `detail` được gửi thành `null` để xoá mô tả cũ. */
const toPayload = (values: RegulationFormValues): CurriculumRegulationPayload => {
    const detail = values.detail?.trim();
    return { name: values.name.trim(), detail: detail ? detail : null };
};

const RegulationsTab = ({ curriculumId }: CurriculumTabProps) => {
    const queryClient = useQueryClient();
    const [form] = Form.useForm<RegulationFormValues>();
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<CurriculumRegulation | null>(null);

    const regulationsQuery = useApiQuery(
        ['curriculum-regulations', curriculumId],
        () => listRegulations(curriculumId),
    );

    const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: ['curriculum-regulations', curriculumId] });

    const closeModal = () => {
        setOpen(false);
        setEditing(null);
    };

    const create = useApiMutation<CurriculumRegulation, CurriculumRegulationPayload>({
        mutationFn: payload => createRegulation(curriculumId, payload),
        successMessage: 'Đã thêm quy định.',
        onSuccess: async () => {
            closeModal();
            await invalidate();
        },
    });

    const update = useApiMutation<CurriculumRegulation, UpdateRegulationVariables>({
        mutationFn: variables => updateRegulation(curriculumId, variables.regulationId, variables.payload),
        successMessage: 'Đã cập nhật quy định.',
        onSuccess: async () => {
            closeModal();
            await invalidate();
        },
    });

    const remove = useApiMutation<null, string>({
        mutationFn: regulationId => removeRegulation(curriculumId, regulationId),
        successMessage: 'Đã xoá quy định.',
        onSuccess: () => invalidate(),
    });

    /** Nạp giá trị vào form trước khi mở; store của form được giữ qua các lần đóng/mở modal. */
    const openCreate = () => {
        form.setFieldsValue({ name: '', detail: '' });
        setEditing(null);
        setOpen(true);
    };

    const openEdit = (regulation: CurriculumRegulation) => {
        form.setFieldsValue({ name: regulation.name, detail: regulation.detail ?? '' });
        setEditing(regulation);
        setOpen(true);
    };

    const submit = (values: RegulationFormValues) => {
        const payload = toPayload(values);
        if (editing) {
            update.mutate({ regulationId: editing.id, payload });
            return;
        }
        create.mutate(payload);
    };

    const columns: ColumnsType<CurriculumRegulation> = [
        {
            title: 'Tên quy định',
            dataIndex: 'name',
            width: 260,
            render: (name: string) => <Text strong>{name}</Text>,
        },
        {
            title: 'Mô tả',
            dataIndex: 'detail',
            render: (detail: string | null) => (detail
                ? <Paragraph style={{ margin: 0 }} ellipsis={{ rows: 2, tooltip: detail }}>{detail}</Paragraph>
                : <Text type="secondary">Chưa có mô tả</Text>),
        },
        {
            title: 'Cập nhật lúc',
            dataIndex: 'updated_at',
            width: 180,
            render: (updatedAt: string) => new Date(updatedAt).toLocaleString('vi-VN'),
        },
        {
            title: 'Hành động',
            key: 'actions',
            width: 180,
            align: 'right',
            render: (_value, record) => (
                <Space size={4}>
                    <ITextBtn icon={<LuPencil />} onClick={() => openEdit(record)}>Sửa</ITextBtn>
                    <Popconfirm
                        title="Xoá quy định này?"
                        description="Xoá quy định cũng xoá trạng thái tự khai của sinh viên với quy định này. Hành động không hoàn tác được."
                        okText="Xoá"
                        cancelText="Huỷ"
                        okButtonProps={{ color: 'danger', variant: 'solid' }}
                        onConfirm={() => remove.mutate(record.id)}
                    >
                        <ITextBtn
                            danger
                            icon={<LuTrash2 />}
                            loading={remove.isPending && remove.variables === record.id}
                        >
                            Xoá
                        </ITextBtn>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    if (regulationsQuery.isLoading) {
        return <div style={{ display: 'grid', placeItems: 'center', minHeight: '30vh' }}><Spin size="large" /></div>;
    }

    const regulations = regulationsQuery.data ?? [];

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            {regulationsQuery.isError && (
                <Alert
                    type="error"
                    showIcon
                    title="Không tải được danh sách quy định"
                    description={regulationsQuery.error?.message}
                />
            )}

            <Card
                size="small"
                title="Quy định của chương trình"
                extra={<ISolidBtn icon={<LuPlus />} onClick={openCreate}>Thêm quy định</ISolidBtn>}
            >
                <ITable<CurriculumRegulation>
                    showIndex={false}
                    rowKey="id"
                    columns={columns}
                    dataSource={regulations}
                    loading={regulationsQuery.isFetching}
                    pagination={false}
                    syncLocation={false}
                    emptyText="Chương trình chưa có quy định nào"
                />
            </Card>

            <Modal
                open={open}
                title={editing ? 'Sửa quy định' : 'Thêm quy định'}
                okText="Lưu"
                cancelText="Huỷ"
                confirmLoading={create.isPending || update.isPending}
                onOk={() => form.submit()}
                onCancel={closeModal}
                destroyOnHidden
            >
                <Form<RegulationFormValues> form={form} layout="vertical" onFinish={submit}>
                    <FormField
                        name="name"
                        label="Tên quy định"
                        placeholder="Chuẩn ngoại ngữ đầu ra"
                        rules={[
                            { required: true, whitespace: true, message: 'Nhập tên quy định.' },
                            { max: 255, message: 'Tên quy định tối đa 255 ký tự.' },
                        ]}
                    />
                    <Form.Item name="detail" label="Mô tả">
                        <Input.TextArea rows={4} placeholder="Mô tả chi tiết quy định (không bắt buộc)" />
                    </Form.Item>
                </Form>
            </Modal>
        </Space>
    );
};

export default RegulationsTab;
