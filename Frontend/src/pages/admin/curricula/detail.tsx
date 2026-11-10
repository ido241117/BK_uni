import { useState } from 'react';
import {
    Alert, Card, Descriptions, Form, Input, InputNumber, Modal, Space, Spin, Tabs, Tag, Typography,
} from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { LuArrowLeft, LuPencil } from 'react-icons/lu';
import { Link, useNavigate, useParams } from 'react-router';
import { IOutLinedBtn, ISolidBtn, PageHeader } from '@/components';
import { createCurriculum, getCurriculum, updateCurriculum } from '@/apis/curriculum';
import { useApiMutation, useApiQuery } from '@/hooks';
import type { Curriculum, CurriculumPayload } from '@/types';
import CoursesTab from './components/CoursesTab';
import CategoriesTab from './components/CategoriesTab';
import GroupsTab from './components/GroupsTab';
import RegulationsTab from './components/RegulationsTab';
import RelationsTab from './components/RelationsTab';

const { Paragraph, Text } = Typography;

const numberField = { min: 0, max: 20, precision: 0 };

/** Tín chỉ/kỳ: không giới hạn trên, chỉ yêu cầu > 0 và tối đa ≥ tối thiểu. */
const creditRules = {
    min: [
        { required: true, message: 'Nhập số tín chỉ.' },
        { type: 'number' as const, min: 1, message: 'Tín chỉ phải lớn hơn 0.' },
    ],
    max: [
        { required: true, message: 'Nhập số tín chỉ.' },
        { type: 'number' as const, min: 1, message: 'Tín chỉ phải lớn hơn 0.' },
        ({ getFieldValue }: { getFieldValue: (name: string) => unknown }) => ({
            validator: (_rule: unknown, value: number | null | undefined) => {
                const min = getFieldValue('min_semester_credits') as number | null | undefined;
                return value == null || min == null || value >= min
                    ? Promise.resolve()
                    : Promise.reject(new Error('Tối đa phải lớn hơn hoặc bằng tối thiểu.'));
            },
        }),
    ],
};

/** Bộ field dùng chung cho form tạo và form sửa chương trình. */
const CurriculumFields = () => (
    <>
        <Form.Item name="code" label="Mã chương trình" rules={[{ required: true, message: 'Nhập mã chương trình.' }, { max: 50 }]}>
            <Input placeholder="CS-2023" />
        </Form.Item>
        <Form.Item name="name" label="Tên chương trình" rules={[{ required: true, message: 'Nhập tên chương trình.' }, { max: 255 }]}>
            <Input placeholder="Khoa học máy tính" />
        </Form.Item>
        <Form.Item name="major" label="Ngành" rules={[{ required: true, message: 'Nhập ngành.' }, { max: 255 }]}>
            <Input placeholder="Công nghệ thông tin" />
        </Form.Item>
        <Form.Item name="faculty" label="Khoa" rules={[{ required: true, message: 'Nhập khoa.' }, { max: 255 }]}>
            <Input placeholder="Khoa Công nghệ thông tin" />
        </Form.Item>
        <Space size={12} wrap>
            <Form.Item name="cohort" label="Khóa" rules={[{ required: true, message: 'Nhập khóa.' }]}>
                <InputNumber {...numberField} min={2000} max={2100} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="duration_years" label="Số năm" rules={[{ required: true, message: 'Nhập số năm.' }]}>
                <InputNumber {...numberField} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="min_semester_credits" label="TC tối thiểu/kỳ" rules={creditRules.min}>
                <InputNumber precision={0} style={{ width: 150 }} />
            </Form.Item>
            <Form.Item
                name="max_semester_credits"
                label="TC tối đa/kỳ"
                dependencies={['min_semester_credits']}
                rules={creditRules.max}
            >
                <InputNumber precision={0} style={{ width: 150 }} />
            </Form.Item>
        </Space>
        <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Mô tả ngắn về chương trình (không bắt buộc)" />
        </Form.Item>
    </>
);

const CurriculumCreate = () => {
    const navigate = useNavigate();
    const [form] = Form.useForm<CurriculumPayload>();

    const create = useApiMutation({
        mutationFn: (payload: CurriculumPayload) => createCurriculum(payload),
        successMessage: 'Đã tạo chương trình đào tạo.',
        onSuccess: (created) => navigate(`/admin/curricula/${created.id}`, { replace: true }),
    });

    return (
        <section>
            <PageHeader
                title="Tạo chương trình đào tạo"
                subtitle="Sau khi tạo, bạn có thể thêm môn, nhóm môn, nhóm học phần, quan hệ và quy định."
                extra={<Link to="/admin/curricula"><IOutLinedBtn icon={<LuArrowLeft />}>Danh sách</IOutLinedBtn></Link>}
            />

            <Card>
                <Form<CurriculumPayload>
                    form={form}
                    layout="vertical"
                    initialValues={{ cohort: new Date().getFullYear(), duration_years: 4, min_semester_credits: 1, max_semester_credits: 18 }}
                    onFinish={values => create.mutate(values)}
                >
                    <CurriculumFields />
                    <ISolidBtn htmlType="submit" loading={create.isPending}>Tạo chương trình</ISolidBtn>
                </Form>
            </Card>
        </section>
    );
};

const CurriculumEditor = ({ curriculumId }: { curriculumId: string }) => {
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [form] = Form.useForm<CurriculumPayload>();

    const { data: curriculum, isLoading, isError, error } = useApiQuery(
        ['curriculum', curriculumId],
        () => getCurriculum(curriculumId),
    );

    const update = useApiMutation({
        mutationFn: (payload: CurriculumPayload) => updateCurriculum(curriculumId, payload),
        successMessage: 'Đã cập nhật chương trình.',
        onSuccess: (saved) => {
            // Hiển thị ngay bản vừa lưu, rồi làm mới chi tiết và danh sách chương trình.
            queryClient.setQueryData(['curriculum', curriculumId], saved);
            void queryClient.invalidateQueries({ queryKey: ['curriculum', curriculumId] });
            void queryClient.invalidateQueries({ queryKey: ['curricula'] });
            setEditing(false);
        },
    });

    const openEdit = (value: Curriculum) => {
        form.setFieldsValue({
            code: value.code,
            name: value.name,
            major: value.major,
            faculty: value.faculty,
            cohort: value.cohort,
            duration_years: value.duration_years,
            min_semester_credits: value.min_semester_credits,
            max_semester_credits: value.max_semester_credits,
            description: value.description ?? undefined,
        });
        setEditing(true);
    };

    if (isLoading) {
        return <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}><Spin size="large" /></div>;
    }

    if (isError || !curriculum) {
        return (
            <Alert
                type="error"
                showIcon
                title="Không tải được chương trình"
                description={error?.message ?? 'Chương trình không tồn tại hoặc đã bị xoá.'}
                action={<Link to="/admin/curricula"><IOutLinedBtn>Về danh sách</IOutLinedBtn></Link>}
            />
        );
    }

    return (
        <section>
            <PageHeader
                title={`${curriculum.code} · ${curriculum.name}`}
                subtitle={`${curriculum.major} · ${curriculum.faculty} · Khóa ${curriculum.cohort}`}
                extra={(
                    <Space>
                        <IOutLinedBtn icon={<LuPencil />} onClick={() => openEdit(curriculum)}>Sửa thông tin</IOutLinedBtn>
                        <Link to="/admin/curricula"><IOutLinedBtn icon={<LuArrowLeft />}>Danh sách</IOutLinedBtn></Link>
                    </Space>
                )}
            />

            <Card style={{ marginBottom: 16 }}>
                <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="middle">
                    <Descriptions.Item label="Thời lượng"><Text>{curriculum.duration_years} năm</Text></Descriptions.Item>
                    <Descriptions.Item label="Tín chỉ/kỳ">
                        <Tag>{curriculum.min_semester_credits} – {curriculum.max_semester_credits} TC</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Cập nhật">
                        {new Date(curriculum.updated_at).toLocaleString('vi-VN')}
                    </Descriptions.Item>
                    <Descriptions.Item label="Mô tả" span={3}>
                        {curriculum.description
                            ? <Paragraph style={{ margin: 0 }}>{curriculum.description}</Paragraph>
                            : <Text type="secondary">Chưa có mô tả</Text>}
                    </Descriptions.Item>
                </Descriptions>
            </Card>

            <Card>
                <Tabs
                    destroyOnHidden
                    items={[
                        { key: 'courses', label: 'Môn học', children: <CoursesTab curriculumId={curriculumId} /> },
                        { key: 'groups', label: 'Nhóm môn', children: <GroupsTab curriculumId={curriculumId} /> },
                        {
                            key: 'categories',
                            label: 'Nhóm học phần',
                            children: <CategoriesTab curriculumId={curriculumId} />,
                        },
                        { key: 'relations', label: 'Quan hệ môn', children: <RelationsTab curriculumId={curriculumId} /> },
                        { key: 'regulations', label: 'Quy định', children: <RegulationsTab curriculumId={curriculumId} /> },
                    ]}
                />
            </Card>

            <Modal
                open={editing}
                title="Sửa thông tin chương trình"
                okText="Lưu"
                cancelText="Huỷ"
                confirmLoading={update.isPending}
                onCancel={() => setEditing(false)}
                onOk={() => form.submit()}
                destroyOnHidden
            >
                <Form<CurriculumPayload> form={form} layout="vertical" onFinish={values => update.mutate(values)}>
                    <CurriculumFields />
                </Form>
            </Modal>
        </section>
    );
};

const CurriculumDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    return id ? <CurriculumEditor curriculumId={id} /> : <CurriculumCreate />;
};

export default CurriculumDetailPage;
