import type { CourseRelationType } from '@/types';

/**
 * Tone of a ToneChip: rose = learning outcome / product accent, warn = assessment or soft condition,
 * err = hard condition, good = required / met, brand = elective / where you are going, muted = advisory.
 */
export type ChipTone = 'rose' | 'warn' | 'err' | 'good' | 'brand' | 'muted';

/** Relation type → tone, everywhere a relation is shown: prerequisite blocks (err), prior / co-requisite (warn). */
export const RELATION_TONE: Record<CourseRelationType, ChipTone> = {
    prerequisite: 'err',
    prior: 'warn',
    corequisite: 'warn',
    recommended: 'muted',
};
