import { useLocation } from 'react-router';

const RESERVED_KEYS = new Set(['page', 'pageSize']);

export interface PageLocation<TFilters> {
    page: number;
    pageSize: number;
    filters: TFilters | undefined;
}

/**
 * Đọc state danh sách từ URL: `?page=2&pageSize=20&search=abc`.
 * Nhờ vậy F5 không mất trang/filter và chia sẻ link được.
 */
export function usePageLocation<TFilters extends object = Record<string, unknown>>(): PageLocation<TFilters> {
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);

    const page = Number(searchParams.get('page') ?? '1') || 1;
    const pageSize = Number(searchParams.get('pageSize') ?? '10') || 10;

    const queryFilters = Array.from(searchParams.entries()).reduce<Record<string, string>>((acc, [key, value]) => {
        if (!RESERVED_KEYS.has(key) && value !== '') acc[key] = value;
        return acc;
    }, {});

    const merged = { ...(location.state as TFilters | null ?? {}), ...queryFilters } as TFilters;

    return {
        page: page > 0 ? page : 1,
        pageSize: pageSize > 0 ? pageSize : 10,
        filters: Object.keys(merged).length > 0 ? merged : undefined,
    };
}

export default usePageLocation;
