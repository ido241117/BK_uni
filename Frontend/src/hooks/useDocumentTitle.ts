import { useEffect } from 'react';
import { BRAND } from '@/config/brand';

export const APP_NAME = BRAND.name;

/** Cập nhật tiêu đề tab; `PageHeader` gọi hook này tự động. */
export function useDocumentTitle(title?: string) {
    useEffect(() => {
        document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
    }, [title]);
}

export default useDocumentTitle;
