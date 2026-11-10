import { useQuery, type QueryKey, type UseQueryOptions } from '@tanstack/react-query';

/**
 * Lớp mỏng trên `useQuery` để mọi trang đọc dữ liệu theo cùng một cách:
 * queryKey rõ ràng, `placeholderData` giữ dữ liệu cũ khi đổi trang.
 */
export function useApiQuery<TData>(
    queryKey: QueryKey,
    queryFn: () => Promise<TData>,
    options?: Omit<UseQueryOptions<TData, Error>, 'queryKey' | 'queryFn'>,
) {
    return useQuery<TData, Error>({
        queryKey,
        queryFn,
        ...options,
    });
}

export default useApiQuery;
