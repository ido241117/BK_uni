import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Card,
    Col,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Row,
    Space,
    Tag,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import { LuPencil, LuPlus, LuSearch, LuTrash2 } from 'react-icons/lu';
import { Link, useLocation, useNavigate } from 'react-router';
import {
    FormField,
    IconBtn,
    IOutLinedBtn,
    ITable,
    ISolidBtn,
    PageHeader,
    TablePageSkeleton,
} from '@/components';
import { createCurriculum, deleteCurriculum, listCurricula, updateCurriculum } from '@/apis/curriculum';
import { useApiMutation, useApiQuery, useDebounce, usePageLocation } from '@/hooks';
import { toastMessage } from '@/utils/toast';
import type { Curriculum, CurriculumPayload } from '@/types';

const { Text } = Typography;

/**
 * Cảnh báo xoá: backend xoá theo toàn bộ dữ liệu con và dòng kế hoạch của sinh viên,
 * không có xác nhận phía server nên Popconfirm phải nói rõ hậu quả.
 */
const DELETE_WARNING = 'Thao tác sẽ xoá vĩnh viễn môn trong chương trình, nhóm môn, thành viên nhóm, '
    + 'quan hệ môn, quy định và dòng kế hoạch học tập của sinh viên thuộc chương trình. Không thể hoàn tác.';

/** Giá trị gợi ý khi tạo mới; các trường số là số nguyên. */
const DEFAULT_FORM_VALUES: Partial<CurriculumPayload> = {
    cohort: new Date().getFullYear(),
    duration_years: 4,
    min_semester_credits: 1,
    max_semester_credits: 18,
};

/** Chuẩn hoá form → payload: bỏ khoảng trắng thừa, mô tả rỗng gửi `null`. */
const toPayload = (values: CurriculumPayload): CurriculumPayload => {
    const description = values.description?.trim();

    return {
        code: values.code.trim(),
        name: values.name.trim(),
        major: values.major.trim(),
        faculty: values.faculty.trim(),
        cohort: values.cohort,
        duration_years: values.duration_years,
        min_semester_credits: values.min_semester_credits,
        max_semester_credits: values.max_semester_credits,
        description: description ? description : null,
    };
};

/** PATCH chỉ gửi trường thực sự thay đổi, tránh ghi đè dữ liệu người khác vừa sửa. */
const toPatch = (values: CurriculumPayload, current: Curriculum): Partial<CurriculumPayload> => {
    const next = toPayload(values);
    const patch: Partial<CurriculumPayload> = {};

    if (next.code !== current.code) patch.code = next.code;
    if (next.name !== current.name) patch.name = next.name;
    if (next.major !== current.major) patch.major = next.major;
    if (next.faculty !== current.faculty) patch.faculty = next.faculty;
    if (next.cohort !== current.cohort) patch.cohort = next.cohort;
    if (next.duration_years !== current.duration_years) patch.duration_years = next.duration_years;
    if (next.min_semester_credits !== current.min_semester_credits) {
        patch.min_semester_credits = next.min_semester_credits;
    }
    if (next.max_semester_credits !== current.max_semester_credits) {
        patch.max_semester_credits = next.max_semester_credits;
    }
    if ((next.description ?? null) !== (current.description ?? null)) {
        patch.description = next.description ?? null;
    }

    return patch;
};

interface CurriculumFormModalProps {
    open: boolean;
    /** `null` là tạo mới, có giá trị là sửa bản ghi đó. */
    curriculum: Curriculum | null;
    onClose: () => void;
}

/** Modal dùng chung cho tạo và sửa: cùng bộ trường, khác cách gọi API. */
const CurriculumFormModal = ({ open, curriculum, onClose }: CurriculumFormModalProps) => {
    const [form] = Form.useForm<CurriculumPayload>();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!open) return;

        form.resetFields();
        if (!curriculum) return;

        form.setFieldsValue({
            code: curriculum.code,
            name: curriculum.name,
            major: curriculum.major,
            faculty: curriculum.faculty,
            cohort: curriculum.cohort,
            duration_years: curriculum.duration_years,
            min_semester_credits: curriculum.min_semester_credits,
            max_semester_credits: curriculum.max_semester_credits,
            description: curriculum.description ?? undefined,
        });
    }, [curriculum, form, open]);

    const invalidateList = () => queryClient.invalidateQueries({ queryKey: ['curricula'] });

    const create = useApiMutation({
        mutationFn: (payload: CurriculumPayload) => createCurriculum(payload),
        successMessage: 'Đã tạo chương trình đào tạo.',
        onSuccess: () => {
            void invalidateList();
            onClose();
        },
    });

    const update = useApiMutation({
        mutationFn: (variables: { curriculumId: string; payload: Partial<CurriculumPayload> }) =>
            updateCurriculum(variables.curriculumId, variables.payload),
        successMessage: 'Đã cập nhật chương trình đào tạo.',
        onSuccess: (_saved, variables) => {
            void invalidateList();
            // Trang chi tiết dùng cache riêng; làm mới để mở ra không thấy dữ liệu cũ.
            void queryClient.invalidateQueries({ queryKey: ['curriculum', variables.curriculumId] });
            onClose();
        },
    });

    const isPending = create.isPending || update.isPending;

    const handleFinish = (values: CurriculumPayload) => {
        if (!curriculum) {
            create.mutate(toPayload(values));
            return;
        }

        const payload = toPatch(values, curriculum);
        if (Object.keys(payload).length === 0) {
            toastMessage.info('Không có thay đổi nào để lưu.');
            onClose();
            return;
        }

        update.mutate({ curriculumId: curriculum.id, payload });
    };

    return (
        <Modal
            open={open}
            title={curriculum ? `Sửa chương trình ${curriculum.code}` : 'Tạo chương trình đào tạo'}
            okText={curriculum ? 'Lưu thay đổi' : 'Tạo chương trình'}
            cancelText="Huỷ"
            width={760}
            maskClosable={false}
            confirmLoading={isPending}
            onOk={() => form.submit()}
            onCancel={onClose}
            destroyOnHidden
        >
            <Form<CurriculumPayload>
                form={form}
                layout="vertical"
                initialValues={DEFAULT_FORM_VALUES}
                onFinish={handleFinish}
                disabled={isPending}
            >
                <Row gutter={16}>
                    <Col xs={24} sm={12}>
                        <FormField
                            name="code"
                            label="Mã chương trình"
                            placeholder="CS-2023"
                            hint="Tối đa 50 ký tự và không trùng với chương trình khác."
                            rules={[
                                { required: true, message: 'Nhập mã chương trình.' },
                                { max: 50, message: 'Mã chương trình tối đa 50 ký tự.' },
                            ]}
                            inputProps={{ maxLength: 50, allowClear: true, autoComplete: 'off' }}
                        />
                    </Col>
                    <Col xs={24} sm={12}>
                        <FormField
                            name="name"
                            label="Tên chương trình"
                            placeholder="Khoa học máy tính"
                            rules={[{ required: true, message: 'Nhập tên chương trình.' }]}
                            inputProps={{ maxLength: 255 }}
                        />
                    </Col>
                    <Col xs={24} sm={12}>
                        <FormField
                            name="major"
                            label="Ngành"
                            placeholder="Công nghệ thông tin"
                            rules={[{ required: true, message: 'Nhập ngành.' }]}
                            inputProps={{ maxLength: 255 }}
                        />
                    </Col>
                    <Col xs={24} sm={12}>
                        <FormField
                            name="faculty"
                            label="Khoa"
                            placeholder="Khoa Công nghệ thông tin"
                            rules={[{ required: true, message: 'Nhập khoa.' }]}
                            inputProps={{ maxLength: 255 }}
                        />
                    </Col>
                </Row>

                <Row gutter={16}>
                    <Col xs={12} sm={6}>
                        <Form.Item
                            name="cohort"
                            label="Khóa"
                            rules={[{ required: true, message: 'Nhập khóa.' }]}
                        >
                            <InputNumber
                                size="large"
                                precision={0}
                                min={1900}
                                max={2200}
                                placeholder="2023"
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={12} sm={6}>
                        <Form.Item
                            name="duration_years"
                            label="Số năm"
                            rules={[{ required: true, message: 'Nhập số năm.' }]}
                        >
                            <InputNumber
                                size="large"
                                precision={0}
                                min={1}
                                max={10}
                                placeholder="4"
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={12} sm={6}>
                        <Form.Item
                            name="min_semester_credits"
                            label="TC tối thiểu/kỳ"
                            rules={[
                                { required: true, message: 'Nhập số tín chỉ.' },
                                { type: 'number', min: 1, message: 'Tín chỉ phải lớn hơn 0.' },
                            ]}
                        >
                            <InputNumber
                                size="large"
                                precision={0}
                                placeholder="1"
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={12} sm={6}>
                        <Form.Item
                            name="max_semester_credits"
                            label="TC tối đa/kỳ"
                            dependencies={['min_semester_credits']}
                            rules={[
                                { required: true, message: 'Nhập số tín chỉ.' },
                                { type: 'number', min: 1, message: 'Tín chỉ phải lớn hơn 0.' },
                                ({ getFieldValue }) => ({
                                    validator(_rule, value: number | null) {
                                        const min = getFieldValue('min_semester_credits') as number | null | undefined;
                                        if (value == null || min == null || value >= min) {
                                            return Promise.resolve();
                                        }

                                        return Promise.reject(new Error('Tối đa phải lớn hơn hoặc bằng tối thiểu.'));
                                    },
                                }),
                            ]}
                        >
                            <InputNumber
                                size="large"
                                precision={0}
                                placeholder="18"
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Form.Item name="description" label="Mô tả">
                    <Input.TextArea
                        rows={4}
                        size="large"
                        maxLength={1000}
                        placeholder="Mô tả ngắn về chương trình (không bắt buộc)"
                    />
                </Form.Item>
            </Form>
        </Modal>
    );
};

const AdminCurriculaPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();

    const { page, pageSize, filters } = usePageLocation<{ search?: string }>();

    const urlSearch = (filters?.search ?? '').trim();
    const [search, setSearch] = useState(filters?.search ?? '');
    const debouncedSearch = useDebounce(search, 400);
    const normalizedSearch = debouncedSearch.trim();

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<Curriculum | null>(null);

    /** Từ khoá đang khớp giữa ô nhập và URL — phân biệt "người dùng gõ" với "URL đổi từ bên ngoài". */
    const syncedSearchRef = useRef(urlSearch);

    // Người dùng gõ: sau khi debounce thì đẩy từ khoá lên URL và quay về trang 1.
    useEffect(() => {
        if (normalizedSearch === syncedSearchRef.current) return;
        syncedSearchRef.current = normalizedSearch;

        const params = new URLSearchParams(location.search);
        params.set('page', '1');
        params.set('pageSize', String(pageSize));

        if (normalizedSearch) {
            params.set('search', normalizedSearch);
        } else {
            params.delete('search');
        }

        navigate(`?${params.toString()}`, { replace: true });
    }, [location.search, navigate, normalizedSearch, pageSize]);

    // URL đổi từ bên ngoài (back/forward, mở link) thì cập nhật lại ô tìm kiếm.
    useEffect(() => {
        if (urlSearch === syncedSearchRef.current) return;
        syncedSearchRef.current = urlSearch;
        setSearch(urlSearch);
    }, [urlSearch]);

    const listQuery = useApiQuery(
        ['curricula', page, pageSize, urlSearch],
        () => listCurricula({ page, take: pageSize, search: urlSearch || undefined }),
        { placeholderData: previous => previous },
    );

    const curricula = listQuery.data?.items ?? [];
    const total = listQuery.data?.pagination.itemCount ?? 0;

    const remove = useApiMutation({
        mutationFn: (curriculumId: string) => deleteCurriculum(curriculumId),
        successMessage: 'Đã xoá chương trình đào tạo.',
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['curricula'] });
        },
    });

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const openEdit = (curriculum: Curriculum) => {
        setEditing(curriculum);
        setFormOpen(true);
    };

    const closeForm = () => setFormOpen(false);

    const goToPage = (nextPage: number) => {
        const params = new URLSearchParams(location.search);
        params.set('page', String(nextPage));
        params.set('pageSize', String(pageSize));
        navigate(`?${params.toString()}`, { replace: true });
    };

    const handleDelete = (curriculum: Curriculum) => {
        remove.mutate(curriculum.id, {
            onSuccess: () => {
                // Xoá bản ghi cuối cùng của trang cuối thì lùi lại để không gặp bảng rỗng.
                if (page > 1 && curricula.length === 1) goToPage(page - 1);
            },
        });
    };

    const columns: ColumnsType<Curriculum> = [
        {
            title: 'Mã',
            dataIndex: 'code',
            width: 130,
            render: (code: string, record) => (
                <Link to={`/admin/curricula/${record.id}`}>
                    <Text strong>{code}</Text>
                </Link>
            ),
        },
        {
            title: 'Tên chương trình',
            dataIndex: 'name',
            render: (name: string, record) => <Link to={`/admin/curricula/${record.id}`}>{name}</Link>,
        },
        { title: 'Ngành', dataIndex: 'major' },
        { title: 'Khoa', dataIndex: 'faculty' },
        {
            title: 'Khóa',
            dataIndex: 'cohort',
            width: 96,
            align: 'center',
            render: (cohort: number) => <Tag>{cohort}</Tag>,
        },
        {
            title: 'Thời lượng',
            dataIndex: 'duration_years',
            width: 116,
            align: 'center',
            render: (years: number) => `${years} năm`,
        },
        {
            title: 'Tín chỉ/kỳ',
            key: 'credits',
            width: 132,
            align: 'center',
            render: (_value, record) => (
                <Tag>{record.min_semester_credits} – {record.max_semester_credits} TC</Tag>
            ),
        },
        {
            title: 'Hành động',
            key: 'actions',
            width: 108,
            align: 'center',
            render: (_value, record) => (
                <Space size={4}>
                    <IconBtn
                        icon={<LuPencil />}
                        label={`Sửa chương trình ${record.code}`}
                        color="primary"
                        onClick={() => openEdit(record)}
                    />

                    <Popconfirm
                        title={`Xoá chương trình ${record.code}?`}
                        description={(
                            <span style={{ display: 'inline-block', maxWidth: 280 }}>{DELETE_WARNING}</span>
                        )}
                        okText="Xoá chương trình"
                        cancelText="Huỷ"
                        okButtonProps={{
                            color: 'danger',
                            variant: 'solid',
                            loading: remove.isPending && remove.variables === record.id,
                        }}
                        onConfirm={() => handleDelete(record)}
                    >
                        <IconBtn
                            icon={<LuTrash2 />}
                            label={`Xoá chương trình ${record.code}`}
                            color="danger"
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    if (listQuery.isLoading && !listQuery.data) {
        return <TablePageSkeleton />;
    }

    return (
        <section>
            <PageHeader
                title="Chương trình đào tạo"
                subtitle="Quản lý chương trình: thông tin chung, môn học, nhóm môn, quan hệ môn và quy định."
                extra={<ISolidBtn icon={<LuPlus />} onClick={openCreate}>Tạo chương trình</ISolidBtn>}
            />

            <Card>
                <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                    <Input
                        allowClear
                        size="large"
                        prefix={<LuSearch />}
                        placeholder="Tìm theo mã, tên chương trình hoặc khoa"
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        style={{ maxWidth: 420 }}
                    />

                    {listQuery.isError && (
                        <Alert
                            type="error"
                            showIcon
                            title="Không tải được danh sách chương trình"
                            description={listQuery.error?.message ?? 'Vui lòng thử lại sau.'}
                            action={<IOutLinedBtn onClick={() => void listQuery.refetch()}>Thử lại</IOutLinedBtn>}
                        />
                    )}

                    <ITable<Curriculum>
                        showIndex={false}
                        rowKey="id"
                        columns={columns}
                        dataSource={curricula}
                        loading={listQuery.isFetching}
                        filters={{ search: urlSearch || undefined }}
                        emptyText={urlSearch
                            ? 'Không tìm thấy chương trình phù hợp'
                            : 'Chưa có chương trình đào tạo nào'}
                        pagination={{ total, current: page, pageSize }}
                    />
                </Space>
            </Card>

            <CurriculumFormModal open={formOpen} curriculum={editing} onClose={closeForm} />
        </section>
    );
};

export default AdminCurriculaPage;
