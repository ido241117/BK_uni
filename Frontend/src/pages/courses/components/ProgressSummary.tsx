import type { ReactNode } from 'react';

/**
 * Khối số liệu tiến độ dùng chung cho trang Môn học và Phân tích học tập.
 * Mỗi chỉ số tách rõ nhãn / con số / đơn vị / ghi chú thành từng dòng, xếp trong lưới tự co giãn,
 * nên màn hình hẹp chỉ giảm số cột chứ không làm chữ dính nhau hay xuống dòng lộn xộn.
 */

interface ProgressHeroProps {
    percent: number;
    value: number;
    total: number;
    unit: string;
    label: string;
    caption?: ReactNode;
}

/** Con số chính: vòng phần trăm + "118 / 128 TC" + chú thích. */
export const ProgressHero = ({ percent, value, total, unit, label, caption }: ProgressHeroProps) => {
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, percent));
    return (
        <div className="progress-hero">
            <svg viewBox="0 0 100 100" className="progress-hero-ring" role="img" aria-label={`Đã đạt ${clamped.toFixed(0)}%`}>
                <circle cx="50" cy="50" r={radius} className="viz-ring-track" />
                <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    className="viz-ring-value"
                    strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
                    transform="rotate(-90 50 50)"
                />
                <text x="50" y="57" textAnchor="middle" className="viz-ring-text">{clamped.toFixed(0)}%</text>
            </svg>
            <div className="progress-hero-body">
                <div className="metric-label">{label}</div>
                <div className="progress-hero-value">
                    <span className="progress-hero-number">{value}</span>
                    <span className="progress-hero-total">/ {total} {unit}</span>
                </div>
                {caption && <div className="metric-note">{caption}</div>}
            </div>
        </div>
    );
};

export type MetricTone = 'done' | 'progress' | 'planned' | 'plan-status' | 'remaining' | 'danger' | 'neutral';

interface MetricTileProps {
    label: string;
    value: ReactNode;
    unit?: string;
    /** Dòng phụ nhỏ dưới con số (vd "6 kỳ", "chuẩn HK 262"). */
    note?: ReactNode;
    /** Màu vạch bên trái, khớp màu chuỗi trên thanh tiến độ. */
    tone?: MetricTone;
    /** Nhấn mạnh dòng phụ (vd trễ hạn). */
    noteTone?: 'danger';
}

export const MetricTile = ({ label, value, unit, note, tone = 'neutral', noteTone }: MetricTileProps) => (
    <div className="metric-tile" data-tone={tone}>
        <div className="metric-label">{label}</div>
        <div className="metric-value">
            <span className="metric-number">{value}</span>
            {unit && <span className="metric-unit">{unit}</span>}
        </div>
        {note && <div className="metric-note" data-tone={noteTone}>{note}</div>}
    </div>
);

/** Nhóm chỉ số có tiêu đề nhỏ, các ô tự xếp thành lưới. */
export const MetricGroup = ({ title, children }: { title?: string; children: ReactNode }) => (
    <section className="metric-group">
        {title && <h3 className="metric-group-title">{title}</h3>}
        <div className="metric-grid">{children}</div>
    </section>
);
