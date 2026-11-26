import type { ReactNode } from 'react';
import type { ChipTone } from './tones';

/**
 * Small code / category chip with a tonal wash: pale fill, edge and text in one tone, 4px radius.
 * For codes and kinds that must be told apart at a glance (learning outcome vs assessment, relation type,
 * group requirement). Plain category labels keep antd `Tag` (ring + text). Tones: see `ChipTone`.
 */
interface ToneChipProps {
    tone: ChipTone;
    children: ReactNode;
    /** Renders a button (e.g. jump to a course) instead of a static label. */
    onClick?: () => void;
    title?: string;
}

export const ToneChip = ({ tone, children, onClick, title }: ToneChipProps) => (onClick
    ? <button type="button" className="tone-chip" data-tone={tone} onClick={onClick} title={title}>{children}</button>
    : <span className="tone-chip" data-tone={tone} title={title}>{children}</span>);
