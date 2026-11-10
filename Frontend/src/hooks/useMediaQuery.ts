import { useCallback, useSyncExternalStore } from 'react';

/** Theo dõi một media query, dùng cho layout responsive (sider/drawer). */
export function useMediaQuery(query: string): boolean {
    const subscribe = useCallback((onStoreChange: () => void) => {
        const mediaQueryList = window.matchMedia(query);
        mediaQueryList.addEventListener('change', onStoreChange);
        return () => mediaQueryList.removeEventListener('change', onStoreChange);
    }, [query]);

    const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export default useMediaQuery;
