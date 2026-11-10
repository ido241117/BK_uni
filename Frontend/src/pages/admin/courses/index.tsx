import { useEffect, useState } from 'react';
import {
    Alert,
    Card,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Select,
    Space,
    Tag,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import {
    LuPencil,
    LuPlus,
    LuRefreshCw,
    LuSearch,
    LuTrash2,
} from 'react-icons/lu';
import {
    FormField,
    IconBtn,
    IOutLinedBtn,
    ISolidBtn,
    ITable,
    ITextBtn,
    PageHeader,
    TablePageSkeleton,
} from '@/components';
import {
    createCourse,
    deleteCourse,
    getOpenedSemesters,
    listCourses,
    replaceOpenedSemesters,
    updateCourse,
} from '@/apis/course';
import { useApiMutation, useApiQuery, useDebounce, usePageLocation } from '@/hooks';
import type { Course, CoursePayload } from '@/types';

const { Text } = Typography;

/** Số tín chỉ hợp lý cho một môn học; backend chỉ kiểm tra kiểu số nguyên. */
const CREDITS_MIN = 0;
const CREDITS_MAX = 30;

/** Mã học kỳ dạng YYK: 2 số cuối năm học + kỳ 1..3 (ví dụ 251, 252, 253). */
const SEMESTER_CODE_PATTERN = /^\d{2}[123]$/;

/** Giá trị form: thông tin môn + danh sách học kỳ đã mở (lưu bằng API riêng). */
type CourseFormValues = CoursePayload & { opened_semesters: string[] };

const sameCodes = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();

interface CourseFormModalProps {
    open: boolean;
    /** `null` = tạo mới, có giá trị = sửa. */
    course: Course | null;
    onClose: () => void;
}

/** Modal tạo/sửa môn học: mã, tên, số tín chỉ, mô tả và học kỳ đã mở. */
const CourseFormModal = ({ open, course, onClose }: CourseFormModalProps) => {
    const queryClient = useQueryClient();
    const [form] = Form.useForm<CourseFormValues>();
    const isEditing = course !== null;
    const courseId = course?.id ?? '';

    const semestersQuery = useApiQuery(
        ['course', courseId, 'opened-semesters'],
        () => getOpenedSemesters(courseId),
        { enabled: open && courseId !== '' },
    );
    const savedCodes = (semestersQuery.data ?? []).map(semester => semester.semester_code);
    const semestersReady = !isEditing || semestersQuery.isSuccess;

    // Học kỳ đã mở tải riêng: đổ vào form khi dữ liệu về, không ghi đè khi người dùng đã sửa.
    useEffect(() => {
        if (open && semestersQuery.data && !form.isFieldTouched('opened_semesters')) {
            form.setFieldValue('opened_semesters', semestersQuery.data.map(semester => semester.semester_code));
        }
    }, [form, open, semestersQuery.data]);

    const refreshList = () => {
        void queryClient.invalidateQueries({ queryKey: ['courses'] });
        onClose();
    };

    /** Lưu môn rồi thay danh sách học kỳ đã mở nếu có thay đổi. */
    const save = useApiMutation<Course, CourseFormValues>({
        mutationFn: async ({ opened_semesters: codes, ...payload }) => {
            const saved = course ? await updateCourse(course.id, payload) : await createCourse(payload);
            const previous = course ? savedCodes : [];
            if (!sameCodes(codes, previous)) await replaceOpenedSemesters(saved.id, codes);
            return saved;
        },
        successMessage: isEditing ? 'Đã cập nhật môn học.' : 'Đã tạo môn học.',
        onSuccess: (saved) => {
            void queryClient.invalidateQueries({ queryKey: ['course', saved.id, 'opened-semesters'] });
            refreshList();
        },
        // Môn đã lưu nhưng học kỳ lỗi: vẫn tải lại để danh sách khớp dữ liệu thật.
        onError: () => void queryClient.invalidateQueries({ queryKey: ['courses'] }),
    });

    const saving = save.isPending;

    const handleFinish = (values: CourseFormValues) => {
        save.mutate({
            code: values.code.trim(),
            name: values.name.trim(),
            credits: values.credits,
            description: values.description?.trim() || null,
            opened_semesters: [...new Set((values.opened_semesters ?? []).map(code => code.trim()))],
        });
    };

    return (
        <Modal
            open={open}
            title={isEditing ? `Sửa môn học ${course.code}` : 'Thêm môn học'}
            okText={isEditing ? 'Lưu thay đổi' : 'Tạo môn học'}
            cancelText="Huỷ"
            confirmLoading={saving}
            okButtonProps={{ disabled: !semestersReady }}
            maskClosable={!saving}
            onOk={() => form.submit()}
            onCancel={onClose}
            destroyOnHidden
        >
            <Form<CourseFormValues>
                key={course?.id ?? 'create'}
                form={form}
                layout="vertical"
                preserve={false}
                initialValues={course
                    ? {
                        code: course.code,
                        name: course.name,
                        credits: course.credits,
                        description: course.description,
                        opened_semesters: [],
                    }
                    : { credits: 4, description: null, opened_semesters: [] }}
                onFinish={handleFinish}
            >
                <FormField
                    name="code"
                    label="Mã môn học"
                    placeholder="CO2003"
                    hint="Mã môn tối đa 50 ký tự và không được trùng với môn đã có."
                    inputProps={{ maxLength: 50, disabled: saving }}
                    rules={[
                        { required: true, whitespace: true, message: 'Nhập mã môn học.' },
                        { max: 50, message: 'Mã môn học tối đa 50 ký tự.' },
                    ]}
                />

                <FormField
                    name="name"
                    label="Tên môn học"
                    placeholder="Cấu trúc dữ liệu và giải thuật"
                    inputProps={{ maxLength: 255, disabled: saving }}
                    rules={[
                        { required: true, whitespace: true, message: 'Nhập tên môn học.' },
                        { max: 255, message: 'Tên môn học tối đa 255 ký tự.' },
                    ]}
                />

                <Form.Item
                    name="credits"
                    label="Số tín chỉ"
                    rules={[{ required: true, message: 'Nhập số tín chỉ.' }]}
                >
                    <InputNumber
                        min={CREDITS_MIN}
                        max={CREDITS_MAX}
                        precision={0}
                        placeholder="4"
                        disabled={saving}
                        style={{ width: '100%' }}
                    />
                </Form.Item>

                <FormField
                    name="description"
                    label="Mô tả ngắn"
                    placeholder="Kiến thức nền tảng"
                    hint="Hiển thị dưới tên môn trong danh sách học phần. Không bắt buộc."
                    inputProps={{ maxLength: 255, disabled: saving }}
                    rules={[{ max: 255, message: 'Mô tả tối đa 255 ký tự.' }]}
                />

                <Form.Item
                    name="opened_semesters"
                    label="Học kỳ đã mở"
                    extra="Gõ mã học kỳ dạng YYK (ví dụ 251, 252, 253) rồi Enter; bấm × để bỏ. Lưu sẽ thay toàn bộ danh sách."
                    rules={[{
                        validator: (_rule, value: string[] | undefined) => {
                            const invalid = (value ?? []).filter(code => !SEMESTER_CODE_PATTERN.test(code.trim()));
                            return invalid.length
                                ? Promise.reject(new Error(`Mã học kỳ không hợp lệ: ${invalid.join(', ')}.`))
                                : Promise.resolve();
                        },
                    }]}
                >
                    <Select<string[]>
                        mode="tags"
                        open={false}
                        suffixIcon={null}
                        tokenSeparators={[',', ' ']}
                        placeholder={semestersReady ? 'Chưa mở học kỳ nào' : 'Đang tải học kỳ đã mở…'}
                        disabled={saving || !semestersReady}
                        loading={!semestersReady}
                        style={{ width: '100%' }}
                    />
                </Form.Item>

                {semestersQuery.isError && (
                    <Alert
                        type="error"
                        showIcon
                        title="Không tải được học kỳ đã mở"
                        description={semestersQuery.error.message}
                        action={<IOutLinedBtn onClick={() => void semestersQuery.refetch()}>Thử lại</IOutLinedBtn>}
                    />
                )}
            </Form>
        </Modal>
    );
};

const AdminCoursesPage = () => {
    const { page, pageSize, filters } = usePageLocation<{ search?: string }>();
    const queryClient = useQueryClient();

    const [search, setSearch] = useState(filters?.search ?? '');
    const debouncedSearch = useDebounce(search, 400);
    const keyword = debouncedSearch.trim();

    const [formOpen, setFormOpen] = useState(false);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);

    const coursesQuery = useApiQuery(
        ['courses', page, pageSize, keyword],
        () => listCourses({
            page,
            take: pageSize,
            search: keyword || undefined,
        }),
        { placeholderData: previous => previous },
    );

    const deleteMutation = useApiMutation<null, string>({
        mutationFn: deleteCourse,
        successMessage: 'Đã xoá môn học và toàn bộ dữ liệu con.',
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['courses'] }),
    });

    const openCreateForm = () => {
        setEditingCourse(null);
        setFormOpen(true);
    };

    const openEditForm = (course: Course) => {
        setEditingCourse(course);
        setFormOpen(true);
    };

    if (coursesQuery.isLoading && !coursesQuery.data) {
        return <TablePageSkeleton />;
    }

    if (coursesQuery.isError && !coursesQuery.data) {
        return (
            <section>
                <PageHeader
                    title="Quản lý môn học"
                    subtitle="Tạo, sửa, xoá môn học và quản lý học kỳ đã mở."
                />
                <Alert
                    type="error"
                    showIcon
                    title="Không tải được danh sách môn học"
                    description={coursesQuery.error.message}
                    action={(
                        <IOutLinedBtn onClick={() => void coursesQuery.refetch()}>
                            Thử lại
                        </IOutLinedBtn>
                    )}
                />
            </section>
        );
    }

    const courses = coursesQuery.data?.items ?? [];
    const total = coursesQuery.data?.pagination.itemCount ?? 0;

    const columns: ColumnsType<Course> = [
        {
            title: 'Mã môn',
            dataIndex: 'code',
            width: 130,
            render: (code: string) => <Text strong>{code}</Text>,
        },
        {
            title: 'Tên môn học',
            dataIndex: 'name',
            render: (name: string) => name,
        },
        {
            title: 'Tín chỉ',
            dataIndex: 'credits',
            width: 100,
            align: 'center',
            sorter: (a, b) => a.credits - b.credits,
            render: (credits: number) => <Tag>{credits} TC</Tag>,
        },
        {
            title: 'Thao tác',
            key: 'actions',
            width: 110,
            align: 'right',
            render: (_value: unknown, record: Course) => (
                <Space size={2}>
                    <IconBtn
                        icon={<LuPencil />}
                        label={`Sửa môn ${record.code}`}
                        onClick={() => openEditForm(record)}
                    />
                    <Popconfirm
                        title="Xoá môn học?"
                        description={(
                            <span>
                                Xoá <strong>{record.code}</strong> sẽ xoá toàn bộ dữ liệu con: học kỳ đã mở,
                                môn trong chương trình, trạng thái môn, dòng kế hoạch học tập, thành viên nhóm
                                môn và quan hệ tiên quyết liên quan. Không thể hoàn tác.
                            </span>
                        )}
                        okText="Xoá môn"
                        cancelText="Huỷ"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => deleteMutation.mutate(record.id)}
                    >
                        <IconBtn
                            danger
                            icon={<LuTrash2 />}
                            label={`Xoá môn ${record.code}`}
                            loading={deleteMutation.isPending && deleteMutation.variables === record.id}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <section>
            <PageHeader
                title="Quản lý môn học"
                subtitle="Tạo, sửa, xoá môn học và quản lý danh sách học kỳ đã mở của từng môn."
                extra={(
                    <ISolidBtn icon={<LuPlus />} onClick={openCreateForm}>
                        Thêm môn học
                    </ISolidBtn>
                )}
            />

            <Card>
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 12,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 16,
                    }}
                >
                    <Input
                        allowClear
                        size="large"
                        prefix={<LuSearch />}
                        placeholder="Tìm theo mã hoặc tên môn học"
                        aria-label="Tìm môn học theo mã hoặc tên"
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        style={{ maxWidth: 420 }}
                    />

                    <Space size={8}>
                        <Text type="secondary">{total} môn học</Text>
                        <ITextBtn
                            icon={<LuRefreshCw />}
                            loading={coursesQuery.isFetching}
                            onClick={() => void coursesQuery.refetch()}
                        >
                            Làm mới
                        </ITextBtn>
                    </Space>
                </div>

                <ITable<Course>
                    rowKey="id"
                    columns={columns}
                    dataSource={courses}
                    loading={coursesQuery.isFetching}
                    filters={{ search: keyword || undefined }}
                    pagination={{
                        total,
                        current: page,
                        pageSize,
                    }}
                    emptyText={keyword ? `Không có môn học nào khớp "${keyword}"` : 'Chưa có môn học nào'}
                />
            </Card>

            <CourseFormModal
                open={formOpen}
                course={editingCourse}
                onClose={() => setFormOpen(false)}
            />
        </section>
    );
};

export default AdminCoursesPage;
