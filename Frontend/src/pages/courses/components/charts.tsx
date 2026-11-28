import { useMemo } from 'react';
import { Progress } from 'antd';
import { Bar, Pie } from '@ant-design/plots';
import { useAppTheme } from '@/contexts';

/*
 * Biểu đồ của trang chi tiết môn (tần suất mở lớp, đề cương), vẽ bằng @ant-design/plots (canvas) và antd Progress.
 * Canvas không đọc được biến CSS nên màu được truyền dạng hex; giá trị khớp token `--viz-*` trong styles/components.css.
 * Màu đã kiểm tra tách biệt cho người mù màu ở cả hai chế độ sáng/tối.
 */

const SERIES_COLOR = {
    done: { light: '#2a78d6', dark: '#3987e5' },
    remaining: { light: '#e8e8ea', dark: '#2a2f37' },
} as const;

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
            seriesColor: (key: keyof typeof SERIES_COLOR) => SERIES_COLOR[key][mode],
            surface: isDark ? '#141414' : '#ffffff',
        };
    }, [isDark]);
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
