import { useMemo, useState } from 'react';
import { Alert, Form, InputNumber, Modal, Popconfirm, Select, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import { LuEye, LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { Link, useLocation } from 'react-router';
import { EmptyState, IconBtn, ISolidBtn, ITable } from '@/components';
import { listCourses } from '@/apis/course';
import {
    listCourseGroups,
    listCurriculumCategories,
    listCurriculumCourses,
    removeCurriculumCourse,
    replaceCourseCategories,
    updateCurriculumCourse,
    upsertCurriculumCourse,
} from '@/apis/curriculum';
import { useApiMutation, useApiQuery, useDebounce } from '@/hooks';
import type { CurriculumCourse, CurriculumCoursePayload } from '@/types';
import { summarizeCurriculumCredits } from '@/utils/curriculum-credits';
import type { CurriculumTabProps } from '../types';

const { Text } = Typography;

/** Mỗi năm / mỗi kỳ một màu (tránh `purple` vì đã dùng cho nhóm học phần cùng bảng). */
const YEAR_TAG_COLOR: Record<number, string> = { 1: 'blue', 2: 'green', 3: 'gold', 4: 'volcano' };
const TERM_TAG_COLOR: Record<number, string> = { 1: 'cyan', 2: 'geekblue', 3: 'magenta' };

/** Sắp theo năm → kỳ → mã môn; môn chưa xếp năm/kỳ xếp sau cùng. */
const compareSchedule = (a: CurriculumCourse, b: CurriculumCourse): number => {
    const rank = (value: number | null) => value ?? Number.POSITIVE_INFINITY;
    return rank(a.recommended_year) - rank(b.recommended_year)
        || rank(a.recommended_term) - rank(b.recommended_term)
        || a.course.code.localeCompare(b.course.code);
};

/** Form sửa một môn trong chương trình: năm/kỳ khuyến nghị (hoặc bỏ xếp kỳ) và nhóm học phần. */
interface EditCourseForm {
    recommended_year?: number | null;
    recommended_term?: number | null;
    category_ids: string[];
}

/** Dữ liệu gửi khi lưu modal sửa; chỉ gọi API cho phần thực sự thay đổi. */
interface EditCourseInput {
    courseId: string;
    schedule?: { year: number | null; term: number | null };
    categoryIds?: string[];
}

/** Form thêm môn: có thêm cờ "chưa xếp kỳ" cho môn trong pool tự chọn. */
interface AddCourseForm {
    course_id: string;
    recommended_year?: number | null;
    recommended_term?: number | null;
}

const YEAR_FIELD = { min: 1, max: 10, precision: 0 };
const TERM_FIELD = { min: 1, max: 3, precision: 0 };

const isBlank = (value: unknown) => value === null || value === undefined;

/** Năm và kỳ khuyến nghị cùng nhập hoặc cùng để trống (trống = môn không gắn học kỳ). */
const schedulePairRule = (otherField: 'recommended_year' | 'recommended_term') =>
    ({ getFieldValue }: { getFieldValue: (name: string) => unknown }) => ({
        validator: (_rule: unknown, value: number | null | undefined) => (
            isBlank(value) !== isBlank(getFieldValue(otherField))
                ? Promise.reject(new Error('Nhập đủ năm và kỳ, hoặc để trống cả hai.'))
                : Promise.resolve()
        ),
    });

/**
 * Tab môn học của một chương trình: sửa năm – kỳ khuyến nghị và nhóm học phần qua modal,
 * thêm môn bằng upsert (môn đã có thì cập nhật năm/kỳ) và xoá môn khỏi chương trình.
 */
const CoursesTab = ({ curriculumId }: CurriculumTabProps) => {
    const queryClient = useQueryClient();
    const location = useLocation();
    const [form] = Form.useForm<AddCourseForm>();
    const [editForm] = Form.useForm<EditCourseForm>();
    const [editing, setEditing] = useState<CurriculumCourse | null>(null);
    const [adding, setAdding] = useState(false);
    const [search, setSearch] = useState('');

    const debouncedSearch = useDebounce(search, 400);

    const coursesQuery = useApiQuery(
        ['curriculum-courses', curriculumId],
        () => listCurriculumCourses(curriculumId),
    );
    const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);

    // Nhóm môn để tính chuẩn tốt nghiệp; dùng chung cache với tab Nhóm môn.
    const groupsQuery = useApiQuery(
        ['curriculum-groups', curriculumId],
        () => listCourseGroups(curriculumId),
    );

    // Nhóm học phần (mô tả): một môn có thể nằm trong nhiều nhóm.
    const categoriesQuery = useApiQuery(
        ['curriculum-categories', curriculumId],
        () => listCurriculumCategories(curriculumId),
    );
    const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);

    const categoryNamesByCourseId = useMemo(() => {
        const map = new Map<string, string[]>();
        categories.forEach(category => {
            category.members.forEach(member => {
                const names = map.get(member.course_id) ?? [];
                names.push(category.name);
                map.set(member.course_id, names);
            });
        });
        return map;
    }, [categories]);

    const categoryOptions = useMemo(
        () => categories.map(category => ({ value: category.id, label: category.name })),
        [categories],
    );

    const categoryIdsByCourseId = useMemo(() => {
        const map = new Map<string, string[]>();
        categories.forEach(category => {
            category.members.forEach(member => {
                const ids = map.get(member.course_id) ?? [];
                ids.push(category.id);
                map.set(member.course_id, ids);
            });
        });
        return map;
    }, [categories]);

    const existingCourseIds = useMemo(
        () => new Set(courses.map(item => item.course_id)),
        [courses],
    );

    // Danh sách môn để chọn trong modal: tìm phía server, mỗi lần tối đa 100 môn.
    const pickerQuery = useApiQuery(
        ['courses', 'curriculum-picker', debouncedSearch],
        () => listCourses({ search: debouncedSearch.trim() || undefined, take: 100 }),
        { enabled: adding },
    );

    // Môn đã có trong chương trình không hiện trong danh sách chọn (sửa năm/kỳ bằng nút Sửa).
    const pickerOptions = useMemo(
        () => (pickerQuery.data?.items ?? [])
            .filter(course => !existingCourseIds.has(course.id))
            .map(course => ({
                value: course.id,
                label: `${course.code} · ${course.name} (${course.credits} TC)`,
            })),
        [existingCourseIds, pickerQuery.data],
    );

    // Chuẩn tốt nghiệp = môn có lộ trình + yêu cầu các khối; không cộng dồn cả pool tự chọn.
    const creditSummary = useMemo(
        () => summarizeCurriculumCredits(courses, groupsQuery.data ?? []),
        [courses, groupsQuery.data],
    );

    /** Làm mới danh sách môn; nhóm môn cũng phụ thuộc vì xoá môn kéo theo thành viên nhóm. */
    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ['curriculum-courses', curriculumId] });
        void queryClient.invalidateQueries({ queryKey: ['curriculum-groups', curriculumId] });
        void queryClient.invalidateQueries({ queryKey: ['curriculum-categories', curriculumId] });
    };

    /** Lưu modal sửa: năm/kỳ (null = bỏ xếp kỳ) và/hoặc nhóm học phần, chỉ phần đã đổi. */
    const saveCourse = useApiMutation({
        mutationFn: async (input: EditCourseInput) => {
            if (input.schedule) {
                await updateCurriculumCourse(curriculumId, input.courseId, {
                    recommended_year: input.schedule.year,
                    recommended_term: input.schedule.term,
                });
            }
            if (input.categoryIds) {
                await replaceCourseCategories(curriculumId, input.courseId, input.categoryIds);
            }
        },
        successMessage: 'Đã cập nhật môn trong chương trình.',
        onSuccess: () => {
            setEditing(null);
            refresh();
        },
        // Lưu dở (năm/kỳ xong nhưng nhóm lỗi) vẫn cần tải lại để bảng phản ánh đúng dữ liệu.
        onError: refresh,
    });

    const addCourse = useApiMutation({
        mutationFn: (payload: CurriculumCoursePayload) => upsertCurriculumCourse(curriculumId, payload),
        successMessage: 'Đã lưu môn vào chương trình.',
        onSuccess: () => {
            setAdding(false);
            setSearch('');
            form.resetFields();
            refresh();
        },
    });

    const removeCourse = useApiMutation({
        mutationFn: (courseId: string) => removeCurriculumCourse(curriculumId, courseId),
        successMessage: 'Đã xoá môn khỏi chương trình.',
        onSuccess: refresh,
    });

    const openAdd = () => {
        setSearch('');
        form.resetFields();
        setAdding(true);
    };

    const openEdit = (record: CurriculumCourse) => {
        editForm.resetFields();
        editForm.setFieldsValue({
            recommended_year: record.recommended_year,
            recommended_term: record.recommended_term,
            category_ids: categoryIdsByCourseId.get(record.course_id) ?? [],
        });
        setEditing(record);
    };

    const submitEdit = (values: EditCourseForm) => {
        if (!editing) return;
        const year = values.recommended_year ?? null;
        const term = values.recommended_term ?? null;
        const scheduleChanged = year !== editing.recommended_year || term !== editing.recommended_term;

        const before = [...(categoryIdsByCourseId.get(editing.course_id) ?? [])].sort();
        const after = [...(values.category_ids ?? [])].sort();
        const categoriesChanged = before.join() !== after.join();

        if (!scheduleChanged && !categoriesChanged) {
            setEditing(null);
            return;
        }

        saveCourse.mutate({
            courseId: editing.course_id,
            schedule: scheduleChanged ? { year, term } : undefined,
            categoryIds: categoriesChanged ? after : undefined,
        });
    };

    const columns: ColumnsType<CurriculumCourse> = [
        {
            title: 'Mã môn',
            key: 'code',
            width: 120,
            render: (_value, record) => <Text strong>{record.course.code}</Text>,
        },
        {
            title: 'Tên môn học',
            key: 'name',
            width: 260,
            render: (_value, record) => <span style={{ wordBreak: 'break-word' }}>{record.course.name}</span>,
        },
        {
            title: 'Tín chỉ',
            key: 'credits',
            width: 96,
            align: 'center',
            render: (_value, record) => <Tag>{record.course.credits} TC</Tag>,
        },
        {
            title: 'Nhóm học phần',
            key: 'categories',
            width: 240,
            render: (_value, record) => {
                if (categoriesQuery.isLoading) {
                    return <Text type="secondary">Đang tải nhóm…</Text>;
                }

                if (categoriesQuery.isError) {
                    return <Text type="danger">Không tải được nhóm học phần</Text>;
                }

                const names = categoryNamesByCourseId.get(record.course_id) ?? [];
                if (names.length === 0) {
                    return <Text type="secondary">Chưa xếp nhóm</Text>;
                }

                return (
                    <Space wrap size={[4, 4]}>
                        {names.map(name => (
                            <Tag key={name} color="purple" style={{ whiteSpace: 'normal', marginInlineEnd: 0 }}>
                                {name}
                            </Tag>
                        ))}
                    </Space>
                );
            },
        },
        {
            title: 'Năm – Kỳ khuyến nghị',
            key: 'schedule',
            width: 170,
            sorter: compareSchedule,
            defaultSortOrder: 'ascend',
            sortDirections: ['ascend', 'descend', 'ascend'],
            render: (_value, record) => {
                const { recommended_year: year, recommended_term: term } = record;
                if (year === null) return <Tag color="default">Chưa xếp kỳ</Tag>;

                return (
                    <Space size={4}>
                        <Tag color={YEAR_TAG_COLOR[year] ?? 'default'} style={{ marginInlineEnd: 0 }}>Năm {year}</Tag>
                        {term !== null && (
                            <Tag color={TERM_TAG_COLOR[term] ?? 'default'} style={{ marginInlineEnd: 0 }}>Kỳ {term}</Tag>
                        )}
                    </Space>
                );
            },
        },
        {
            title: 'Hành động',
            key: 'actions',
            width: 120,
            render: (_value, record) => (
                <Space size={4}>
                    <Link
                        to={`/courses/${encodeURIComponent(record.course.code)}`}
                        state={{ from: `${location.pathname}${location.search}` }}
                    >
                        <IconBtn size="small" icon={<LuEye />} label={`Xem môn ${record.course.code}`} />
                    </Link>

                    <IconBtn
                        size="small"
                        icon={<LuPencil />}
                        label={`Sửa môn ${record.course.code}`}
                        onClick={() => openEdit(record)}
                    />

                    <Popconfirm
                        title="Xoá môn khỏi chương trình?"
                        description="Xoá môn sẽ kéo theo thành viên nhóm, quan hệ môn và dòng kế hoạch học tập của sinh viên liên quan."
                        okText="Xoá"
                        cancelText="Huỷ"
                        okButtonProps={{ color: 'danger', variant: 'solid' }}
                        onConfirm={() => removeCourse.mutate(record.course_id)}
                    >
                        <IconBtn
                            size="small"
                            color="danger"
                            icon={<LuTrash2 />}
                            label={`Xoá môn ${record.course.code}`}
                            loading={removeCourse.isPending && removeCourse.variables === record.course_id}
                        />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const isEmpty = courses.length === 0 && !coursesQuery.isLoading && !coursesQuery.isError;

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
                <Space wrap size={8}>
                    <Tag color="blue">{courses.length} môn</Tag>
                    {groupsQuery.isSuccess && (
                        <>
                            <Tag color="geekblue">Chuẩn tốt nghiệp {creditSummary.totalCredits} TC</Tag>
                            <Text type="secondary">
                                {creditSummary.standaloneCredits} TC môn có lộ trình (không thuộc khối)
                                {' + '}
                                {creditSummary.groupCredits} TC yêu cầu các khối tự chọn
                            </Text>
                        </>
                    )}
                </Space>

                <ISolidBtn icon={<LuPlus />} onClick={openAdd}>Thêm môn</ISolidBtn>
            </div>

            {coursesQuery.isError && (
                <Alert
                    type="error"
                    showIcon
                    title="Không tải được danh sách môn của chương trình"
                    description={coursesQuery.error?.message ?? 'Vui lòng tải lại trang để thử lại.'}
                />
            )}

            {isEmpty && (
                <EmptyState
                    title="Chương trình chưa có môn học"
                    description="Thêm môn và khai năm/kỳ khuyến nghị để bắt đầu xây dựng nội dung chương trình."
                    action={<ISolidBtn icon={<LuPlus />} onClick={openAdd}>Thêm môn</ISolidBtn>}
                />
            )}

            {!isEmpty && !coursesQuery.isError && (
                <>
                    <ITable<CurriculumCourse>
                        showIndex={false}
                        columns={columns}
                        dataSource={courses}
                        rowKey="id"
                        pagination={false}
                        loading={coursesQuery.isLoading}
                        emptyText="Chương trình chưa có môn học"
                    />

                    {categories.length > 0 && (
                        <Text type="secondary">
                            Một môn có thể thuộc nhiều nhóm học phần. Bấm “Sửa” để đổi năm/kỳ khuyến nghị,
                            bỏ xếp kỳ hoặc đổi nhóm học phần của môn.
                        </Text>
                    )}
                </>
            )}

            <Modal
                open={adding}
                title="Thêm môn vào chương trình"
                okText="Thêm môn"
                cancelText="Huỷ"
                confirmLoading={addCourse.isPending}
                forceRender
                onCancel={() => setAdding(false)}
                onOk={() => form.submit()}
            >
                <Form<AddCourseForm>
                    form={form}
                    layout="vertical"
                    initialValues={{ recommended_year: null, recommended_term: null }}
                    onFinish={values => addCourse.mutate({
                        course_id: values.course_id,
                        recommended_year: values.recommended_year ?? null,
                        recommended_term: values.recommended_term ?? null,
                    })}
                >
                    <Form.Item
                        name="course_id"
                        label="Môn học"
                        rules={[{ required: true, message: 'Chọn môn học.' }]}
                        extra="Tìm theo mã hoặc tên; chỉ hiện môn chưa có trong chương trình (lấy tối đa 100 môn khớp từ khóa)."
                    >
                        <Select
                            placeholder="Tìm và chọn môn học"
                            showSearch={{ filterOption: false, onSearch: setSearch }}
                            options={pickerOptions}
                            loading={pickerQuery.isFetching}
                            notFoundContent={pickerQuery.isFetching ? 'Đang tìm môn…' : 'Không có môn phù hợp chưa thuộc chương trình'}
                            style={{ width: '100%' }}
                        />
                    </Form.Item>

                    <Space size={12} wrap align="start">
                        <Form.Item
                            name="recommended_year"
                            label="Năm khuyến nghị"
                            dependencies={['recommended_term']}
                            rules={[schedulePairRule('recommended_term')]}
                        >
                            <InputNumber {...YEAR_FIELD} placeholder="Trống" style={{ width: 140 }} />
                        </Form.Item>

                        <Form.Item
                            name="recommended_term"
                            label="Kỳ khuyến nghị"
                            dependencies={['recommended_year']}
                            rules={[schedulePairRule('recommended_year')]}
                        >
                            <InputNumber {...TERM_FIELD} placeholder="Trống" style={{ width: 140 }} />
                        </Form.Item>
                    </Space>
                    <Text type="secondary" style={{ display: 'block', marginTop: -8, marginBottom: 16 }}>
                        Để trống cả năm và kỳ nếu môn không gắn học kỳ cố định (môn trong pool tự chọn).
                    </Text>
                </Form>
            </Modal>

            <Modal
                open={editing !== null}
                title={editing ? `Sửa ${editing.course.code} · ${editing.course.name}` : 'Sửa môn'}
                okText="Lưu"
                cancelText="Huỷ"
                confirmLoading={saveCourse.isPending}
                forceRender
                onCancel={() => setEditing(null)}
                onOk={() => editForm.submit()}
            >
                <Form<EditCourseForm>
                    form={editForm}
                    layout="vertical"
                    initialValues={{ recommended_year: null, recommended_term: null, category_ids: [] }}
                    onFinish={submitEdit}
                >
                    <Space size={12} wrap align="start">
                        <Form.Item
                            name="recommended_year"
                            label="Năm khuyến nghị"
                            dependencies={['recommended_term']}
                            rules={[schedulePairRule('recommended_term')]}
                        >
                            <InputNumber {...YEAR_FIELD} placeholder="Trống" style={{ width: 140 }} />
                        </Form.Item>

                        <Form.Item
                            name="recommended_term"
                            label="Kỳ khuyến nghị"
                            dependencies={['recommended_year']}
                            rules={[schedulePairRule('recommended_year')]}
                        >
                            <InputNumber {...TERM_FIELD} placeholder="Trống" style={{ width: 140 }} />
                        </Form.Item>
                    </Space>
                    <Text type="secondary" style={{ display: 'block', marginTop: -8, marginBottom: 16 }}>
                        Để trống cả năm và kỳ nếu môn không gắn học kỳ cố định (môn trong pool tự chọn).
                    </Text>

                    <Form.Item
                        name="category_ids"
                        label="Nhóm học phần"
                        extra={categories.length === 0
                            ? 'Chương trình chưa có nhóm học phần; tạo nhóm ở tab “Nhóm học phần”.'
                            : 'Một môn có thể thuộc nhiều nhóm; thay đổi không ảnh hưởng các môn khác trong nhóm.'}
                    >
                        <Select
                            mode="multiple"
                            allowClear
                            placeholder="Chưa xếp nhóm"
                            showSearch={{ optionFilterProp: 'label' }}
                            options={categoryOptions}
                            loading={categoriesQuery.isLoading}
                            disabled={categories.length === 0}
                            style={{ width: '100%' }}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default CoursesTab;
