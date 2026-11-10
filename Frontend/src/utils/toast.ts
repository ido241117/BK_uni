import { toast, type Id } from 'react-toastify';

type ToastInput = string | { content: string; key?: string };

const activeToasts = new Map<string, Id>();

const normalize = (input: ToastInput) => (
    typeof input === 'string' ? { content: input, key: undefined } : input
);

const show = (type: 'success' | 'error' | 'warning' | 'info' | 'loading', input: ToastInput) => {
    const { content, key } = normalize(input);
    const current = key ? activeToasts.get(key) : undefined;

    if (current && toast.isActive(current)) {
        toast.update(current, {
            render: content,
            type: type === 'loading' ? 'default' : type,
            isLoading: type === 'loading',
            autoClose: type === 'loading' ? false : 3000,
            closeButton: type !== 'loading',
        });
        return current;
    }

    const id = toast[type](content, {
        toastId: key,
        autoClose: type === 'loading' ? false : 3000,
        closeButton: type !== 'loading',
    });

    if (key) activeToasts.set(key, id);
    return id;
};

/**
 * Wrapper duy nhất cho react-toastify.
 * Dùng `key` để một thao tác chỉ chiếm một toast (loading -> success/error).
 */
export const toastMessage = {
    loading: (input: ToastInput) => show('loading', input),
    success: (input: ToastInput) => show('success', input),
    error: (input: ToastInput) => show('error', input),
    warning: (input: ToastInput) => show('warning', input),
    info: (input: ToastInput) => show('info', input),
    dismiss: (key?: string) => {
        if (!key) {
            toast.dismiss();
            return;
        }

        const id = activeToasts.get(key);
        if (id) {
            toast.dismiss(id);
            activeToasts.delete(key);
        }
    },
};
