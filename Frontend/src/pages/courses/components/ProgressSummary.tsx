import type { ReactNode } from 'react';
import { ProgressRing } from './charts';

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
    return (
        <div className="progress-hero">
            <ProgressRing percent={percent} />
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
