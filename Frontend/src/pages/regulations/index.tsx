import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Card, Progress, Space, Switch, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link } from 'react-router';
import {
    EmptyState, IOutLinedBtn, ISolidBtn, ITable, PageHeader, TablePageSkeleton,
} from '@/components';
import { getCurriculum, listRegulations } from '@/apis/curriculum';
import {
    getMyProfile,
    listMyRegulationStatuses,
    removeMyRegulationStatus,
    upsertMyRegulationStatus,
} from '@/apis/student';
import { useApiMutation, useApiQuery } from '@/hooks';
import {
    STUDENT_REGULATION_STATUS,
    type CurriculumRegulation,
    type StudentRegulationStatusRecord,
} from '@/types';

const { Text } = Typography;

const RegulationsPage = () => {
    const queryClient = useQueryClient();

    const profileQuery = useApiQuery(['my-profile'], getMyProfile);
    const curriculumId = profileQuery.data?.curriculum_id ?? undefined;

    const curriculumQuery = useApiQuery(
        ['curriculum', curriculumId],
        () => getCurriculum(curriculumId!),
        { enabled: Boolean(curriculumId) },
    );

    const regulationsQuery = useApiQuery(
        ['curriculum', curriculumId, 'regulations'],
        () => listRegulations(curriculumId!),
        { enabled: Boolean(curriculumId) },
    );

    const statusesQuery = useApiQuery(
        ['regulation-statuses', curriculumId],
        () => listMyRegulationStatuses(curriculumId),
        { enabled: Boolean(curriculumId) },
    );

    const regulations = useMemo(() => regulationsQuery.data ?? [], [regulationsQuery.data]);

    const statusByRegulation = useMemo(() => {
        const map = new Map<string, StudentRegulationStatusRecord>();
        statusesQuery.data?.forEach(item => map.set(item.regulation_id, item));
        return map;
    }, [statusesQuery.data]);

    /** Chưa khai hoặc khai `not-started` đều được coi là chưa đạt. */
    const isCompleted = (regulationId: string) =>
        statusByRegulation.get(regulationId)?.status === STUDENT_REGULATION_STATUS.COMPLETED;

    const completedCount = regulations.filter(item => isCompleted(item.id)).length;
    const percent = regulations.length === 0
        ? 0
        : Math.round((completedCount / regulations.length) * 100);

    const setRegulationStatus = useApiMutation({
        mutationFn: (variables: { regulationId: string; completed: boolean }) =>
            variables.completed
                ? upsertMyRegulationStatus(variables.regulationId, STUDENT_REGULATION_STATUS.COMPLETED)
                : removeMyRegulationStatus(variables.regulationId),
        successMessage: 'Đã cập nhật trạng thái quy định.',
        onSuccess: () => queryClient.invalidateQueries({
            queryKey: ['regulation-statuses', curriculumId],
        }),
    });

    const columns: ColumnsType<CurriculumRegulation> = [
        {
            title: 'Quy định',
            key: 'name',
            render: (_value, record) => (
                <Space orientation="vertical" size={2}>
                    <Text strong>{record.name}</Text>
                    {record.detail
                        ? <Text type="secondary">{record.detail}</Text>
                        : <Text type="secondary" italic>Chưa có mô tả chi tiết</Text>}
                </Space>
            ),
        },
        {
            title: 'Trạng thái',
            key: 'status',
            width: 160,
            render: (_value, record) => (
                <Switch
                    checked={isCompleted(record.id)}
                    checkedChildren="Đã đạt"
                    unCheckedChildren="Chưa đạt"
                    loading={setRegulationStatus.isPending
                        && setRegulationStatus.variables?.regulationId === record.id}
                    onChange={checked => setRegulationStatus.mutate({
                        regulationId: record.id,
                        completed: checked,
                    })}
                />
            ),
        },
        {
            title: 'Cập nhật',
            key: 'updated_at',
            width: 170,
            render: (_value, record) => {
                const statusRecord = statusByRegulation.get(record.id);

                return statusRecord
                    ? <Text type="secondary">{new Date(statusRecord.updated_at).toLocaleString('vi-VN')}</Text>
                    : <Text type="secondary">—</Text>;
            },
        },
    ];

    if (profileQuery.isLoading && !profileQuery.data) {
        return <TablePageSkeleton />;
    }

    if (profileQuery.isError) {
        return (
            <Alert
                type="error"
                showIcon
                title="Không tải được hồ sơ sinh viên"
                description="Cần có hồ sơ và chương trình đào tạo để xem quy định tốt nghiệp. Vui lòng thử lại sau."
                action={<Link to="/profile"><IOutLinedBtn>Mở hồ sơ</IOutLinedBtn></Link>}
            />
        );
    }

    if (!curriculumId) {
        return (
            <section>
                <PageHeader
                    title="Quy định tốt nghiệp"
                    subtitle="Theo dõi các quy định của chương trình đào tạo và trạng thái hoàn thành."
                />

                <Card>
                    <EmptyState
                        title="Chưa chọn chương trình đào tạo"
                        description="Bạn cần chọn chương trình trong hồ sơ để xem danh sách quy định tốt nghiệp."
                        action={(
                            <Link to="/profile">
                                <ISolidBtn>Cập nhật hồ sơ</ISolidBtn>
                            </Link>
                        )}
                    />
                </Card>
            </section>
        );
    }

    return (
        <section>
            <PageHeader
                title="Quy định tốt nghiệp"
                subtitle={curriculumQuery.data
                    ? `Chương trình ${curriculumQuery.data.code} · ${curriculumQuery.data.name}`
                    : 'Theo dõi các quy định của chương trình đào tạo và trạng thái hoàn thành.'}
            />

            <div className="stack">
                <Card>
                    <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                            <Text strong>Tiến độ hoàn thành quy định</Text>
                            <Tag color={percent === 100 ? 'green' : 'blue'}>
                                {completedCount}/{regulations.length} quy định đã đạt
                            </Tag>
                        </Space>

                        <Progress percent={percent} status={percent === 100 ? 'success' : 'normal'} />

                        <Text type="secondary">
                            Trạng thái do bạn tự khai: bật công tắc khi đã đạt quy định, tắt để bỏ đánh dấu.
                        </Text>
                    </Space>
                </Card>

                <Card>
                    <ITable<CurriculumRegulation>
                        rowKey="id"
                        columns={columns}
                        dataSource={regulations}
                        loading={regulationsQuery.isFetching || statusesQuery.isFetching}
                        pagination={false}
                        syncLocation={false}
                        emptyText="Chương trình này chưa có quy định tốt nghiệp nào."
                    />
                </Card>
            </div>
        </section>
    );
};

export default RegulationsPage;
