import { Card, Skeleton, Space } from 'antd';

interface TablePageSkeletonProps {
    rows?: number;
    showHeader?: boolean;
}

/** Khung chờ cho trang danh sách — tránh nhảy layout khi dữ liệu về. */
export const TablePageSkeleton = ({ rows = 6, showHeader = true }: TablePageSkeletonProps) => (
    <div className="stack">
        {showHeader && (
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Skeleton.Input active style={{ width: 220, height: 32 }} />
                <Skeleton.Button active style={{ width: 120, height: 40 }} />
            </Space>
        )}

        <Card>
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                <Skeleton.Input active block style={{ height: 40 }} />
                {Array.from({ length: rows }).map((_, index) => (
                    <Skeleton.Input key={index} active block style={{ height: 44 }} />
                ))}
            </Space>
        </Card>
    </div>
);

export default TablePageSkeleton;
