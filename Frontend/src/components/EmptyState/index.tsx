import { Empty, Typography } from 'antd';
import type { ReactNode } from 'react';

interface EmptyStateProps {
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    compact?: boolean;
}

const { Text } = Typography;

/** Trạng thái rỗng thống nhất cho bảng, danh sách, khu vực chưa có dữ liệu. */
export const EmptyState = ({ title, description, action, compact = false }: EmptyStateProps) => (
    <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={(
            <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
                {description && <Text type="secondary">{description}</Text>}
            </div>
        )}
        style={{ padding: compact ? '12px 0' : '28px 0' }}
    >
        {action}
    </Empty>
);

export default EmptyState;
