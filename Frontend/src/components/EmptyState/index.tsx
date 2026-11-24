import type { ReactNode } from 'react';
import { NappingCloud, SadPage, ShyPage, SurprisedSearch } from './illustrations';

/** Which picture to show; the mapping follows UI-SPECIFICATION.md "Empty/Unavailable Pages". */
export type EmptyIllustration = 'blank' | 'offline' | 'error' | 'no-results';

const ILLUSTRATIONS = {
    blank: ShyPage,
    offline: NappingCloud,
    error: SadPage,
    'no-results': SurprisedSearch,
} satisfies Record<EmptyIllustration, unknown>;

export type EmptyStateSize = 'page' | 'panel' | 'compact';

interface EmptyStateProps {
    title: ReactNode;
    description?: ReactNode;
    /** Buttons or links, e.g. "Thử lại", "Xóa bộ lọc". */
    action?: ReactNode;
    /**
     * blank = empty / not started, offline = cannot reach the server,
     * error = load failed / not found, no-results = filter or search matched nothing.
     */
    illustration?: EmptyIllustration;
    /** page = whole page, panel = section or table (default), compact = inside a tight tab or pane. */
    size?: EmptyStateSize;
}

/** Shared empty / unavailable state for pages, panels, tabs and tables. */
export const EmptyState = ({ title, description, action, illustration = 'blank', size = 'panel' }: EmptyStateProps) => {
    const Illustration = ILLUSTRATIONS[illustration];

    return (
        <div className="empty-state" data-size={size} role="status">
            <Illustration className="empty-state-art" />
            <div className="empty-state-title">{title}</div>
            {description && <div className="empty-state-desc">{description}</div>}
            {action && <div className="empty-state-actions">{action}</div>}
        </div>
    );
};

export default EmptyState;
