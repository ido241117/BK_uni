import { useState } from 'react';
import { Alert, Card, Form, Input, Modal, Popconfirm, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import { LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { FormField, ISolidBtn, ITable, ITextBtn, PageLoading } from '@/components';
import { createRegulation, listRegulations, removeRegulation, updateRegulation } from '@/apis/curriculum';
import { useApiMutation, useApiQuery } from '@/hooks';
import type { CurriculumRegulation, CurriculumRegulationPayload } from '@/types';
import type { CurriculumTabProps } from '../types';
import i18n from '@/i18n';

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
        successMessage: i18n.t('Đã thêm quy định.'),
        onSuccess: async () => {
            closeModal();
            await invalidate();
        },
    });

    const update = useApiMutation<CurriculumRegulation, UpdateRegulationVariables>({
        mutationFn: variables => updateRegulation(curriculumId, variables.regulationId, variables.payload),
        successMessage: i18n.t('Đã cập nhật quy định.'),
        onSuccess: async () => {
            closeModal();
            await invalidate();
        },
    });

    const remove = useApiMutation<null, string>({
        mutationFn: regulationId => removeRegulation(curriculumId, regulationId),
        successMessage: i18n.t('Đã xoá quy định.'),
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
            title: i18n.t('Tên quy định'),
            dataIndex: 'name',
            width: 260,
            render: (name: string) => <Text strong>{name}</Text>,
        },
        {
            title: i18n.t('Mô tả'),
            dataIndex: 'detail',
            render: (detail: string | null) => (detail
                ? <Paragraph style={{ margin: 0 }} ellipsis={{ rows: 2, tooltip: detail }}>{detail}</Paragraph>
                : <Text type="secondary">{i18n.t('Chưa có mô tả')}</Text>),
        },
        {
            title: i18n.t('Cập nhật lúc'),
            dataIndex: 'updated_at',
            width: 180,
            render: (updatedAt: string) => new Date(updatedAt).toLocaleString('vi-VN'),
        },
        {
            title: i18n.t('Hành động'),
            key: 'actions',
            width: 180,
            align: 'right',
            render: (_value, record) => (
                <Space size={4}>
                    <ITextBtn icon={<LuPencil />} onClick={() => openEdit(record)}>{i18n.t('Sửa')}</ITextBtn>
                    <Popconfirm
                        title={i18n.t('Xoá quy định này?')}
                        description={i18n.t('Xoá quy định cũng xoá trạng thái tự khai của sinh viên với quy định này. Hành động không hoàn tác được.')}
                        okText={i18n.t('Xoá')}
                        cancelText={i18n.t('Huỷ')}
                        okButtonProps={{ color: 'danger', variant: 'solid' }}
                        onConfirm={() => remove.mutate(record.id)}
                    >
                        <ITextBtn
                            danger
                            icon={<LuTrash2 />}
                            loading={remove.isPending && remove.variables === record.id}
                        >
                            {i18n.t('Xoá')}
                        </ITextBtn>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    if (regulationsQuery.isLoading) {
        return <PageLoading />;
    }

    const regulations = regulationsQuery.data ?? [];

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            {regulationsQuery.isError && (
                <Alert
                    type="error"
                    showIcon
                    title={i18n.t('Không tải được danh sách quy định')}
                    description={regulationsQuery.error?.message}
                />
            )}

            <Card
                size="small"
                title={i18n.t('Quy định của chương trình')}
                extra={<ISolidBtn icon={<LuPlus />} onClick={openCreate}>{i18n.t('Thêm quy định')}</ISolidBtn>}
            >
                <ITable<CurriculumRegulation>
                    showIndex={false}
                    rowKey="id"
                    columns={columns}
                    dataSource={regulations}
                    loading={regulationsQuery.isFetching}
                    pagination={false}
                    syncLocation={false}
                    emptyText={i18n.t('Chương trình chưa có quy định nào')}
                />
            </Card>

            <Modal
                open={open}
                title={editing ? i18n.t('Sửa quy định') : i18n.t('Thêm quy định')}
                okText={i18n.t('Lưu')}
                cancelText={i18n.t('Huỷ')}
                confirmLoading={create.isPending || update.isPending}
                onOk={() => form.submit()}
                onCancel={closeModal}
                destroyOnHidden
            >
                <Form<RegulationFormValues> form={form} layout="vertical" onFinish={submit}>
                    <FormField
                        name="name"
                        label={i18n.t('Tên quy định')}
                        placeholder={i18n.t('Chuẩn ngoại ngữ đầu ra')}
                        rules={[
                            { required: true, whitespace: true, message: i18n.t('Nhập tên quy định.') },
                            { max: 255, message: i18n.t('Tên quy định tối đa 255 ký tự.') },
                        ]}
                    />
                    <Form.Item name="detail" label={i18n.t('Mô tả')}>
                        <Input.TextArea rows={4} placeholder={i18n.t('Mô tả chi tiết quy định (không bắt buộc)')} />
                    </Form.Item>
                </Form>
            </Modal>
        </Space>
    );
};

export default RegulationsTab;
