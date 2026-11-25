/**
 * Product name and wordmark. Temporary: the name and logo may change at any time, so every place that shows
 * them reads from here (logo mark: `components/shell/BrandMark.tsx`). `index.html` cannot import this file;
 * its <title> and description mirror it by hand.
 */
export const BRAND = {
    name: 'BKPath',
    /** Wordmark split: the second part is drawn in the brand accent (--accent-brand). */
    wordmark: ['BK', 'Path'] as const,
} as const;
