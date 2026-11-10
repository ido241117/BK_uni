import axios, { type AxiosInstance } from 'axios';
import { emitSessionExpired } from '@/utils/session-bus';

const AUTH_ENTRY_PATTERN = /^\/?auth\/(login|register|logout|me)(\/|$|\?)/i;

const isAuthEntryRequest = (url?: string) => {
    if (!url) return false;
    const normalized = url.replace(/^https?:\/\/[^/]+/i, '');
    return AUTH_ENTRY_PATTERN.test(normalized);
};

/**
 * Axios instance duy nhất. Mọi logic dùng chung nằm ở đây:
 * - tự bỏ `Content-Type` khi payload là FormData
 * - phát tín hiệu hết phiên khi gặp 401 (trừ các endpoint đăng nhập/đăng ký)
 *
 * Việc bóc envelope + hiển thị toast nằm ở `request()` để giữ interceptor mỏng.
 */
export const axiosMethod: AxiosInstance = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
    timeout: 30_000,
    withCredentials: true,
});

axiosMethod.interceptors.request.use(
    (config) => {
        const isFormData = typeof FormData !== 'undefined' && config.data instanceof FormData;
        if (isFormData) {
            delete config.headers['Content-Type'];
        } else {
            config.headers['Content-Type'] = 'application/json';
        }
        return config;
    },
    error => Promise.reject(error),
);

axiosMethod.interceptors.response.use(
    response => response,
    error => {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const url = axios.isAxiosError(error) ? error.config?.url : undefined;

        if (status === 401 && !isAuthEntryRequest(url)) {
            emitSessionExpired();
        }

        return Promise.reject(error);
    },
);

export default axiosMethod;
