import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { toastMessage } from '@/utils/toast';

export interface ApiMutationOptions<TData, TVariables>
    extends Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn' | 'onSuccess'> {
    mutationFn: (variables: TVariables) => Promise<TData>;
    /** Hiện toast thành công sau khi mutation xong. */
    successMessage?: string;
    onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
}

/**
 * Lớp mỏng trên `useMutation` của React Query: tự toast thành công và giữ
 * nguyên cách xử lý lỗi (toast lỗi do `request()` lo).
 */
export function useApiMutation<TData, TVariables = void>(options: ApiMutationOptions<TData, TVariables>) {
    const { successMessage, onSuccess, ...rest } = options;

    return useMutation<TData, Error, TVariables>({
        ...rest,
        onSuccess: async (data, variables) => {
            if (successMessage) toastMessage.success(successMessage);
            await onSuccess?.(data, variables);
        },
    });
}

export default useApiMutation;
