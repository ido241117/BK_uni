import { useMemo, useState } from 'react';
import { Alert, Form, Modal, Popconfirm, Select, Space, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import { LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { EmptyState, FormField, ISolidBtn, ITable, ITextBtn } from '@/components';
import {
    createCurriculumCategory,
    listCurriculumCategories,
    listCurriculumCourses,
    removeCurriculumCategory,
    updateCurriculumCategory,
} from '@/apis/curriculum';
import { useApiMutation, useApiQuery } from '@/hooks';
import type { CurriculumCategory, CurriculumCategoryPayload } from '@/types';
import type { CurriculumTabProps } from '../types';
import i18n from '@/i18n';

const { Text } = Typography;

/**
 * Tab nhóm học phần **mô tả**: admin tự đặt tên nhóm theo từng chương trình
 * (ví dụ "Kinh tế - Chính trị - Xã hội - Luật") rồi gán các môn của chương trình vào.
 * Nhóm không ràng buộc số môn/tín chỉ như tab "Nhóm môn".
 */
const CategoriesTab = ({ curriculumId }: CurriculumTabProps) => {
    const queryClient = useQueryClient();
    const [form] = Form.useForm<CurriculumCategoryPayload>();
    const [open, setOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<CurriculumCategory | null>(null);

    const categoriesQuery = useApiQuery(
        ['curriculum-categories', curriculumId],
        () => listCurriculumCategories(curriculumId),
    );
    const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

    // Nhóm chỉ chứa được môn đã có trong chương trình (giống nhóm môn).
    const coursesQuery = useApiQuery(
        ['curriculum-courses', curriculumId],
        () => listCurriculumCourses(curriculumId),
    );

    const courseOptions = useMemo(
        () => (coursesQuery.data ?? []).map(item => ({
            value: item.course_id,
            label: i18n.t('{{code}} · {{name}} ({{credits}} TC)', { code: item.course.code, name: item.course.name, credits: item.course.credits }),
        })),
        [coursesQuery.data],
    );

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ['curriculum-categories', curriculumId] });
    };

    const createCategory = useApiMutation({
        mutationFn: (payload: CurriculumCategoryPayload) => createCurriculumCategory(curriculumId, payload),
        successMessage: i18n.t('Đã tạo nhóm học phần.'),
        onSuccess: () => {
            setOpen(false);
            form.resetFields();
            refresh();
        },
    });

    const updateCategory = useApiMutation({
        mutationFn: (input: { categoryId: string; payload: Partial<CurriculumCategoryPayload> }) =>
            updateCurriculumCategory(curriculumId, input.categoryId, input.payload),
        successMessage: i18n.t('Đã cập nhật nhóm học phần.'),
        onSuccess: () => {
            setOpen(false);
            form.resetFields();
            refresh();
        },
    });

    const removeCategory = useApiMutation({
        mutationFn: (categoryId: string) => removeCurriculumCategory(curriculumId, categoryId),
        successMessage: i18n.t('Đã xoá nhóm học phần.'),
        onSuccess: refresh,
    });

    const openCreate = () => {
        setEditingCategory(null);
        form.resetFields();
        setOpen(true);
    };

    const openEdit = (category: CurriculumCategory) => {
        setEditingCategory(category);
        form.resetFields();
        form.setFieldsValue({
            name: category.name,
            course_ids: category.members.map(member => member.course_id),
        });
        setOpen(true);
    };

    const submit = (values: CurriculumCategoryPayload) => {
        const payload: CurriculumCategoryPayload = {
            name: values.name.trim(),
            course_ids: values.course_ids ?? [],
        };

        if (editingCategory) {
            updateCategory.mutate({ categoryId: editingCategory.id, payload });
            return;
        }

        createCategory.mutate(payload);
    };

    const columns: ColumnsType<CurriculumCategory> = [
        {
            title: i18n.t('Tên nhóm'),
            dataIndex: 'name',
            render: (name: string) => <Text strong>{name}</Text>,
        },
        {
            title: i18n.t('Số môn'),
            key: 'members',
            width: 110,
            align: 'center',
            render: (_value, category) => i18n.t('{{length}} môn', { length: category.members.length }),
        },
        {
            title: i18n.t('Hành động'),
            key: 'actions',
            width: 190,
            render: (_value, category) => (
                <Space size={8}>
                    <ITextBtn size="small" icon={<LuPencil />} onClick={() => openEdit(category)}>
                        {i18n.t('Sửa')}
                    </ITextBtn>

                    <Popconfirm
                        title={i18n.t('Xoá nhóm học phần?')}
                        description={i18n.t('Chỉ xoá nhóm và các liên kết môn trong nhóm; môn của chương trình vẫn được giữ.')}
                        okText={i18n.t('Xoá')}
                        cancelText={i18n.t('Huỷ')}
                        okButtonProps={{ color: 'danger', variant: 'solid' }}
                        onConfirm={() => removeCategory.mutate(category.id)}
                    >
                        <ITextBtn
                            size="small"
                            color="danger"
                            icon={<LuTrash2 />}
                            loading={removeCategory.isPending && removeCategory.variables === category.id}
                        >
                            {i18n.t('Xoá')}
                        </ITextBtn>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const isEmpty = categories.length === 0 && !categoriesQuery.isLoading && !categoriesQuery.isError;

    return (
        <div className="stack">
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <Text type="secondary">
                    {i18n.t('Nhóm học phần chỉ mang tính mô tả: tên nhóm do bạn tự đặt theo từng chương trình, không ràng buộc số môn hay số tín chỉ. Một môn có thể thuộc nhiều nhóm trong cùng chương trình, và cùng một môn có thể mang tên nhóm khác nhau ở các chương trình khác nhau.')}
                </Text>

                <ISolidBtn icon={<LuPlus />} onClick={openCreate}>{i18n.t('Tạo nhóm học phần')}</ISolidBtn>
            </div>

            {categoriesQuery.isError && (
                <Alert
                    type="error"
                    showIcon
                    title={i18n.t('Không tải được danh sách nhóm học phần')}
                    description={categoriesQuery.error?.message ?? i18n.t('Vui lòng tải lại trang để thử lại.')}
                />
            )}

            {isEmpty && (
                <EmptyState
                    title={i18n.t('Chương trình chưa có nhóm học phần')}
                    description={i18n.t('Tạo nhóm như “Kinh tế - Chính trị - Xã hội - Luật” rồi gán các môn của chương trình vào nhóm. Một môn có thể nằm trong nhiều nhóm.')}
                    action={<ISolidBtn icon={<LuPlus />} onClick={openCreate}>{i18n.t('Tạo nhóm học phần')}</ISolidBtn>}
                />
            )}

            {!isEmpty && !categoriesQuery.isError && (
                <ITable<CurriculumCategory>
                    showIndex={false}
                    columns={columns}
                    dataSource={categories}
                    rowKey="id"
                    pagination={false}
                    loading={categoriesQuery.isLoading}
                    emptyText={i18n.t('Chương trình chưa có nhóm học phần')}
                    expandable={{
                        expandedRowRender: category => (category.members.length === 0
                            ? <Text type="secondary">{i18n.t('Nhóm chưa có môn nào.')}</Text>
                            : (
                                <ol style={{ margin: 0, paddingLeft: 24 }}>
                                    {[...category.members]
                                        .sort((a, b) => a.course.code.localeCompare(b.course.code))
                                        .map(member => (
                                            <li key={member.course_id} style={{ padding: '2px 0' }}>
                                                <Text strong>{member.course.code}</Text>
                                                {` · ${member.course.name} `}
                                                <Text type="secondary">({member.course.credits}{' '}{i18n.t('TC)')}</Text>
                                            </li>
                                        ))}
                                </ol>
                            )),
                    }}
                />
            )}

            <Modal
                open={open}
                title={editingCategory ? i18n.t('Sửa nhóm học phần') : i18n.t('Tạo nhóm học phần')}
                okText={editingCategory ? i18n.t('Lưu') : i18n.t('Tạo nhóm')}
                cancelText={i18n.t('Huỷ')}
                confirmLoading={createCategory.isPending || updateCategory.isPending}
                forceRender
                onCancel={() => setOpen(false)}
                onOk={() => form.submit()}
            >
                {courseOptions.length === 0 && coursesQuery.isSuccess && (
                    <Alert
                        type="info"
                        showIcon
                        title={i18n.t('Chương trình chưa có môn học')}
                        description={i18n.t('Thêm môn ở tab “Môn học” trước khi gán môn cho nhóm.')}
                        style={{ marginBottom: 16 }}
                    />
                )}

                <Form<CurriculumCategoryPayload>
                    form={form}
                    layout="vertical"
                    initialValues={{ course_ids: [] }}
                    onFinish={submit}
                >
                    <FormField
                        name="name"
                        label={i18n.t('Tên nhóm học phần')}
                        placeholder={i18n.t('Kinh tế - Chính trị - Xã hội - Luật')}
                        hint={i18n.t('Tên do bạn tự đặt, không giới hạn theo danh sách cố định.')}
                        rules={[
                            { required: true, whitespace: true, message: i18n.t('Nhập tên nhóm học phần.') },
                            { max: 255, message: i18n.t('Tên nhóm tối đa 255 ký tự.') },
                        ]}
                    />

                    <Form.Item
                        name="course_ids"
                        label={i18n.t('Môn trong nhóm')}
                        extra={i18n.t('Chỉ chọn được môn đã có trong chương trình; một môn có thể nằm trong nhiều nhóm. Lưu nhóm sẽ thay toàn bộ danh sách môn của nhóm.')}
                    >
                        <Select
                            mode="multiple"
                            allowClear
                            placeholder={i18n.t('Chọn môn cho nhóm')}
                            showSearch={{ optionFilterProp: 'label' }}
                            options={courseOptions}
                            loading={coursesQuery.isLoading}
                            style={{ width: '100%' }}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default CategoriesTab;
