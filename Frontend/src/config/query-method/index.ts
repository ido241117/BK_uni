import type { AxiosRequestConfig } from 'axios';
import type { ApiResult, PaginatedResult, PaginationMeta } from '@/types';
import { ApiError, isApiResultEnvelope, isUnauthorized, toApiError } from '@/utils/error';
import { toastMessage } from '@/utils/toast';
import axiosMethod from './axiosMethod.config';

export interface RequestOptions extends AxiosRequestConfig {
    /** Tắt toast lỗi toàn cục khi nơi gọi tự hiển thị lỗi (ví dụ: Alert trong form). */
    suppressGlobalErrorToast?: boolean;
}

type ResultOptions = Pick<RequestOptions, 'suppressGlobalErrorToast'>;

export const EMPTY_PAGINATION: PaginationMeta = {
    page: 1,
    take: 10,
    itemCount: 0,
    pageCount: 0,
    hasPreviousPage: false,
    hasNextPage: false,
};

const reportError = (rawError: unknown, suppress?: boolean): ApiError => {
    const error = toApiError(rawError);
    // Lỗi 401 đã được interceptor xử lý (xoá phiên + điều hướng) nên chỉ báo một lần.
    if (!suppress && !isUnauthorized(error)) {
        toastMessage.error(error.message);
    }
    return error;
};

/**
 * Gửi request và bóc envelope `{ error, data, message, pagination }`.
 * Mọi lỗi transport/lỗi nghiệp vụ đều được chuẩn hoá thành `ApiError`.
 */
async function send<T>(
    options: RequestOptions,
    pick: (body: ApiResult<unknown> | unknown) => T,
): Promise<T> {
    const { suppressGlobalErrorToast, ...config } = options;

    let body: unknown;
    try {
        const response = await axiosMethod.request<unknown>(config);
        body = response.data;
    } catch (rawError) {
        throw reportError(rawError, suppressGlobalErrorToast);
    }

    if (isApiResultEnvelope(body) && body.error) {
        // Backend có thể trả HTTP 200 nhưng envelope báo lỗi nghiệp vụ.
        throw reportError(new ApiError(body.message || 'Yêu cầu không thành công.'), suppressGlobalErrorToast);
    }

    return pick(body);
}

/** Request trả về một object/giá trị đơn. */
export const request = <T>(options: RequestOptions): Promise<T> =>
    send<T>(options, body => (
        isApiResultEnvelope(body) ? (body.data as T) : (body as T)
    ));

/** Request danh sách: trả `{ items, pagination }` để page không phải tự đoán chỗ lấy meta. */
export const requestPage = <T>(options: RequestOptions): Promise<PaginatedResult<T>> =>
    send<PaginatedResult<T>>(options, (body) => {
        if (!isApiResultEnvelope(body)) {
            return { items: (body as T[] | null) ?? [], pagination: EMPTY_PAGINATION };
        }

        return {
            items: (body.data as T[] | null) ?? [],
            pagination: body.pagination ?? EMPTY_PAGINATION,
        };
    });

const get = <T>(url: string, options?: AxiosRequestConfig & ResultOptions) =>
    request<T>({ ...options, method: 'GET', url });

const getPage = <T>(url: string, options?: AxiosRequestConfig & ResultOptions) =>
    requestPage<T>({ ...options, method: 'GET', url });

const post = <T>(url: string, data?: unknown, options?: AxiosRequestConfig & ResultOptions) =>
    request<T>({ ...options, method: 'POST', url, data });

const patch = <T>(url: string, data?: unknown, options?: AxiosRequestConfig & ResultOptions) =>
    request<T>({ ...options, method: 'PATCH', url, data });

const put = <T>(url: string, data?: unknown, options?: AxiosRequestConfig & ResultOptions) =>
    request<T>({ ...options, method: 'PUT', url, data });

const remove = <T = null>(url: string, options?: AxiosRequestConfig & ResultOptions) =>
    request<T>({ ...options, method: 'DELETE', url });

export const queryMethod = { get, getPage, post, patch, put, delete: remove };

export type QueryMethod = typeof queryMethod;
