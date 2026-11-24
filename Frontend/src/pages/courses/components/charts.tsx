import { useMemo } from 'react';
import { Progress } from 'antd';
import { Bar, Column, Pie } from '@ant-design/plots';
import { useAppTheme } from '@/contexts';

/*
 * Biểu đồ dùng chung cho các trang môn học, vẽ bằng @ant-design/plots (canvas) và antd Progress.
 * Canvas không đọc được biến CSS nên màu được truyền dạng hex; giá trị khớp token `--viz-*` / `--status-*`.
 * Màu series đã kiểm tra tách biệt cho người mù màu ở cả hai chế độ sáng/tối.
 */

const SERIES_COLOR = {
    done: { light: '#2a78d6', dark: '#3987e5' },
    inProgress: { light: '#1baf7a', dark: '#199e70' },
    planned: { light: '#eda100', dark: '#c98500' },
    /** Trạng thái "đã lên kế hoạch" trên trang Môn học (cùng màu thẻ môn). */
    planStatus: { light: '#6250d6', dark: '#9085e9' },
    suggested: { light: '#6250d6', dark: '#9085e9' },
    remaining: { light: '#e8e8ea', dark: '#2a2f37' },
} as const;

/** Các trạng thái tiến độ dùng chung; phần còn thiếu là nền xám. */
export const SERIES = {
    done: 'Đã hoàn thành',
    inProgress: 'Đang học',
    planned: 'Đã lên kế hoạch',
    planStatus: 'Đã lên kế hoạch',
    /** Chỉ dùng ở lộ trình: môn hệ thống tự xếp thêm. */
    suggested: 'Hệ thống đề xuất',
    remaining: 'Còn thiếu',
} as const;

export type SeriesKey = keyof typeof SERIES;

export interface Segment {
    key: SeriesKey;
    value: number;
    /** Đổi nhãn hiển thị của series (vd "Đã tích lũy"). */
    label?: string;
}

/** Bảng màu phân loại 8 màu theo thứ tự cố định, cho dữ liệu không phải trạng thái (vd thành phần điểm). */
const CATEGORICAL = {
    light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
    dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

const useChartTheme = () => {
    const { isDark } = useAppTheme();
    return useMemo(() => {
        const mode = isDark ? 'dark' : 'light';
        return {
            isDark,
            // Nền trong suốt để chart ăn theo màu Card.
            theme: { type: isDark ? 'classicDark' : 'classic', view: { viewFill: 'transparent' } },
            categorical: CATEGORICAL[mode],
            seriesColor: (key: SeriesKey) => SERIES_COLOR[key][mode],
            surface: isDark ? '#141414' : '#ffffff',
        };
    }, [isDark]);
};

type ChartTheme = ReturnType<typeof useChartTheme>;

const seriesName = (segment: Segment) => segment.label ?? SERIES[segment.key];

/** Thang màu theo tên series đang có trong dữ liệu, để màu luôn đi theo trạng thái chứ không theo thứ tự. */
const seriesScale = (segments: Segment[], chart: ChartTheme) => {
    const seen = new Map<string, SeriesKey>();
    segments.forEach(segment => { if (!seen.has(seriesName(segment))) seen.set(seriesName(segment), segment.key); });
    return { domain: [...seen.keys()], range: [...seen.values()].map(key => chart.seriesColor(key)) };
};

/* ------------------------------------ Vòng phần trăm ------------------------------------ */

export const ProgressRing = ({ percent, size = 96 }: { percent: number; size?: number }) => {
    const chart = useChartTheme();
    const clamped = Math.max(0, Math.min(100, percent));
    return (
        <Progress
            type="circle"
            size={size}
            percent={Math.round(clamped)}
            strokeColor={chart.seriesColor('done')}
            railColor={chart.seriesColor('remaining')}
            strokeWidth={10}
            format={value => <span style={{ fontWeight: 700 }}>{value}%</span>}
            aria-label={`Đã đạt ${clamped.toFixed(0)}%`}
        />
    );
};

/* ------------------------------------ Thanh tỷ lệ nhỏ ------------------------------------ */

/** Thanh tỷ lệ một giá trị (antd Progress), vd tần suất mở lớp. */
export const RatioBar = ({ value, total }: { value: number; total: number }) => {
    const chart = useChartTheme();
    return (
        <Progress
            percent={total ? (value / total) * 100 : 0}
            showInfo={false}
            size="small"
            strokeColor={chart.seriesColor('done')}
            railColor={chart.seriesColor('remaining')}
            aria-label={`${value}/${total}`}
        />
    );
};

/* ------------------------------------ Thanh xếp chồng ------------------------------------ */

interface StackedBarProps {
    title: string;
    segments: Segment[];
    /** Thang của thanh; phần thiếu so với tổng hiện thành đoạn "Còn thiếu". */
    total?: number;
    /** Nhãn của đoạn còn thiếu (mặc định "Còn thiếu"). */
    remainingLabel?: string;
    unit?: string;
}

/** Một thanh ngang xếp chồng có chú thích và tooltip. */
export const StackedBar = ({ title, segments, total, remainingLabel, unit = 'TC' }: StackedBarProps) => {
    const chart = useChartTheme();
    const sum = segments.reduce((acc, segment) => acc + segment.value, 0);
    const rest = Math.max(0, (total ?? 0) - sum);
    const all = [...segments, ...(rest > 0 ? [{ key: 'remaining' as const, value: rest, label: remainingLabel }] : [])];
    const data = all.map(segment => ({ group: title, series: seriesName(segment), value: segment.value }));

    return (
        <Bar
            height={76}
            data={data}
            xField="group"
            yField="value"
            colorField="series"
            stack
            theme={chart.theme}
            scale={{ color: seriesScale(all, chart), y: { domain: [0, Math.max(total ?? 0, sum, 1)] } }}
            axis={false}
            style={{ maxWidth: 18, radius: 4, inset: 1 }}
            legend={{ color: { position: 'bottom', itemMarker: 'square' } }}
            tooltip={{
                title: 'group',
                items: [(datum: { series: string; value: number }) => ({ name: datum.series, value: `${datum.value} ${unit}` })],
            }}
        />
    );
};

/* ------------------------------------ Danh sách thanh theo hàng ------------------------------------ */

export interface BlockBarRow {
    key: string;
    label: string;
    /** Dòng phụ trong tooltip. */
    hint?: string;
    segments: Segment[];
    total: number;
    valueText: string;
}

interface BlockBarsProps {
    rows: BlockBarRow[];
    unit?: string;
    /**
     * true (mặc định): mỗi hàng tính theo tổng của chính nó (thanh tiến độ, phần thiếu tô xám).
     * false: so giá trị tuyệt đối giữa các hàng, không có phần thiếu.
     */
    normalize?: boolean;
    /** Bấm vào một thanh (nhận `key` của hàng). */
    onRowClick?: (key: string) => void;
}

/** Thanh ngang xếp chồng, mỗi hàng một mục; giá trị ghi ở cuối thanh. */
export const BlockBars = ({ rows, unit = 'TC', normalize = true, onRowClick }: BlockBarsProps) => {
    const chart = useChartTheme();
    const used: Segment[] = [];
    const data = rows.flatMap(row => {
        const sum = row.segments.reduce((acc, segment) => acc + segment.value, 0);
        const parts = normalize && row.total > sum ? [...row.segments, { key: 'remaining' as const, value: row.total - sum }] : row.segments;
        return parts.filter(segment => segment.value > 0).map(segment => {
            used.push(segment);
            return {
                rowKey: row.key,
                row: row.label,
                hint: row.hint,
                series: seriesName(segment),
                raw: segment.value,
                value: normalize ? (segment.value / (row.total || 1)) * 100 : segment.value,
            };
        });
    });
    const max = normalize ? 100 : Math.max(1, ...rows.map(row => row.segments.reduce((acc, segment) => acc + segment.value, 0)));

    return (
        <Bar
            height={Math.max(120, rows.length * 44 + 56)}
            data={data}
            xField="row"
            yField="value"
            colorField="series"
            stack
            theme={chart.theme}
            paddingRight={84}
            scale={{ color: seriesScale(used, chart), x: { domain: rows.map(row => row.label) }, y: { domain: [0, max] } }}
            axis={{
                x: { title: false, tick: false, line: false, labelFontSize: 12, labelAutoEllipsis: true },
                y: false,
            }}
            style={{ maxWidth: 16, radius: 4, inset: 1, cursor: onRowClick ? 'pointer' : 'default' }}
            legend={{ color: { position: 'bottom', itemMarker: 'square' } }}
            onReady={onRowClick ? ({ chart: instance }) => {
                instance.on('element:click', (event: { data?: { data?: { rowKey?: string } } }) => {
                    const key = event.data?.data?.rowKey;
                    if (key) onRowClick(key);
                });
            } : undefined}
            tooltip={{
                title: (datum: { row: string; hint?: string }) => (datum.hint ? `${datum.row} · ${datum.hint}` : datum.row),
                items: [(datum: { series: string; raw: number }) => ({ name: datum.series, value: `${datum.raw} ${unit}` })],
            }}
            annotations={[{
                type: 'text',
                data: rows.map(row => ({ row: row.label, value: max, text: row.valueText })),
                encode: { x: 'row', y: 'value', text: 'text' },
                style: { textAlign: 'left', textBaseline: 'middle', dx: 8, fontSize: 12, fill: chart.isDark ? '#c3c2b7' : '#52514e' },
                tooltip: false,
            }]}
        />
    );
};

/* ------------------------------------ Cột xếp chồng theo học kỳ ------------------------------------ */

export interface Column {
    key: string;
    label: string;
    sublabel?: string;
    segments: Segment[];
    /** Đánh dấu cột (vd học kỳ hiện tại); chữ này hiện dưới nhãn cột. */
    highlight?: string;
    /** Ghi chú thêm vào tooltip. */
    note?: string;
}

interface ColumnChartProps {
    columns: Column[];
    /** Đường tham chiếu ngang, vd mức tín chỉ tối thiểu/tối đa mỗi kỳ. */
    references?: { value: number; label: string }[];
    height?: number;
    unit?: string;
}

/** Biểu đồ cột xếp chồng, một trục tung. */
export const ColumnChart = ({ columns, references = [], height = 240, unit = 'TC' }: ColumnChartProps) => {
    const chart = useChartTheme();
    const used = columns.flatMap(column => column.segments.filter(segment => segment.value > 0));
    const axisLabel = (column: Column) => [column.label, column.sublabel, column.highlight ? `▲ ${column.highlight}` : null].filter(Boolean).join('\n');
    const data = columns.flatMap(column => {
        const total = column.segments.reduce((acc, segment) => acc + segment.value, 0);
        return column.segments.filter(segment => segment.value > 0).map(segment => ({
            x: axisLabel(column),
            title: `${column.label}${column.sublabel ? ` · ${column.sublabel}` : ''} — tổng ${total} ${unit}${column.note ? ` · ${column.note}` : ''}`,
            series: seriesName(segment),
            value: segment.value,
        }));
    });
    const textColor = chart.isDark ? '#c3c2b7' : '#52514e';

    return (
        <Column
            height={height}
            data={data}
            xField="x"
            yField="value"
            colorField="series"
            stack
            theme={chart.theme}
            scale={{ color: seriesScale(used, chart), x: { domain: columns.map(axisLabel) } }}
            axis={{
                x: { title: false, tick: false, labelFontSize: 11, labelAutoRotate: false, labelAutoHide: true },
                y: { title: false, tickCount: 4, labelFormatter: (value: number) => `${value}` },
            }}
            style={{ maxWidth: 32, radius: 4, inset: 1 }}
            legend={{ color: { position: 'bottom', itemMarker: 'square' } }}
            tooltip={{
                title: 'title',
                items: [(datum: { series: string; value: number }) => ({ name: datum.series, value: `${datum.value} ${unit}` })],
            }}
            annotations={references.map(reference => ({
                type: 'lineY',
                data: [reference.value],
                style: { stroke: textColor, strokeOpacity: 0.7, lineDash: [4, 4], lineWidth: 1 },
                label: { text: reference.label, position: 'right', textBaseline: 'bottom', fill: textColor, fontSize: 11, dy: -2 },
                tooltip: false,
            }))}
        />
    );
};

/* ------------------------------------ Vành khuyên 100% ------------------------------------ */

export interface PieRow {
    key: string;
    label: string;
    value: number;
}

/** Quá 8 phần thì gộp phần đuôi vào "Khác" thay vì lặp màu. */
const foldRows = (rows: PieRow[]): PieRow[] => (rows.length <= 8 ? rows : [
    ...rows.slice(0, 7),
    { key: '__rest', label: 'Khác', value: rows.slice(7).reduce((sum, row) => sum + row.value, 0) },
]);

/** Biểu đồ vành khuyên cho tỷ lệ cấu thành (vd cách tính điểm, tổng 100%). */
export const DonutChart = ({ rows, unit = '%', centerCaption }: { rows: PieRow[]; unit?: string; centerCaption: string }) => {
    const chart = useChartTheme();
    const data = foldRows(rows);
    const total = data.reduce((sum, row) => sum + row.value, 0);
    return (
        <Pie
            height={240}
            data={data}
            angleField="value"
            colorField="label"
            innerRadius={0.62}
            theme={chart.theme}
            scale={{ color: { range: chart.categorical } }}
            style={{ stroke: chart.surface, inset: 1, radius: 4 }}
            label={{ text: (row: PieRow) => `${row.value}${unit}`, position: 'outside', fontSize: 12 }}
            legend={{ color: { position: 'right', layout: { justifyContent: 'center' }, itemMarker: 'circle' } }}
            tooltip={{ title: 'label', items: [(row: PieRow) => ({ name: 'Tỷ lệ', value: `${row.value}${unit}` })] }}
            annotations={[{
                type: 'text',
                style: { text: `${total}${unit}\n${centerCaption}`, x: '50%', y: '50%', textAlign: 'center', fontSize: 16, fontWeight: 600, lineHeight: 20 },
                tooltip: false,
            }]}
        />
    );
};

/** Thanh xếp chồng theo bảng màu phân loại (dữ liệu không phải trạng thái), vd phân bổ số tiết. */
export const CategoryStackBar = ({ rows, unit, title }: { rows: PieRow[]; unit: string; title: string }) => {
    const chart = useChartTheme();
    const data = foldRows(rows).map(row => ({ ...row, group: title }));
    return (
        <Bar
            height={110}
            data={data}
            xField="group"
            yField="value"
            colorField="label"
            stack
            theme={chart.theme}
            scale={{ color: { range: chart.categorical } }}
            axis={false}
            style={{ maxWidth: 28, radius: 4, inset: 1 }}
            label={{ text: 'value', position: 'inside', fontSize: 12, fill: '#fff' }}
            legend={{ color: { position: 'bottom', itemMarker: 'circle' } }}
            tooltip={{ title: 'label', items: [(row: PieRow) => ({ name: title, value: `${row.value} ${unit}` })] }}
        />
    );
};
