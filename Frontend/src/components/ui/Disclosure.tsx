import { useId, type ReactNode } from 'react';
import { PiCaretDown } from 'react-icons/pi';

interface DisclosureProps {
    icon: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    /** Controlled: the panel usually has its own Save / Cancel, so the page owns the open state. */
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
}

/** Prominent disclosure row + panel below it (template: `.adjust-trigger` / `.adjust-panel`). */
export const Disclosure = ({ icon, title, subtitle, open, onOpenChange, children }: DisclosureProps) => {
    const panelId = useId();

    return (
        <>
            <button type="button" className="disclosure-trigger" aria-expanded={open} aria-controls={panelId}
                onClick={() => onOpenChange(!open)}>
                <span className="disclosure-text">
                    <span className="disclosure-icon" aria-hidden="true">{icon}</span>
                    <span>
                        <span className="disclosure-title">{title}</span>
                        {subtitle && <span className="disclosure-sub">{subtitle}</span>}
                    </span>
                </span>
                <PiCaretDown className="disclosure-chev" aria-hidden="true" />
            </button>
            {open && <div className="disclosure-panel" id={panelId}>{children}</div>}
        </>
    );
};
