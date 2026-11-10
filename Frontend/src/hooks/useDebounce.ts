import { useEffect, useState } from 'react';

/** Trả về giá trị sau khi người dùng ngừng thay đổi `delay` ms (dùng cho ô tìm kiếm). */
export function useDebounce<T>(value: T, delay = 350): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedValue(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}

export default useDebounce;
