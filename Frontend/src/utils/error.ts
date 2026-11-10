import axios from 'axios';
import type { ApiResult } from '@/types';

const STATUS_MESSAGE: Record<number, string> = {
    400: 'Yêu cầu không hợp lệ. Vui lòng kiểm tra lại dữ liệu.',
    401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    403: 'Bạn không có quyền thực hiện thao tác này.',
    404: 'Không tìm thấy dữ liệu yêu cầu.',
    409: 'Dữ liệu đã thay đổi. Vui lòng tải lại trang và thử lại.',
    422: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
    429: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
    500: 'Hệ thống đang bận. Vui lòng thử lại sau.',
    502: 'Hệ thống đang bận. Vui lòng thử lại sau.',
    503: 'Hệ thống đang bận. Vui lòng thử lại sau.',
    504: 'Máy chủ phản hồi quá lâu. Vui lòng thử lại sau.',
};

const DEFAULT_ERROR_MESSAGE = 'Đã xảy ra lỗi. Vui lòng thử lại.';

/** Lỗi đã được chuẩn hoá để tầng UI không phải biết tới axios. */
export class ApiError extends Error {
    readonly status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

export const isUnauthorized = (error: unknown): boolean =>
    (isApiError(error) && error.status === 401)
    || (axios.isAxiosError(error) && error.response?.status === 401);

/** Response có đúng bao ngoài `{ error, data, message }` của backend hay không. */
export const isApiResultEnvelope = (value: unknown): value is ApiResult<unknown> =>
    typeof value === 'object'
    && value !== null
    && 'error' in value
    && typeof (value as { error: unknown }).error === 'boolean'
    && 'message' in value;

const readMessage = (value: unknown): string | undefined => {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
        const first = value.find((item): item is string => typeof item === 'string' && Boolean(item.trim()));
        return first?.trim();
    }
    return undefined;
};

/** Chuyển mọi lỗi (axios, envelope, Error, unknown) thành `ApiError`. */
export const toApiError = (error: unknown): ApiError => {
    if (isApiError(error)) return error;

    if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const body = error.response?.data;

        if (isApiResultEnvelope(body)) {
            const message = readMessage(body.message) ?? readMessage(body.data);
            if (message) return new ApiError(message, status);
        }

        const bodyMessage = typeof body === 'object' && body !== null
            ? readMessage((body as { message?: unknown }).message)
            : undefined;
        if (bodyMessage) return new ApiError(bodyMessage, status);

        if (!error.response) {
            return new ApiError('Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.');
        }

        const statusMessage = status === undefined ? undefined : STATUS_MESSAGE[status];
        return new ApiError(statusMessage ?? DEFAULT_ERROR_MESSAGE, status);
    }

    if (error instanceof Error && error.message.trim()) {
        return new ApiError(error.message);
    }

    return new ApiError(DEFAULT_ERROR_MESSAGE);
};

/** Thông điệp hiển thị được cho người dùng cuối. */
export const getErrorMessage = (error: unknown): string => toApiError(error).message;
