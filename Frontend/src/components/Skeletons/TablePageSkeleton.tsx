import { PageLoading } from '@/components/ui';

interface TablePageSkeletonProps {
    rows?: number;
    label?: string;
}

/** Page-shaped loading state while data loads (ui-template/feedback.html, "Page loading"). */
export const TablePageSkeleton = ({ rows = 3, label }: TablePageSkeletonProps) => <PageLoading rows={rows} label={label} />;

export default TablePageSkeleton;
