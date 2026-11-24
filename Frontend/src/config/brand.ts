/**
 * Product name and wordmark. Temporary: the name and logo may change at any time, so every place that shows
 * them reads from here (logo mark: `components/shell/BrandMark.tsx`). `index.html` cannot import this file;
 * its <title> and description mirror it by hand.
 */
export const BRAND = {
    name: 'BKPlan',
    /** Wordmark split: the second part is drawn in --accent-teal. */
    wordmark: ['BK', 'Plan'] as const,
} as const;
