import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EmptyTableLine, KpiCount, PageLoading, ProgressThread, ToggleRow } from '@/components';
import { listRegulations } from '@/apis/curriculum';
import { listMyRegulationStatuses, removeMyRegulationStatus, upsertMyRegulationStatus } from '@/apis/student';
import { useApiMutation, useApiQuery } from '@/hooks';
import { STUDENT_REGULATION_STATUS } from '@/types';
import { toastMessage } from '@/utils/toast';

/**
 * Graduation regulations of the student's curriculum (English, MOS, physical education certificates...), each with
 * a "đã đạt" switch the student sets themselves. Replaces the former /regulations page; shown in the "Điều kiện tốt
 * nghiệp" group of the Tiến độ tab and in the Phân tích tab. Query keys are shared with useStudentAnalysis, so a
 * change also updates the analysis warnings.
 */
export const RegulationList = ({ curriculumId, compact = false }: { curriculumId: string; compact?: boolean }) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const regulationsQuery = useApiQuery(['curriculum', curriculumId, 'regulations'], () => listRegulations(curriculumId));
    const statusesQuery = useApiQuery(['regulation-statuses', curriculumId], () => listMyRegulationStatuses(curriculumId));

    const completed = useMemo(() => new Set((statusesQuery.data ?? [])
        .filter(record => record.status === STUDENT_REGULATION_STATUS.COMPLETED)
        .map(record => record.regulation_id)), [statusesQuery.data]);

    const setStatus = useApiMutation({
        mutationFn: ({ regulationId, done }: { regulationId: string; done: boolean }) => (done
            ? upsertMyRegulationStatus(regulationId, STUDENT_REGULATION_STATUS.COMPLETED)
            : removeMyRegulationStatus(regulationId)),
        onSuccess: () => {
            toastMessage.success(t('Đã cập nhật trạng thái quy định.'));
            return queryClient.invalidateQueries({ queryKey: ['regulation-statuses', curriculumId] });
        },
    });

    if (regulationsQuery.isLoading || statusesQuery.isLoading) return <PageLoading label={t('Đang tải quy định...')} rows={2} />;
    const regulations = regulationsQuery.data ?? [];
    if (!regulations.length) return <EmptyTableLine>{t('Chương trình này chưa có quy định tốt nghiệp nào.')}</EmptyTableLine>;

    const done = regulations.filter(regulation => completed.has(regulation.id)).length;
    return (
        <div className="regulation-list">
            {!compact && (
                <div className="regulation-summary">
                    <KpiCount value={done} suffix={t('/ {{total}} quy định đã đạt', { total: regulations.length })} />
                    <ProgressThread percent={(done / regulations.length) * 100} label={t('Quy định đã đạt')} />
                    <p className="regulation-hint">{t('Trạng thái do bạn tự khai; bộ giải và phần phân tích dùng trạng thái này.')}</p>
                </div>
            )}
            {regulations.map(regulation => (
                <ToggleRow
                    key={regulation.id}
                    title={regulation.name}
                    description={regulation.detail ?? t('Chưa có mô tả chi tiết')}
                    checked={completed.has(regulation.id)}
                    disabled={setStatus.isPending}
                    onChange={value => setStatus.mutate({ regulationId: regulation.id, done: value })}
                />
            ))}
        </div>
    );
};

export default RegulationList;
