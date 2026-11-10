import type { ReactNode } from 'react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

interface PageHeaderProps {
    title: ReactNode;
    subtitle?: ReactNode;
    extra?: ReactNode;
}

/** Tiêu đề trang dùng chung; nếu `title` là chuỗi thì tự đặt `document.title`. */
export const PageHeader = ({ title, subtitle, extra }: PageHeaderProps) => {
    useDocumentTitle(typeof title === 'string' ? title : undefined);

    return (
        <header className="page-header">
            <div>
                <h1 className="page-header-title">{title}</h1>
                {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
            </div>
            {extra && <div className="page-header-extra">{extra}</div>}
        </header>
    );
};

export default PageHeader;
