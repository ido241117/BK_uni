import { useMemo, useState } from 'react';
import { Alert, Form, InputNumber, Modal, Popconfirm, Select, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import { LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { EmptyState, FormField, ISolidBtn, ITable, ITextBtn } from '@/components';
import {
    createCourseGroup,
    listCourseGroups,
    listCurriculumCourses,
    removeCourseGroup,
    updateCourseGroup,
} from '@/apis/curriculum';
import { useApiMutation, useApiQuery } from '@/hooks';
import {
    COURSE_GROUP_KIND,
    COURSE_GROUP_KIND_LABEL,
    COURSE_GROUP_SCOPE,
    COURSE_GROUP_SCOPE_LABEL,
    type CourseGroup,
    type CourseGroupKind,
    type CourseGroupPayload,
    type CourseGroupScope,
} from '@/types';
import type { CurriculumTabProps } from '../types';
import { groupRequiredCredits } from '@/utils/curriculum-credits';
import i18n from '@/i18n';

const { Text } = Typography;

const KIND_OPTIONS = Object.entries(COURSE_GROUP_KIND_LABEL).map(([value, label]) => ({ value, label }));
const SCOPE_OPTIONS = Object.entries(COURSE_GROUP_SCOPE_LABEL).map(([value, label]) => ({ value, label }));

const KIND_TAG_COLOR: Record<CourseGroupKind, string> = {
    required: 'blue',
    elective: 'green',
};

const SCOPE_TAG_COLOR: Record<CourseGroupScope, string> = {
    listed: 'default',
    any: 'purple',
};

const COUNT_FIELD = { min: 1, max: 200, precision: 0 };
const CREDITS_FIELD = { min: 1, max: 200, precision: 0 };

/** Mô tả ràng buộc của khối: số môn và/hoặc số tín chỉ phải đạt. */
const describeRequirement = (group: CourseGroup): string => {
    const parts: string[] = [];
    if (group.required_count !== null) parts.push(i18n.t('{{required_count}} môn', { required_count: group.required_count }));
    if (group.required_credits !== null) parts.push(i18n.t('{{required_credits}} TC', { required_credits: group.required_credits }));
    return parts.length ? parts.join(' / ') : '—';
};

/**
 * Tab nhóm môn của một chương trình: khối yêu cầu theo số môn hoặc tín chỉ,
 * có khối "chọn tự do" (mọi môn trong danh mục, không khai báo thành viên).
 */
const GroupsTab = ({ curriculumId }: CurriculumTabProps) => {
    const queryClient = useQueryClient();
    const [form] = Form.useForm<CourseGroupPayload>();
    const [open, setOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<CourseGroup | null>(null);

    const groupsQuery = useApiQuery(
        ['curriculum-groups', curriculumId],
        () => listCourseGroups(curriculumId),
    );
    // Chỉ khối gốc (xét tốt nghiệp); khối chuyên ngành thu hẹp khối gốc và không cộng tín chỉ.
    const groups = useMemo(
        () => (groupsQuery.data ?? []).filter(group => group.specialization_id === null),
        [groupsQuery.data],
    );

    // Nhóm chỉ được chứa môn đã có trong chương trình (API-FRONTEND.md 5.6).
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

    // Tổng tín chỉ mà các khối yêu cầu (không phải tổng tín chỉ của toàn bộ môn trong pool).
    const totalGroupCredits = useMemo(
        () => groups.reduce((total, group) => total + groupRequiredCredits(group), 0),
        [groups],
    );

    // Chỉ khối có danh sách môn mới có thể "thiếu môn" so với số môn phải chọn.
    const incompleteGroups = useMemo(
        () => groups.filter(group => group.pool_scope === COURSE_GROUP_SCOPE.LISTED
            && group.required_count !== null
            && group.required_count > group.members.length),
        [groups],
    );

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: ['curriculum-groups', curriculumId] });
    };

    const createGroup = useApiMutation({
        mutationFn: (payload: CourseGroupPayload) => createCourseGroup(curriculumId, payload),
        successMessage: i18n.t('Đã tạo nhóm môn.'),
        onSuccess: () => {
            setOpen(false);
            form.resetFields();
            refresh();
        },
    });

    const updateGroup = useApiMutation({
        mutationFn: (input: { groupId: string; payload: Partial<CourseGroupPayload> }) =>
            updateCourseGroup(curriculumId, input.groupId, input.payload),
        successMessage: i18n.t('Đã cập nhật nhóm môn.'),
        onSuccess: () => {
            setOpen(false);
            form.resetFields();
            refresh();
        },
    });

    const removeGroup = useApiMutation({
        mutationFn: (groupId: string) => removeCourseGroup(curriculumId, groupId),
        successMessage: i18n.t('Đã xoá nhóm môn.'),
        onSuccess: refresh,
    });

    const openCreate = () => {
        setEditingGroup(null);
        form.resetFields();
        setOpen(true);
    };

    const openEdit = (group: CourseGroup) => {
        setEditingGroup(group);
        form.resetFields();
        form.setFieldsValue({
            name: group.name,
            kind: group.kind,
            pool_scope: group.pool_scope,
            required_count: group.required_count ?? undefined,
            required_credits: group.required_credits ?? undefined,
            pool_course_credits: group.pool_course_credits ?? undefined,
            course_ids: group.members.map(member => member.course_id),
        });
        setOpen(true);
    };

    const submit = (values: CourseGroupPayload) => {
        const name = values.name.trim();
        const scope = values.pool_scope ?? COURSE_GROUP_SCOPE.LISTED;
        const isAny = scope === COURSE_GROUP_SCOPE.ANY;
        const requiredCount = isAny ? null : values.required_count ?? null;
        const requiredCredits = values.required_credits ?? null;
        const poolCourseCredits = isAny ? values.pool_course_credits ?? null : null;
        const courseIds = isAny ? [] : values.course_ids ?? [];

        if (editingGroup) {
            const currentIds = editingGroup.members.map(member => member.course_id);
            const membersChanged = !isAny && (courseIds.length !== currentIds.length
                || courseIds.some(courseId => !currentIds.includes(courseId)));

            updateGroup.mutate({
                groupId: editingGroup.id,
                payload: {
                    name,
                    kind: values.kind,
                    required_count: requiredCount,
                    required_credits: requiredCredits,
                    pool_scope: scope,
                    pool_course_credits: poolCourseCredits,
                    // Chỉ gửi course_ids khi danh sách môn thay đổi: backend thay toàn bộ.
                    ...(membersChanged ? { course_ids: courseIds } : {}),
                },
            });
            return;
        }

        createGroup.mutate({
            name,
            kind: values.kind,
            required_count: requiredCount,
            required_credits: requiredCredits,
            pool_scope: scope,
            pool_course_credits: poolCourseCredits,
            ...(!isAny && courseIds.length > 0 ? { course_ids: courseIds } : {}),
        });
    };

    /** Bắt buộc khối có ít nhất một ràng buộc: số môn hoặc số tín chỉ. */
    const targetValidator = () => ({
        validator: () => {
            const count = form.getFieldValue('required_count');
            const credits = form.getFieldValue('required_credits');
            if (count == null && credits == null) {
                return Promise.reject(new Error(i18n.t('Nhập số môn hoặc số tín chỉ cần đạt.')));
            }
            return Promise.resolve();
        },
    });

    const columns: ColumnsType<CourseGroup> = [
        {
            title: i18n.t('Tên nhóm'),
            dataIndex: 'name',
            render: (name: string) => <Text strong>{name}</Text>,
        },
        {
            title: i18n.t('Loại'),
            dataIndex: 'kind',
            width: 110,
            render: (kind: CourseGroupKind) => (
                <Tag color={KIND_TAG_COLOR[kind]}>{COURSE_GROUP_KIND_LABEL[kind]}</Tag>
            ),
        },
        {
            title: i18n.t('Phạm vi'),
            dataIndex: 'pool_scope',
            width: 130,
            render: (scope: CourseGroupScope) => (
                <Tag color={SCOPE_TAG_COLOR[scope]}>{COURSE_GROUP_SCOPE_LABEL[scope]}</Tag>
            ),
        },
        {
            title: i18n.t('Yêu cầu'),
            key: 'requirement',
            width: 140,
            align: 'center',
            render: (_value, group) => {
                const required = group.pool_scope === COURSE_GROUP_SCOPE.LISTED
                    && group.required_count !== null
                    && group.required_count > group.members.length;

                return (
                    <Space size={4}>
                        <Tag color={required ? 'orange' : undefined}>{describeRequirement(group)}</Tag>
                        {required && <Text type="warning">{i18n.t('thiếu môn')}</Text>}
                    </Space>
                );
            },
        },
        {
            title: i18n.t('Môn trong nhóm'),
            key: 'members',
            width: 140,
            align: 'center',
            render: (_value, group) => (group.pool_scope === COURSE_GROUP_SCOPE.ANY
                ? <Text type="secondary">{group.pool_course_credits ? i18n.t('môn {{pool_course_credits}} TC', { pool_course_credits: group.pool_course_credits }) : i18n.t('mọi môn')}</Text>
                : i18n.t('{{length}} môn', { length: group.members.length })),
        },
        {
            title: i18n.t('Hành động'),
            key: 'actions',
            width: 190,
            render: (_value, group) => (
                <Space size={8}>
                    <ITextBtn size="small" icon={<LuPencil />} onClick={() => openEdit(group)}>
                        {i18n.t('Sửa')}
                    </ITextBtn>

                    <Popconfirm
                        title={i18n.t('Xoá nhóm môn?')}
                        description={i18n.t('Nhóm và toàn bộ thành viên của nhóm sẽ bị xoá; môn trong chương trình vẫn được giữ.')}
                        okText={i18n.t('Xoá')}
                        cancelText={i18n.t('Huỷ')}
                        okButtonProps={{ color: 'danger', variant: 'solid' }}
                        onConfirm={() => removeGroup.mutate(group.id)}
                    >
                        <ITextBtn
                            size="small"
                            color="danger"
                            icon={<LuTrash2 />}
                            loading={removeGroup.isPending && removeGroup.variables === group.id}
                        >
                            {i18n.t('Xoá')}
                        </ITextBtn>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    const isEmpty = groups.length === 0 && !groupsQuery.isLoading && !groupsQuery.isError;

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
                    <Tag color="geekblue">{groups.length}{' '}{i18n.t('khối · yêu cầu')}{' '}{totalGroupCredits}{' '}{i18n.t('TC')}</Tag>
                    <Text type="secondary">
                        {i18n.t('Khối yêu cầu tính theo số môn, số tín chỉ hoặc cả hai; khối “chọn tự do” nhận mọi môn trong danh mục (tự chọn tự do).')}
                    </Text>
                </Space>

                <ISolidBtn icon={<LuPlus />} onClick={openCreate}>{i18n.t('Tạo nhóm môn')}</ISolidBtn>
            </div>

            {groupsQuery.isError && (
                <Alert
                    type="error"
                    showIcon
                    title={i18n.t('Không tải được danh sách nhóm môn')}
                    description={groupsQuery.error?.message ?? i18n.t('Vui lòng tải lại trang để thử lại.')}
                />
            )}

            {incompleteGroups.length > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    title={i18n.t('Một số nhóm chưa đủ số môn theo yêu cầu')}
                    description={i18n.t('{{v0}}. Hệ thống chỉ cảnh báo, hãy bổ sung môn cho nhóm.', { v0: incompleteGroups
                        .map(group => `${group.name} (${group.members.length}/${group.required_count} môn)`)
                        .join(', ') })}
                />
            )}

            {isEmpty && (
                <EmptyState
                    title={i18n.t('Chương trình chưa có nhóm môn')}
                    description={i18n.t('Tạo khối yêu cầu để gom các môn cùng khối kiến thức: chọn 1 trong 5, chọn 5 trong 44…')}
                    action={<ISolidBtn icon={<LuPlus />} onClick={openCreate}>{i18n.t('Tạo nhóm môn')}</ISolidBtn>}
                />
            )}

            {!isEmpty && !groupsQuery.isError && (
                <ITable<CourseGroup>
                    showIndex={false}
                    columns={columns}
                    dataSource={groups}
                    rowKey="id"
                    pagination={false}
                    loading={groupsQuery.isLoading}
                    emptyText={i18n.t('Chương trình chưa có nhóm môn')}
                    expandable={{
                        expandedRowRender: group => {
                            if (group.pool_scope === COURSE_GROUP_SCOPE.ANY) {
                                return (
                                    <Text type="secondary">
                                        {i18n.t('Khối chọn tự do: sinh viên chọn mọi môn {{v0}} tín chỉ trong danh mục, ', { v0: group.pool_course_credits ?? '' })
                                        + i18n.t('cần đạt {{v0}} tín chỉ.', { v0: group.required_credits ?? '?' })}
                                    </Text>
                                );
                            }

                            return group.members.length === 0
                                ? <Text type="secondary">{i18n.t('Nhóm chưa có môn nào.')}</Text>
                                : (
                                    <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                                        <ol style={{ margin: 0, paddingLeft: 24 }}>
                                            {[...group.members]
                                                .sort((a, b) => a.course.code.localeCompare(b.course.code))
                                                .map(member => (
                                                    <li key={member.course_id} style={{ padding: '2px 0' }}>
                                                        <Text strong>{member.course.code}</Text>
                                                        {` · ${member.course.name} `}
                                                        <Text type="secondary">({member.course.credits}{' '}{i18n.t('TC)')}</Text>
                                                    </li>
                                                ))}
                                        </ol>

                                        {group.required_count !== null && group.required_count > group.members.length && (
                                            <Alert
                                                type="warning"
                                                showIcon
                                                title={i18n.t('Nhóm cần {{required_count}} môn nhưng mới có {{length}} môn.', { required_count: group.required_count, length: group.members.length })}
                                            />
                                        )}
                                    </Space>
                                );
                        },
                    }}
                />
            )}

            <Modal
                open={open}
                title={editingGroup ? i18n.t('Sửa nhóm môn') : i18n.t('Tạo nhóm môn')}
                okText={editingGroup ? i18n.t('Lưu') : i18n.t('Tạo nhóm')}
                cancelText={i18n.t('Huỷ')}
                confirmLoading={createGroup.isPending || updateGroup.isPending}
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

                <Form<CourseGroupPayload>
                    form={form}
                    layout="vertical"
                    initialValues={{
                        kind: COURSE_GROUP_KIND.REQUIRED,
                        pool_scope: COURSE_GROUP_SCOPE.LISTED,
                        required_count: 1,
                        course_ids: [],
                    }}
                    onValuesChange={changed => {
                        if (changed.pool_scope === COURSE_GROUP_SCOPE.ANY) {
                            form.setFieldValue('course_ids', []);
                        }
                    }}
                    onFinish={submit}
                >
                    <FormField
                        name="name"
                        label={i18n.t('Tên nhóm')}
                        placeholder={i18n.t('Cơ sở ngành')}
                        rules={[
                            { required: true, message: i18n.t('Nhập tên nhóm.') },
                            { max: 255, message: i18n.t('Tên nhóm tối đa 255 ký tự.') },
                        ]}
                    />

                    <Space size={12} wrap>
                        <Form.Item
                            name="kind"
                            label={i18n.t('Loại nhóm')}
                            rules={[{ required: true, message: i18n.t('Chọn loại nhóm.') }]}
                        >
                            <Select options={KIND_OPTIONS} style={{ width: 160 }} />
                        </Form.Item>

                        <Form.Item
                            name="pool_scope"
                            label={i18n.t('Phạm vi môn')}
                            rules={[{ required: true, message: i18n.t('Chọn phạm vi môn.') }]}
                        >
                            <Select options={SCOPE_OPTIONS} style={{ width: 160 }} />
                        </Form.Item>
                    </Space>

                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.pool_scope !== cur.pool_scope}>
                        {({ getFieldValue }) => {
                            const isAny = getFieldValue('pool_scope') === COURSE_GROUP_SCOPE.ANY;

                            return (
                                <Space size={12} wrap>
                                    {!isAny && (
                                        <Form.Item
                                            name="required_count"
                                            label={i18n.t('Số môn cần')}
                                            rules={[targetValidator()]}
                                        >
                                            <InputNumber {...COUNT_FIELD} style={{ width: 140 }} />
                                        </Form.Item>
                                    )}

                                    <Form.Item
                                        name="required_credits"
                                        label={i18n.t('Số tín chỉ cần')}
                                        rules={[targetValidator()]}
                                    >
                                        <InputNumber {...CREDITS_FIELD} style={{ width: 140 }} />
                                    </Form.Item>

                                    {isAny && (
                                        <Form.Item
                                            name="pool_course_credits"
                                            label={i18n.t('Chỉ nhận môn … tín chỉ')}
                                            extra={i18n.t('Để trống nếu mọi môn đều hợp lệ.')}
                                        >
                                            <InputNumber {...CREDITS_FIELD} style={{ width: 140 }} />
                                        </Form.Item>
                                    )}
                                </Space>
                            );
                        }}
                    </Form.Item>

                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.pool_scope !== cur.pool_scope}>
                        {({ getFieldValue }) => getFieldValue('pool_scope') === COURSE_GROUP_SCOPE.ANY
                            ? (
                                <Alert
                                    type="info"
                                    showIcon
                                    title={i18n.t('Khối chọn tự do không khai báo thành viên')}
                                    description={i18n.t('Sinh viên chọn bất kỳ môn nào trong danh mục môn học (kể cả môn của chương trình khác) miễn đủ số tín chỉ yêu cầu.')}
                                    style={{ marginTop: 8 }}
                                />
                            )
                            : (
                                <Form.Item
                                    name="course_ids"
                                    label={i18n.t('Môn trong nhóm')}
                                    extra={i18n.t('Chỉ chọn được môn đã có trong chương trình. Lưu nhóm sẽ thay toàn bộ danh sách môn của nhóm.')}
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
                            )}
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default GroupsTab;
