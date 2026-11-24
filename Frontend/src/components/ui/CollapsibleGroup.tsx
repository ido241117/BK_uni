import { useId, useState, type ReactNode } from 'react';
import { PiCaretRight } from 'react-icons/pi';

interface CollapsibleGroupProps {
    title: ReactNode;
    /** Filled green dot when the group's requirement is met; hollow otherwise. Omit for no dot. */
    met?: boolean;
    /** Right side of the header, e.g. `<CreditLabel>` · `<TextTag>`. */
    meta?: ReactNode;
    defaultOpen?: boolean;
    children: ReactNode;
}

/** Expandable group with the chevron left of the title (template: `.course-group`). */
export const CollapsibleGroup = ({ title, met, meta, defaultOpen = true, children }: CollapsibleGroupProps) => {
    const [open, setOpen] = useState(defaultOpen);
    const bodyId = useId();

    return (
        <section className="course-group" data-open={open}>
            <button type="button" className="group-header" aria-expanded={open} aria-controls={bodyId}
                onClick={() => setOpen(value => !value)}>
                <span className="group-left">
                    <PiCaretRight className="chev" aria-hidden="true" />
                    {met !== undefined && <span className="group-dot" data-met={met} aria-hidden="true" />}
                    <h2>{title}</h2>
                </span>
                {meta && <span className="group-meta">{meta}</span>}
            </button>
            {open && <div className="group-body" id={bodyId}>{children}</div>}
        </section>
    );
};

/** "earned/required" credits; green when met (template: `.credit-label`). */
export const CreditLabel = ({ earned, required }: { earned: number; required: number }) => (
    <span className="credit-label" data-met={earned >= required}>{earned}/{required}</span>
);

/** Plain-text tag, no pill (template: `.tag-required` / `.tag-elective`). */
export const TextTag = ({ tone = 'muted', children }: { tone?: 'muted' | 'rose'; children: ReactNode }) => (
    <span className="text-tag" data-tone={tone}>{children}</span>
);

/** Middle dot between meta items. */
export const MetaSep = () => <span className="meta-sep" aria-hidden="true">·</span>;
