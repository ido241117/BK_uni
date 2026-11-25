import type { ReactNode } from 'react';

/** Small uppercase label above a block, e.g. "Thông tin sinh viên" (template: `.info-panel h3`). */
export const SectionLabel = ({ children }: { children: ReactNode }) => (
    <h3 className="section-label">{children}</h3>
);

/** Label / value list separated by hairlines (template: `.row-list`). `wrap`: flows into as many columns as fit. */
export const RowList = ({ children, wrap = false }: { children: ReactNode; wrap?: boolean }) => (
    <div className="row-list" data-wrap={wrap || undefined}>{children}</div>
);

/** `chip`: value on a blush chip with a sparkle underline, for codes to double-check (template 2 `.meta-kv-row`). */
export const RowItem = ({ label, value, chip = false }: { label: ReactNode; value: ReactNode; chip?: boolean }) => (
    <div className="row-item">
        <span className="row-label">{label}</span>
        <span className="row-value" data-chip={chip}>{value}</span>
    </div>
);
