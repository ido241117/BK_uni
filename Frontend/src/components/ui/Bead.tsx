/*
 * Bead family from ui-template/semester-timeline.html (section B). A ring is a course (a bead with a hole);
 * its SHAPE carries the state, color only reinforces it, so it reads without color:
 *   none = faint dotted ring, not-started = empty ring, planned = dashed ring, in-progress = half filled,
 *   completed = filled with a pinhole, failed = ring with a slash, suggest = pink ring (Gợi ý lộ trình).
 * A solid 6px `Pip` is a flag on a row (unsaved, differs from the file), never a course state.
 */

export type BeadState = 'none' | 'not-started' | 'planned' | 'in-progress' | 'completed' | 'failed' | 'suggest';
export type BeadTone = 'rose' | 'warn' | 'err' | 'brand' | 'sparkle';

interface BeadProps {
    state: BeadState;
    /** Overrides the state's color (e.g. a suggested course with a warning). */
    tone?: BeadTone;
    /** Dashed ring regardless of state (e.g. a free-elective slot). */
    dashed?: boolean;
    /** Ring diameter in px (default 10). */
    size?: number;
}

export const Bead = ({ state, tone, dashed, size }: BeadProps) => (
    <span
        className="bd"
        data-s={state}
        data-tone={tone}
        data-dashed={dashed || undefined}
        style={size ? { width: size, height: size } : undefined}
        aria-hidden="true"
    />
);

/** Solid 6px flag dot: `warn` = unsaved, `err` = differs from the myBK file, `rose` = differs in So sánh. */
export const Pip = ({ tone = 'warn' }: { tone?: 'warn' | 'err' | 'rose' }) => (
    <span className="pip" data-tone={tone} aria-hidden="true" />
);

const SPARKLE_PATH = 'M12 1.5C12.7 8.2 15.8 11.3 22.5 12C15.8 12.7 12.7 15.8 12 22.5C11.3 15.8 8.2 12.7 1.5 12C8.2 11.3 11.3 8.2 12 1.5Z';

/**
 * Semester checkpoint on the timeline (sparkle = "something is coming"):
 * `next` = solid brand-blue sparkle, `future` = hollow sparkle, `grad` = solid rose sparkle with a glow.
 */
export const SparkleMark = ({ variant }: { variant: 'next' | 'future' | 'grad' }) => {
    const size = variant === 'grad' ? 22 : variant === 'next' ? 18 : 17;
    return (
        <svg className="spark-mark" data-variant={variant} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <path d={SPARKLE_PATH} />
        </svg>
    );
};
