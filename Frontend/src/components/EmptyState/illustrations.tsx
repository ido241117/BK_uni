import type { SVGProps } from 'react';

/*
 * Empty-state illustrations from ui-template/icon.html. Colors are CSS variables, so they follow the theme:
 * blush disc = --bg-blush, page = --bg-elevated, outline = --accent-sparkle, folded corner = --illus-fold,
 * face = --ink-primary, accent marks = --accent-rose.
 */
type Svg = SVGProps<SVGSVGElement>;

const base = { viewBox: '0 0 96 96', fill: 'none', 'aria-hidden': true } as const;
const stroke = { stroke: 'var(--accent-sparkle)', strokeWidth: 1.6, strokeLinejoin: 'round' } as const;

/** Empty / unstarted: shy page peeking over a horizon. */
export const ShyPage = (props: Svg) => (
    <svg {...base} {...props}>
        <circle cx="48" cy="48" r="32" fill="var(--bg-blush)" />
        <path d="M31 24h22l11 11v31H25V30a6 6 0 0 1 6-6z" fill="var(--bg-elevated)" {...stroke} />
        <path d="M53 24v11h11" fill="var(--illus-fold)" {...stroke} />
        <circle cx="38" cy="54" r="2.3" fill="var(--ink-primary)" />
        <circle cx="51" cy="54" r="2.3" fill="var(--ink-primary)" />
        <ellipse cx="33.5" cy="58" rx="3" ry="1.6" fill="var(--accent-sparkle)" opacity="0.55" />
        <ellipse cx="55.5" cy="58" rx="3" ry="1.6" fill="var(--accent-sparkle)" opacity="0.55" />
        <line x1="18" y1="66" x2="78" y2="66" stroke="var(--accent-sparkle)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
);

/** Connection failure: page napping on a cloud, zzz. */
export const NappingCloud = (props: Svg) => (
    <svg {...base} {...props}>
        <path d="M68 20h4.5l-4.5 4.5h4.5M74 14h5l-5 5h5" stroke="var(--accent-rose)" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round" />
        <path d="M31 16h22l11 11v34H25V22a6 6 0 0 1 6-6z" fill="var(--bg-elevated)" {...stroke} />
        <path d="M53 16v11h11" fill="var(--illus-fold)" {...stroke} />
        <path d="M35.5 41c1.4 1.8 4 1.8 5.4 0M48 41c1.4 1.8 4 1.8 5.4 0" stroke="var(--ink-primary)" strokeWidth="1.6"
            strokeLinecap="round" />
        <ellipse cx="32.5" cy="45" rx="2.8" ry="1.5" fill="var(--accent-sparkle)" opacity="0.5" />
        <ellipse cx="56.5" cy="45" rx="2.8" ry="1.5" fill="var(--accent-sparkle)" opacity="0.5" />
        <circle cx="44.8" cy="46.5" r="1.3" fill="var(--ink-primary)" />
        <path d="M21 76h54a8.5 8.5 0 0 0 1.3-16.9A11.5 11.5 0 0 0 55 55.5a10 10 0 0 0-18 2.6A8.8 8.8 0 0 0 21 76z"
            fill="var(--bg-blush)" {...stroke} />
    </svg>
);

/** Load failure / not found: sad page with a question mark. */
export const SadPage = (props: Svg) => (
    <svg {...base} {...props}>
        <path d="M24 18h25l11 11v45a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6V24a6 6 0 0 1 6-6z" fill="var(--bg-elevated)"
            {...stroke} />
        <path d="M49 18v11h11" fill="var(--illus-fold)" {...stroke} />
        <circle cx="32.5" cy="49" r="2.3" fill="var(--ink-primary)" />
        <circle cx="46.5" cy="49" r="2.3" fill="var(--ink-primary)" />
        <ellipse cx="28.5" cy="53.5" rx="2.8" ry="1.5" fill="var(--accent-sparkle)" opacity="0.5" />
        <ellipse cx="50.5" cy="53.5" rx="2.8" ry="1.5" fill="var(--accent-sparkle)" opacity="0.5" />
        <path d="M36 57.5c1.8-2.2 5.2-2.2 7 0" stroke="var(--ink-primary)" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M68 41c0-3 2.3-5 5.2-5 2.8 0 4.8 1.8 4.8 4.3 0 2-1.2 3.1-3.1 4.1-1.4.7-1.9 1.4-1.9 2.8"
            stroke="var(--accent-rose)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="73" cy="52" r="1.4" fill="var(--accent-rose)" />
    </svg>
);

/** No results: surprised page behind a magnifying glass. */
export const SurprisedSearch = (props: Svg) => (
    <svg {...base} {...props}>
        <path d="M38 18h25l11 11v45a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6V24a6 6 0 0 1 6-6z" fill="var(--bg-elevated)"
            {...stroke} />
        <path d="M63 18v11h11" fill="var(--illus-fold)" {...stroke} />
        <circle cx="47.5" cy="48" r="2.5" fill="var(--ink-primary)" />
        <circle cx="61.5" cy="48" r="2.5" fill="var(--ink-primary)" />
        <ellipse cx="43.5" cy="53" rx="2.8" ry="1.5" fill="var(--accent-sparkle)" opacity="0.5" />
        <ellipse cx="65.5" cy="53" rx="2.8" ry="1.5" fill="var(--accent-sparkle)" opacity="0.5" />
        <ellipse cx="54.5" cy="56" rx="2.2" ry="2.8" fill="var(--ink-primary)" />
        <circle cx="26" cy="48" r="10.5" fill="var(--bg-blush)" stroke="var(--accent-rose)" strokeWidth="1.8" />
        <path d="M21 44.5a6 6 0 0 1 6-2" stroke="var(--accent-sparkle)" strokeWidth="1.4" strokeLinecap="round" />
        <line x1="26" y1="58.5" x2="26" y2="73" stroke="var(--accent-rose)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
);

/** Loading: page with a minimal dash and two sparkles (icon.html "floating sparkle page"). Sparkles twinkle via CSS. */
export const SparklePage = (props: Svg) => (
    <svg {...base} {...props}>
        <circle cx="48" cy="50" r="31" fill="var(--bg-blush)" />
        <path d="M29 20h24l12 12v40a6 6 0 0 1-6 6H29a6 6 0 0 1-6-6V26a6 6 0 0 1 6-6z" fill="var(--bg-elevated)" {...stroke} />
        <path d="M53 20v12h12" {...stroke} />
        <line x1="36" y1="51" x2="52" y2="51" stroke="var(--accent-sparkle)" strokeWidth="1.8" strokeLinecap="round" />
        <path className="spark spark-main"
            d="M72 19c.4 3.4 2.4 5.4 5.8 5.8-3.4.4-5.4 2.4-5.8 5.8-.4-3.4-2.4-5.4-5.8-5.8 3.4-.4 5.4-2.4 5.8-5.8z"
            fill="var(--illus-fold)" stroke="var(--accent-sparkle)" strokeWidth="1.2" strokeLinejoin="round" />
        <path className="spark spark-small"
            d="M77 35c.2 1.7 1.2 2.7 2.9 2.9-1.7.2-2.7 1.2-2.9 2.9-.2-1.7-1.2-2.7-2.9-2.9 1.7-.2 2.7-1.2 2.9-2.9z"
            fill="var(--illus-fold)" />
    </svg>
);
