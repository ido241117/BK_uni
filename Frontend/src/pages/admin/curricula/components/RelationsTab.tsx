import { useMemo, useState } from 'react';
import { Alert, Card, Select, Space, Spin, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQueryClient } from '@tanstack/react-query';
import { LuSave } from 'react-icons/lu';
import { EmptyState, ISolidBtn, ITable } from '@/components';
import { listCourseRelations, listCurriculumCourses, replaceCourseRelations } from '@/apis/curriculum';
import { useApiMutation, useApiQuery } from '@/hooks';
import {
    COURSE_RELATION_TYPE,
    COURSE_RELATION_TYPE_LABEL,
    type CourseRelation,
    type CourseRelationType,
    type CourseRelationsPayload,
} from '@/types';
import type { CurriculumTabProps } from '../types';

const { Text } = Typography;

/** Option của Select: dùng type alias (không phải interface) để gán thẳng vào `options` của antd. */
type RelationOption = {
    value: string;
    label: string;
};

/** Biến của mutation lưu quan hệ: môn đang chọn + danh sách quan hệ mới. */
type SaveRelationsVariables = {
    courseId: string;
    payload: CourseRelationsPayload;
};

const RELATION_TAG_COLOR: Record<CourseRelationType, string> = {
    [COURSE_RELATION_TYPE.PREREQUISITE]: 'blue',
    [COURSE_RELATION_TYPE.PRIOR]: 'purple',
    [COURSE_RELATION_TYPE.COREQUISITE]: 'cyan',
    [COURSE_RELATION_TYPE.RECOMMENDED]: 'gold',
};

/** Thứ tự, nhãn và mô tả từng loại trong form sửa; khóa payload tương ứng của API. */
const RELATION_FIELDS: {
    type: CourseRelationType;
    payloadKey: keyof CourseRelationsPayload;
    placeholder: string;
    hint: string;
}[] = [
    {
        type: COURSE_RELATION_TYPE.PREREQUISITE,
        payloadKey: 'prerequisite_course_ids',
        placeholder: 'Chọn các môn phải đạt trước',
        hint: 'TQ: sinh viên phải học đạt các môn này trước khi học môn đang chọn.',
    },
    {
        type: COURSE_RELATION_TYPE.PRIOR,
        payloadKey: 'prior_course_ids',
        placeholder: 'Chọn các môn phải học trước',
        hint: 'HT: sinh viên phải đã học các môn này (không đạt vẫn được) trước khi học môn đang chọn.',
    },
    {
        type: COURSE_RELATION_TYPE.COREQUISITE,
        payloadKey: 'corequisite_course_ids',
        placeholder: 'Chọn các môn học trước hoặc cùng kỳ',
        hint: 'SHT: các môn này phải học trước hoặc học cùng học kỳ với môn đang chọn.',
    },
    {
        type: COURSE_RELATION_TYPE.RECOMMENDED,
        payloadKey: 'recommended_course_ids',
        placeholder: 'Chọn các môn nên học trước',
        hint: 'KN: nên học trước để theo kịp môn đang chọn (không bắt buộc).',
    },
];

const RELATION_TYPE_OPTIONS = Object.values(COURSE_RELATION_TYPE).map(value => ({
    value,
    label: COURSE_RELATION_TYPE_LABEL[value],
}));

const relationIdsOf = (relations: CourseRelation[], type: CourseRelationType): string[] =>
    relations.filter(item => item.type === type).map(item => item.related_course_id);

/**
 * Quan hệ tiên quyết vòng tròn đơn giản: A là tiên quyết của B và B là tiên quyết của A.
 * Backend không chặn trường hợp này nên giao diện chỉ cảnh báo.
 */
const findCircularPrerequisites = (relations: CourseRelation[]): string[] => {
    const prerequisiteEdges = new Set(
        relations
            .filter(item => item.type === COURSE_RELATION_TYPE.PREREQUISITE)
            .map(item => `${item.course_id}:${item.related_course_id}`),
    );

    const reportedPairs = new Set<string>();
    const warnings: string[] = [];

    relations.forEach((item) => {
        if (item.type !== COURSE_RELATION_TYPE.PREREQUISITE) return;
        if (!prerequisiteEdges.has(`${item.related_course_id}:${item.course_id}`)) return;

        const pairKey = [item.course_id, item.related_course_id].sort().join(':');
        if (reportedPairs.has(pairKey)) return;

        reportedPairs.add(pairKey);
        warnings.push(`${item.course_code} là tiên quyết của ${item.related_course_code} và ngược lại.`);
    });

    return warnings;
};

interface RelationEditorProps {
    options: RelationOption[];
    relations: CourseRelation[];
    saving: boolean;
    onSave: (payload: CourseRelationsPayload) => void;
}

/**
 * Form sửa quan hệ của một môn. Component được mount lại (qua `key`) mỗi khi đổi môn
 * nên giá trị khởi tạo luôn là quan hệ hiện tại của môn đó.
 */
const RelationEditor = ({ options, relations, saving, onSave }: RelationEditorProps) => {
    const [selected, setSelected] = useState<Record<CourseRelationType, string[]>>(() => ({
        [COURSE_RELATION_TYPE.PREREQUISITE]: relationIdsOf(relations, COURSE_RELATION_TYPE.PREREQUISITE),
        [COURSE_RELATION_TYPE.PRIOR]: relationIdsOf(relations, COURSE_RELATION_TYPE.PRIOR),
        [COURSE_RELATION_TYPE.COREQUISITE]: relationIdsOf(relations, COURSE_RELATION_TYPE.COREQUISITE),
        [COURSE_RELATION_TYPE.RECOMMENDED]: relationIdsOf(relations, COURSE_RELATION_TYPE.RECOMMENDED),
    }));

    const save = () => {
        const payload: CourseRelationsPayload = {};
        RELATION_FIELDS.forEach(field => {
            payload[field.payloadKey] = selected[field.type];
        });
        onSave(payload);
    };

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            {RELATION_FIELDS.map(field => (
                <Space key={field.type} orientation="vertical" size={4} style={{ width: '100%' }}>
                    <Text strong>Môn {COURSE_RELATION_TYPE_LABEL[field.type].toLowerCase()}</Text>
                    <Select<string[]>
                        mode="multiple"
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder={field.placeholder}
                        options={options}
                        value={selected[field.type]}
                        onChange={value => setSelected(current => ({ ...current, [field.type]: value }))}
                    />
                    <Text type="secondary">{field.hint}</Text>
                </Space>
            ))}

            <ISolidBtn
                icon={<LuSave />}
                loading={saving}
                onClick={save}
            >
                Lưu quan hệ
            </ISolidBtn>
        </Space>
    );
};

const RelationsTab = ({ curriculumId }: CurriculumTabProps) => {
    const queryClient = useQueryClient();
    const [courseId, setCourseId] = useState<string>();
    const [typeFilter, setTypeFilter] = useState<CourseRelationType>();

    const coursesQuery = useApiQuery(
        ['curriculum-courses', curriculumId],
        () => listCurriculumCourses(curriculumId),
    );

    const relationsQuery = useApiQuery(
        ['curriculum-relations', curriculumId],
        () => listCourseRelations(curriculumId),
    );

    const courseRelationsQuery = useApiQuery(
        ['curriculum-relations', curriculumId, courseId],
        () => listCourseRelations(curriculumId, courseId),
        { enabled: Boolean(courseId) },
    );

    const courses = coursesQuery.data;

    const courseOptions = useMemo(
        () => (courses ?? [])
            .map(item => ({ value: item.course_id, label: `${item.course.code} · ${item.course.name}` }))
            .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
        [courses],
    );

    const courseNames = useMemo(() => {
        const names = new Map<string, string>();
        (courses ?? []).forEach(item => names.set(item.course_id, item.course.name));
        return names;
    }, [courses]);

    const selectedCourse = courses?.find(item => item.course_id === courseId);

    /** Môn đang chọn không được là quan hệ của chính nó. */
    const relatedOptions = useMemo(
        () => courseOptions.filter(option => option.value !== courseId),
        [courseOptions, courseId],
    );

    const summaryRelations = relationsQuery.data ?? [];
    const visibleRelations = typeFilter
        ? summaryRelations.filter(item => item.type === typeFilter)
        : summaryRelations;

    const circularWarnings = useMemo(
        () => findCircularPrerequisites(relationsQuery.data ?? []),
        [relationsQuery.data],
    );

    const saveRelations = useApiMutation<CourseRelation[], SaveRelationsVariables>({
        mutationFn: variables => replaceCourseRelations(curriculumId, variables.courseId, variables.payload),
        successMessage: 'Đã lưu quan hệ môn học.',
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['curriculum-relations', curriculumId] }),
    });

    const handleSave = (payload: CourseRelationsPayload) => {
        if (!courseId) return;
        saveRelations.mutate({ courseId, payload });
    };

    const columns: ColumnsType<CourseRelation> = [
        {
            title: 'Môn học',
            dataIndex: 'course_code',
            width: 280,
            render: (_code, record) => (
                <Space orientation="vertical" size={0}>
                    <Text strong>{record.course_code}</Text>
                    <Text type="secondary">{courseNames.get(record.course_id) ?? 'Không còn trong chương trình'}</Text>
                </Space>
            ),
        },
        {
            title: 'Loại quan hệ',
            dataIndex: 'type',
            width: 140,
            render: (type: CourseRelationType) => (
                <Tag color={RELATION_TAG_COLOR[type]}>{COURSE_RELATION_TYPE_LABEL[type]}</Tag>
            ),
        },
        {
            title: 'Môn liên quan',
            dataIndex: 'related_course_code',
            render: (_code, record) => (
                <Space orientation="vertical" size={0}>
                    <Text strong>{record.related_course_code}</Text>
                    <Text type="secondary">{courseNames.get(record.related_course_id) ?? 'Không còn trong chương trình'}</Text>
                </Space>
            ),
        },
    ];

    if (coursesQuery.isLoading) {
        return <div style={{ display: 'grid', placeItems: 'center', minHeight: '30vh' }}><Spin size="large" /></div>;
    }

    if (coursesQuery.isError) {
        return (
            <Alert
                type="error"
                showIcon
                title="Không tải được danh sách môn của chương trình"
                description={coursesQuery.error?.message}
            />
        );
    }

    if (courseOptions.length === 0) {
        return (
            <EmptyState
                title="Chương trình chưa có môn học"
                description="Thêm môn vào chương trình ở tab “Môn học” trước khi khai báo quan hệ môn học."
            />
        );
    }

    const selectedRelations = courseRelationsQuery.data;

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Card
                size="small"
                title={selectedCourse
                    ? `Khai báo quan hệ cho ${selectedCourse.course.code} · ${selectedCourse.course.name}`
                    : 'Khai báo quan hệ cho một môn'}
            >
                <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                    <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                        <Text strong>Môn học</Text>
                        <Select<string>
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder="Chọn môn trong chương trình"
                            options={courseOptions}
                            value={courseId}
                            onChange={value => setCourseId(value)}
                        />
                    </Space>

                    {!courseId && (
                        <Text type="secondary">
                            Chọn một môn để khai báo môn tiên quyết, học trước, song hành và khuyến nghị của môn đó.
                        </Text>
                    )}

                    {courseId && !selectedRelations && <Spin />}

                    {courseId && selectedRelations && (
                        <RelationEditor
                            key={courseId}
                            options={relatedOptions}
                            relations={selectedRelations}
                            saving={saveRelations.isPending}
                            onSave={handleSave}
                        />
                    )}
                </Space>
            </Card>

            <Card
                size="small"
                title="Tổng hợp quan hệ của chương trình"
                extra={(
                    <Select<CourseRelationType>
                        allowClear
                        placeholder="Tất cả loại quan hệ"
                        style={{ width: 200 }}
                        options={RELATION_TYPE_OPTIONS}
                        value={typeFilter}
                        onChange={value => setTypeFilter(value)}
                    />
                )}
            >
                <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                    {circularWarnings.length > 0 && (
                        <Alert
                            type="warning"
                            showIcon
                            title="Phát hiện quan hệ tiên quyết vòng tròn"
                            description={(
                                <ul style={{ margin: 0, paddingLeft: 18 }}>
                                    {circularWarnings.map(item => <li key={item}>{item}</li>)}
                                </ul>
                            )}
                        />
                    )}

                    <ITable<CourseRelation>
                        showIndex={false}
                        rowKey="id"
                        columns={columns}
                        dataSource={visibleRelations}
                        loading={relationsQuery.isFetching}
                        pagination={false}
                        syncLocation={false}
                        emptyText="Chương trình chưa có quan hệ môn nào"
                    />
                </Space>
            </Card>
        </Space>
    );
};

export default RelationsTab;
