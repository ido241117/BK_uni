import { Alert, Card } from 'antd';
import type { ReactNode } from 'react';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';

interface ComingSoonProps {
    title: string;
    subtitle?: ReactNode;
    /** Ghi rõ phần nào còn thiếu API để không ai tưởng là lỗi. */
    reason?: string;
    extra?: ReactNode;
}

/** Trang chờ API — dùng khi backend chưa có endpoint (xem API-FRONTEND.md mục 7). */
export const ComingSoon = ({
    title,
    subtitle,
    reason = 'Backend chưa cung cấp endpoint cho chức năng này.',
    extra,
}: ComingSoonProps) => (
    <section>
        <PageHeader title={title} subtitle={subtitle} extra={extra} />
        <Card>
            <EmptyState
                title="Chức năng đang chờ API"
                description={reason}
            />
            <Alert type="info" showIcon title="Đang chờ backend" description={reason} />
        </Card>
    </section>
);

export default ComingSoon;
