import type { ReactNode } from 'react';
import { PiSparkleFill } from 'react-icons/pi';

interface KpiCountProps {
    value: ReactNode;
    /** Shown after the value in small sans, e.g. "/ 128 TC". */
    suffix?: ReactNode;
}

/** Big serif number (template: `.progress-block .count`). */
export const KpiCount = ({ value, suffix }: KpiCountProps) => (
    <div className="kpi-count">
        {value}
        {suffix && <small> {suffix}</small>}
    </div>
);

/** Thin progress line with a sparkle at the tip (template: `.progress-thread`). `percent` is clamped to 0-100. */
export const ProgressThread = ({ percent, label }: { percent: number; label?: string }) => {
    const width = Math.min(100, Math.max(0, percent));

    return (
        <div className="progress-thread" role="progressbar" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(width)} aria-label={label}>
            <div className="thread-track">
                <div className="thread-fill" style={{ width: `${width}%` }}>
                    <PiSparkleFill className="thread-sparkle" aria-hidden="true" />
                </div>
            </div>
        </div>
    );
};
