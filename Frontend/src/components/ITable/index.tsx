import { useCallback, useEffect, useMemo } from 'react';
import { Empty, Table, type TableProps } from 'antd';
import { useLocation, useNavigate } from 'react-router';

export interface ITablePagination {
    total: number;
    pageSize: number;
    current?: number;
    onChange?: (page: number, pageSize: number) => void;
    showSizeChanger?: boolean;
}

/** Độ rộng tối thiểu của cột không khai `width` (tên môn, mô tả…): cột này chiếm phần còn lại của bảng. */
const FLEX_COLUMN_MIN_WIDTH = 200;

export interface ITableProps<T> extends Omit<TableProps<T>, 'pagination'> {
    pagination: ITablePagination | false;
    /** Filter hiện tại — được ghi lên URL để F5/chia sẻ link giữ nguyên. */
    filters?: Record<string, unknown>;
    syncLocation?: boolean;
    showIndex?: boolean;
    emptyText?: string;
}

/**
 * Bảng dùng chung: thêm cột STT, đồng bộ page/pageSize/filter lên URL,
 * và trạng thái rỗng thống nhất.
 *
 * Trang danh sách chỉ cần:
 *   const { page, pageSize, filters } = usePageLocation();
 *   <ITable pagination={{ total: pagination.itemCount, current: page, pageSize }} ... />
 */
export function ITable<T extends object>({
    columns,
    dataSource,
    pagination,
    filters = {},
    syncLocation = true,
    showIndex = true,
    emptyText = 'Không có dữ liệu phù hợp',
    ...rest
}: ITableProps<T>) {
    const navigate = useNavigate();
    const location = useLocation();
    const { scroll, ...tableProps } = rest;

    const mergedColumns = useMemo(() => {
        if (!columns || !showIndex) return columns;

        const indexColumn: NonNullable<TableProps<T>['columns']>[number] = {
            title: 'STT',
            key: '__index',
            width: 64,
            align: 'center',
            render: (_value, _record, index) => {
                const current = pagination ? pagination.current ?? 1 : 1;
                const size = pagination ? pagination.pageSize : 10;
                return (current - 1) * size + index + 1;
            },
        };

        return [indexColumn, ...columns];
    }, [columns, showIndex, pagination]);

    const buildParams = useCallback(() => {
        const params = new URLSearchParams(location.search);
        params.delete('page');
        params.delete('pageSize');

        Object.entries(filters).forEach(([key, value]) => {
            const isEmpty = value === undefined || value === null || value === ''
                || (Array.isArray(value) && value.length === 0);

            if (isEmpty) {
                params.delete(key);
                return;
            }

            params.set(key, Array.isArray(value) ? value.join(',') : String(value));
        });

        return params;
    }, [filters, location.search]);

    const handleChange = (page: number, pageSize: number) => {
        if (pagination) pagination.onChange?.(page, pageSize);
        if (!syncLocation) return;

        const params = buildParams();
        params.set('page', String(page));
        params.set('pageSize', String(pageSize));
        navigate(`?${params.toString()}`, { state: filters });
    };

    useEffect(() => {
        if (!syncLocation || pagination === false) return;

        const params = buildParams();
        params.set('page', String(pagination.current ?? 1));
        params.set('pageSize', String(pagination.pageSize ?? 10));

        const next = params.toString();
        const current = location.search.startsWith('?') ? location.search.slice(1) : location.search;
        if (next !== current) {
            navigate(next ? `?${next}` : '', { replace: true, state: filters });
        }
    }, [buildParams, filters, location.search, navigate, pagination, syncLocation]);

    // Bố cục cố định: cột giữ đúng `width`, chữ dài xuống dòng thay vì đẩy các cột khác.
    // Bảng rộng tối thiểu bằng tổng các cột (cột không khai `width` tính FLEX_COLUMN_MIN_WIDTH);
    // khung rộng hơn thì giãn ra lấp đầy, hẹp hơn thì cuộn ngang.
    const minTableWidth = useMemo(
        () => (mergedColumns ?? []).reduce((total, column) => (
            total + (typeof column.width === 'number' ? column.width : FLEX_COLUMN_MIN_WIDTH)
        ), 0),
        [mergedColumns],
    );

    return (
        <div className="i-table-wrap">
            <Table<T>
                columns={mergedColumns}
                dataSource={dataSource}
                tableLayout="fixed"
                scroll={{ x: minTableWidth, ...scroll }}
                rowHoverable
                size="middle"
                locale={{ emptyText: <Empty description={emptyText} /> }}
                pagination={pagination === false ? false : {
                    total: pagination.total,
                    pageSize: pagination.pageSize,
                    current: pagination.current,
                    showSizeChanger: pagination.showSizeChanger ?? false,
                    showQuickJumper: false,
                    className: 'i-table-pagination',
                    onChange: handleChange,
                }}
                {...tableProps}
            />
        </div>
    );
}

export default ITable;
