import { PageLoading } from '@/components/ui';

interface TablePageSkeletonProps {
    rows?: number;
    label?: string;
}

/** Page-shaped loading state while data loads (ui-template/components-template-2.html, section 8). */
export const TablePageSkeleton = ({ rows = 3, label }: TablePageSkeletonProps) => <PageLoading rows={rows} label={label} />;

export default TablePageSkeleton;
