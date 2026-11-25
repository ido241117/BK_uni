import { useState } from 'react';
import {
    Alert, Card, Descriptions, Form, Input, InputNumber, Modal, Space, Tabs, Tag, Typography,
} from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { LuArrowLeft, LuPencil } from 'react-icons/lu';
import { Link, useNavigate, useParams } from 'react-router';
import { IOutLinedBtn, ISolidBtn, PageHeader, PageLoading } from '@/components';
import { createCurriculum, getCurriculum, updateCurriculum } from '@/apis/curriculum';
import { useApiMutation, useApiQuery } from '@/hooks';
import type { Curriculum, CurriculumPayload } from '@/types';
import CoursesTab from './components/CoursesTab';
import CategoriesTab from './components/CategoriesTab';
import GroupsTab from './components/GroupsTab';
import RegulationsTab from './components/RegulationsTab';
import RelationsTab from './components/RelationsTab';
import i18n from '@/i18n';
import { trLive } from '@/i18n/live';

const { Paragraph, Text } = Typography;

const numberField = { min: 0, max: 20, precision: 0 };

/** Tín chỉ/kỳ: không giới hạn trên, chỉ yêu cầu > 0 và tối đa ≥ tối thiểu. */
const creditRules = trLive({
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
});

/** Bộ field dùng chung cho form tạo và form sửa chương trình. */
const CurriculumFields = () => (
    <>
        <Form.Item name="code" label={i18n.t('Mã chương trình')} rules={[{ required: true, message: i18n.t('Nhập mã chương trình.') }, { max: 50 }]}>
            <Input placeholder="CS-2023" />
        </Form.Item>
        <Form.Item name="name" label={i18n.t('Tên chương trình')} rules={[{ required: true, message: i18n.t('Nhập tên chương trình.') }, { max: 255 }]}>
            <Input placeholder={i18n.t('Khoa học máy tính')} />
        </Form.Item>
        <Form.Item name="major" label={i18n.t('Ngành')} rules={[{ required: true, message: i18n.t('Nhập ngành.') }, { max: 255 }]}>
            <Input placeholder={i18n.t('Công nghệ thông tin')} />
        </Form.Item>
        <Form.Item name="faculty" label={i18n.t('Khoa')} rules={[{ required: true, message: i18n.t('Nhập khoa.') }, { max: 255 }]}>
            <Input placeholder={i18n.t('Khoa Công nghệ thông tin')} />
        </Form.Item>
        <Space size={12} wrap>
            <Form.Item name="cohort" label={i18n.t('Khóa')} rules={[{ required: true, message: i18n.t('Nhập khóa.') }]}>
                <InputNumber {...numberField} min={2000} max={2100} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="duration_years" label={i18n.t('Số năm')} rules={[{ required: true, message: i18n.t('Nhập số năm.') }]}>
                <InputNumber {...numberField} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="min_semester_credits" label={i18n.t('TC tối thiểu/kỳ')} rules={creditRules.min}>
                <InputNumber precision={0} style={{ width: 150 }} />
            </Form.Item>
            <Form.Item
                name="max_semester_credits"
                label={i18n.t('TC tối đa/kỳ')}
                dependencies={['min_semester_credits']}
                rules={creditRules.max}
            >
                <InputNumber precision={0} style={{ width: 150 }} />
            </Form.Item>
        </Space>
        <Form.Item name="description" label={i18n.t('Mô tả')}>
            <Input.TextArea rows={3} placeholder={i18n.t('Mô tả ngắn về chương trình (không bắt buộc)')} />
        </Form.Item>
    </>
);

const CurriculumCreate = () => {
    const navigate = useNavigate();
    const [form] = Form.useForm<CurriculumPayload>();

    const create = useApiMutation({
        mutationFn: (payload: CurriculumPayload) => createCurriculum(payload),
        successMessage: i18n.t('Đã tạo chương trình đào tạo.'),
        onSuccess: (created) => navigate(`/admin/curricula/${created.id}`, { replace: true }),
    });

    return (
        <section>
            <PageHeader
                title={i18n.t('Tạo chương trình đào tạo')}
                subtitle={i18n.t('Sau khi tạo, bạn có thể thêm môn, nhóm môn, nhóm học phần, quan hệ và quy định.')}
                extra={<Link to="/admin/curricula"><IOutLinedBtn icon={<LuArrowLeft />}>{i18n.t('Danh sách')}</IOutLinedBtn></Link>}
            />

            <Card>
                <Form<CurriculumPayload>
                    form={form}
                    layout="vertical"
                    initialValues={{ cohort: new Date().getFullYear(), duration_years: 4, min_semester_credits: 1, max_semester_credits: 18 }}
                    onFinish={values => create.mutate(values)}
                >
                    <CurriculumFields />
                    <ISolidBtn htmlType="submit" loading={create.isPending}>{i18n.t('Tạo chương trình')}</ISolidBtn>
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
        successMessage: i18n.t('Đã cập nhật chương trình.'),
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
        return <PageLoading />;
    }

    if (isError || !curriculum) {
        return (
            <Alert
                type="error"
                showIcon
                title={i18n.t('Không tải được chương trình')}
                description={error?.message ?? i18n.t('Chương trình không tồn tại hoặc đã bị xoá.')}
                action={<Link to="/admin/curricula"><IOutLinedBtn>{i18n.t('Về danh sách')}</IOutLinedBtn></Link>}
            />
        );
    }

    return (
        <section>
            <PageHeader
                title={`${curriculum.code} · ${curriculum.name}`}
                subtitle={i18n.t('{{major}} · {{faculty}} · Khóa {{cohort}}', { major: curriculum.major, faculty: curriculum.faculty, cohort: curriculum.cohort })}
                extra={(
                    <Space>
                        <IOutLinedBtn icon={<LuPencil />} onClick={() => openEdit(curriculum)}>{i18n.t('Sửa thông tin')}</IOutLinedBtn>
                        <Link to="/admin/curricula"><IOutLinedBtn icon={<LuArrowLeft />}>{i18n.t('Danh sách')}</IOutLinedBtn></Link>
                    </Space>
                )}
            />

            <Card style={{ marginBottom: 16 }}>
                <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} size="middle">
                    <Descriptions.Item label={i18n.t('Thời lượng')}><Text>{curriculum.duration_years}{' '}{i18n.t('năm')}</Text></Descriptions.Item>
                    <Descriptions.Item label={i18n.t('Tín chỉ/kỳ')}>
                        <Tag>{curriculum.min_semester_credits} – {curriculum.max_semester_credits}{' '}{i18n.t('TC')}</Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label={i18n.t('Cập nhật')}>
                        {new Date(curriculum.updated_at).toLocaleString('vi-VN')}
                    </Descriptions.Item>
                    <Descriptions.Item label={i18n.t('Tổng tín chỉ')}>
                        {curriculum.total_credits !== null
                            ? <Tag color="geekblue">{curriculum.total_credits}{' '}{i18n.t('TC')}</Tag>
                            : <Text type="secondary">{i18n.t('Chưa khai')}</Text>}
                    </Descriptions.Item>
                    <Descriptions.Item label={i18n.t('Chuyên ngành')}>
                        {curriculum.specialization_required
                            ? <Tag color="orange">{i18n.t('Bắt buộc đạt một chuyên ngành')}</Tag>
                            : <Text type="secondary">{i18n.t('Tùy chọn')}</Text>}
                    </Descriptions.Item>
                    <Descriptions.Item label={i18n.t('Nguồn')}>
                        {curriculum.source_code
                            ? <Text code>{curriculum.source_system}: {curriculum.source_version ?? curriculum.source_code} (id {curriculum.source_id})</Text>
                            : <Text type="secondary">{i18n.t('Nhập tay')}</Text>}
                    </Descriptions.Item>
                    <Descriptions.Item label={i18n.t('Mô tả')} span={3}>
                        {curriculum.description
                            ? <Paragraph style={{ margin: 0 }}>{curriculum.description}</Paragraph>
                            : <Text type="secondary">{i18n.t('Chưa có mô tả')}</Text>}
                    </Descriptions.Item>
                </Descriptions>
            </Card>

            <Card>
                <Tabs
                    destroyOnHidden
                    items={[
                        { key: 'courses', label: i18n.t('Môn học'), children: <CoursesTab curriculumId={curriculumId} /> },
                        { key: 'groups', label: i18n.t('Nhóm môn'), children: <GroupsTab curriculumId={curriculumId} /> },
                        {
                            key: 'categories',
                            label: i18n.t('Nhóm học phần'),
                            children: <CategoriesTab curriculumId={curriculumId} />,
                        },
                        { key: 'relations', label: i18n.t('Quan hệ môn'), children: <RelationsTab curriculumId={curriculumId} /> },
                        { key: 'regulations', label: i18n.t('Quy định'), children: <RegulationsTab curriculumId={curriculumId} /> },
                    ]}
                />
            </Card>

            <Modal
                open={editing}
                title={i18n.t('Sửa thông tin chương trình')}
                okText={i18n.t('Lưu')}
                cancelText={i18n.t('Huỷ')}
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
