import type { ReactNode } from 'react';

/** Mọi bản ghi backend đều có các trường này. */
export interface BaseRecord {
    id: string;
    created_at: string;
    updated_at: string;
    updated_by: string | null;
}

/** Kiểu bao ngoài của mọi response từ backend BK Uni. */
export interface ApiResult<T> {
    error: boolean;
    data: T;
    message: string;
    /** Chỉ có ở endpoint danh sách (phân trang). */
    pagination?: PaginationMeta;
}

export interface PaginationMeta {
    page: number;
    take: number;
    itemCount: number;
    pageCount: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
}

export interface PageParams {
    page?: number;
    take?: number;
    order?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
    items: T[];
    pagination: PaginationMeta;
}

export interface SelectOption<Value extends string | number = string> {
    label: ReactNode;
    value: Value;
}
