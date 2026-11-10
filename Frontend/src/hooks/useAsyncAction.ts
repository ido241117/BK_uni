import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getErrorMessage } from '@/utils/error';

export type AsyncStatus = 'idle' | 'pending' | 'success' | 'error';

interface AsyncActionOptions<TResult, TArgs extends unknown[]> {
    onSuccess?: (result: TResult, args: TArgs) => void | Promise<void>;
    onError?: (error: unknown, args: TArgs) => void | Promise<void>;
}

export interface AsyncActionResult<TResult, TArgs extends unknown[]> {
    run: (...args: TArgs) => Promise<TResult | undefined>;
    reset: () => void;
    status: AsyncStatus;
    loading: boolean;
    error: string | null;
    data: TResult | undefined;
}

/**
 * Gói boilerplate `useState(loading) + useState(error) + try/catch/finally`
 * cho các thao tác một lần: đăng nhập, đăng ký, đăng xuất, gửi form.
 *
 * Với dữ liệu server dạng danh sách/chi tiết thì dùng `useApiQuery`/`useApiMutation`.
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
    action: (...args: TArgs) => Promise<TResult>,
    options: AsyncActionOptions<TResult, TArgs> = {},
): AsyncActionResult<TResult, TArgs> {
    const optionsRef = useRef(options);
    const [status, setStatus] = useState<AsyncStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<TResult | undefined>(undefined);

    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    const run = useCallback(async (...args: TArgs): Promise<TResult | undefined> => {
        setStatus('pending');
        setError(null);

        try {
            const result = await action(...args);
            setData(result);
            setStatus('success');
            await optionsRef.current.onSuccess?.(result, args);
            return result;
        } catch (caught) {
            setError(getErrorMessage(caught));
            setStatus('error');
            await optionsRef.current.onError?.(caught, args);
            return undefined;
        }
    }, [action]);

    const reset = useCallback(() => {
        setStatus('idle');
        setError(null);
        setData(undefined);
    }, []);

    return useMemo(
        () => ({ run, reset, status, loading: status === 'pending', error, data }),
        [run, reset, status, error, data],
    );
}

export default useAsyncAction;
