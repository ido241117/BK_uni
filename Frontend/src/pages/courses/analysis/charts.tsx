import { Tooltip } from 'antd';
import type { ReactNode } from 'react';

/** Ba trạng thái tiến độ dùng chung cho mọi biểu đồ; phần còn thiếu là nền xám (track). */
export const SERIES = {
    done: { label: 'Đã hoàn thành', className: 'viz-fill-done' },
    inProgress: { label: 'Đang học', className: 'viz-fill-progress' },
    planned: { label: 'Đã lên kế hoạch', className: 'viz-fill-planned' },
    /** Chỉ dùng ở lộ trình: môn hệ thống tự xếp thêm. */
    suggested: { label: 'Hệ thống đề xuất', className: 'viz-fill-suggested' },
    remaining: { label: 'Còn thiếu', className: 'viz-fill-track' },
} as const;

export type SeriesKey = keyof typeof SERIES;

export interface Segment {
    key: SeriesKey;
    value: number;
}

export const Legend = ({ keys }: { keys: SeriesKey[] }) => (
    <div className="viz-legend" role="list">
        {keys.map(key => (
            <span key={key} className="viz-legend-item" role="listitem">
                <span className={`viz-swatch ${SERIES[key].className}`} aria-hidden />
                {SERIES[key].label}
            </span>
        ))}
    </div>
);

const segmentTip = (title: ReactNode, segment: Segment, unit: string) => (
    <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div>{SERIES[segment.key].label}: {segment.value} {unit}</div>
    </div>
);

interface StackedBarProps {
    title: ReactNode;
    segments: Segment[];
    /** Thang của thanh; mặc định bằng tổng các đoạn. */
    total?: number;
    unit?: string;
    height?: number;
}

/** Thanh ngang xếp chồng: các đoạn có giá trị, phần còn lại là track. */
export const StackedBar = ({ title, segments, total, unit = 'TC', height = 14 }: StackedBarProps) => {
    const scale = Math.max(total ?? 0, segments.reduce((acc, segment) => acc + segment.value, 0), 1);
    const visible = segments.filter(segment => segment.value > 0);
    return (
        <div
            className="viz-hbar"
            style={{ height }}
            role="img"
            aria-label={`${typeof title === 'string' ? title : ''}: ${visible.map(segment => `${SERIES[segment.key].label} ${segment.value} ${unit}`).join(', ')}`}
        >
            {visible.map(segment => (
                <Tooltip key={segment.key} title={segmentTip(title, segment, unit)}>
                    <div
                        className={`viz-hbar-seg ${SERIES[segment.key].className}`}
                        style={{ width: `${(segment.value / scale) * 100}%` }}
                    />
                </Tooltip>
            ))}
        </div>
    );
};

export interface BlockBarRow {
    key: string;
    label: ReactNode;
    hint?: ReactNode;
    segments: Segment[];
    total: number;
    valueText: ReactNode;
}

/** Danh sách thanh tiến độ, mỗi dòng có nhãn trái và giá trị phải (nhãn trực tiếp, không cần đoán màu). */
export const BlockBars = ({ rows }: { rows: BlockBarRow[] }) => (
    <div className="viz-rows">
        {rows.map(row => (
            <div key={row.key} className="viz-row">
                <div className="viz-row-label">
                    <div className="viz-row-name">{row.label}</div>
                    {row.hint && <div className="hint">{row.hint}</div>}
                </div>
                <StackedBar title={row.label} segments={row.segments} total={row.total} />
                <div className="viz-row-value">{row.valueText}</div>
            </div>
        ))}
    </div>
);

export interface Column {
    key: string;
    label: string;
    sublabel?: string;
    segments: Segment[];
    /** Đánh dấu cột (ví dụ học kỳ hiện tại). */
    highlight?: boolean;
    tooltip?: ReactNode;
}

interface ColumnChartProps {
    columns: Column[];
    /** Đường tham chiếu ngang, ví dụ mức tín chỉ tối thiểu/tối đa mỗi kỳ. */
    references?: { value: number; label: string }[];
    height?: number;
    unit?: string;
}

/** Biểu đồ cột xếp chồng, một trục tung (tín chỉ). */
export const ColumnChart = ({ columns, references = [], height = 180, unit = 'TC' }: ColumnChartProps) => {
    const totals = columns.map(column => column.segments.reduce((acc, segment) => acc + segment.value, 0));
    const max = Math.max(1, ...totals, ...references.map(reference => reference.value));
    const niceMax = Math.ceil(max / 5) * 5;
    const ticks = [0, niceMax / 2, niceMax];

    return (
        <div className="viz-columns-wrap">
            <div className="viz-columns" style={{ height }}>
                <div className="viz-axis" aria-hidden>
                    {ticks.slice().reverse().map(tick => <span key={tick}>{tick}</span>)}
                </div>
                <div className="viz-plot">
                    {ticks.map(tick => (
                        <div key={tick} className="viz-grid" style={{ bottom: `${(tick / niceMax) * 100}%` }} />
                    ))}
                    {references.map(reference => (
                        <div key={reference.label} className="viz-ref" style={{ bottom: `${(reference.value / niceMax) * 100}%` }}>
                            <span>{reference.label}</span>
                        </div>
                    ))}
                    {columns.map((column, index) => (
                        <Tooltip
                            key={column.key}
                            title={(
                                <div>
                                    <div style={{ fontWeight: 600 }}>{column.label}{column.sublabel ? ` · ${column.sublabel}` : ''}</div>
                                    {column.segments.filter(segment => segment.value > 0).map(segment => (
                                        <div key={segment.key}>{SERIES[segment.key].label}: {segment.value} {unit}</div>
                                    ))}
                                    <div>Tổng: {totals[index]} {unit}</div>
                                    {column.tooltip}
                                </div>
                            )}
                        >
                            <div className={`viz-col${column.highlight ? ' is-highlight' : ''}`} tabIndex={0} aria-label={`${column.label}: ${totals[index]} ${unit}`}>
                                <div className="viz-col-stack" style={{ height: `${(totals[index] / niceMax) * 100}%` }}>
                                    {column.segments.filter(segment => segment.value > 0).map(segment => (
                                        <div
                                            key={segment.key}
                                            className={`viz-col-seg ${SERIES[segment.key].className}`}
                                            style={{ flexGrow: segment.value, flexBasis: 0 }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </Tooltip>
                    ))}
                </div>
            </div>
            <div className="viz-xlabels">
                <span className="viz-axis-spacer" />
                {columns.map(column => (
                    <span key={column.key} className={column.highlight ? 'is-highlight' : undefined}>
                        {column.label}
                        {column.sublabel && <small>{column.sublabel}</small>}
                    </span>
                ))}
            </div>
        </div>
    );
};

interface RingProps {
    percent: number;
    label: ReactNode;
    sublabel?: ReactNode;
}

/** Con số chính (hero) kèm vòng tiến độ: chỉ một giá trị nên không cần chú thích màu. */
export const ProgressRing = ({ percent, label, sublabel }: RingProps) => {
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, percent));
    return (
        <div className="viz-ring">
            <svg viewBox="0 0 100 100" width="112" height="112" role="img" aria-label={`${clamped.toFixed(0)}%`}>
                <circle cx="50" cy="50" r={radius} className="viz-ring-track" />
                <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="viz-ring-value"
                    strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
                    transform="rotate(-90 50 50)"
                />
                <text x="50" y="54" textAnchor="middle" className="viz-ring-text">{clamped.toFixed(0)}%</text>
            </svg>
            <div>
                <div className="viz-ring-label">{label}</div>
                {sublabel && <div className="hint">{sublabel}</div>}
            </div>
        </div>
    );
};
