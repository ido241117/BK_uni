import { QueryClient } from '@tanstack/react-query';

/**
 * Một QueryClient duy nhất cho toàn app. Store có thể import `resetQueryCache`
 * để xoá cache khi đăng xuất mà không phải phụ thuộc React.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
        },
        mutations: {
            retry: 0,
        },
    },
});

export const resetQueryCache = () => {
    queryClient.clear();
};
