/**
 * Logo from ui-template/logo.html (`#logo-final`): a smiling page with mini schedule blocks, a pencil and a
 * customization gear, without a ring. The gear and one schedule block are the brand blue (--accent-brand). Uses
 * theme variables, so it follows dark mode. The favicon (index.html) is the simplified 24px variant. Swap the SVG
 * here to change the logo everywhere.
 */
export const BrandMark = ({ size = 40 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="16 12 64 64" fill="none" aria-hidden="true">
        <path d="M27 20h23l10 10v37a5.5 5.5 0 0 1-5.5 5.5H27a5.5 5.5 0 0 1-5.5-5.5V25.5A5.5 5.5 0 0 1 27 20z" fill="var(--bg-elevated)" stroke="var(--accent-sparkle)" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="M50 20v10h10" fill="var(--illus-fold)" stroke="var(--accent-sparkle)" strokeWidth="1.7" strokeLinejoin="round" />
        <circle cx="35.5" cy="39" r="2.2" fill="var(--ink-primary)" />
        <circle cx="47.5" cy="39" r="2.2" fill="var(--ink-primary)" />
        <ellipse cx="31.8" cy="43" rx="2.5" ry="1.35" fill="var(--accent-sparkle)" opacity="0.55" />
        <ellipse cx="51.2" cy="43" rx="2.5" ry="1.35" fill="var(--accent-sparkle)" opacity="0.55" />
        <path d="M38.8 44.8c1.5 1.6 4 1.6 5.5 0" stroke="var(--ink-primary)" strokeWidth="1.65" strokeLinecap="round" />
        <rect x="28.5" y="51.5" width="11.5" height="5" rx="1.8" fill="var(--accent-rose)" />
        <rect x="42.5" y="51.5" width="11.5" height="5" rx="1.8" fill="var(--accent-brand)" />
        <rect x="28.5" y="59.5" width="11.5" height="5" rx="1.8" fill="var(--illus-fold)" stroke="var(--accent-sparkle)" strokeWidth="1.2" />
        <rect x="42.5" y="59.5" width="11.5" height="5" rx="1.8" fill="var(--bg-elevated)" stroke="var(--accent-sparkle)" strokeWidth="1.2" strokeDasharray="2 1.8" />
        <g transform="translate(62 56) rotate(34)">
            <rect x="-3.2" y="-12" width="6.4" height="21" rx="1.8" fill="var(--bg-elevated)" stroke="var(--accent-rose)" strokeWidth="1.5" />
            <line x1="-3.2" y1="-7.5" x2="3.2" y2="-7.5" stroke="var(--accent-rose)" strokeWidth="1.25" />
            <path d="M-3.2 9l3.2 5.8L3.2 9" fill="var(--illus-fold)" stroke="var(--accent-rose)" strokeWidth="1.5" strokeLinejoin="round" />
        </g>
        <g transform="translate(65 25)">
            <path d="M-2.11 -6.89L-1.83 -9.42L1.83 -9.42L2.11 -6.89A7.20 7.20 0 0 1 3.38 -6.36L5.37 -7.96L7.96 -5.37L6.36 -3.38A7.20 7.20 0 0 1 6.89 -2.11L9.42 -1.83L9.42 1.83L6.89 2.11A7.20 7.20 0 0 1 6.36 3.38L7.96 5.37L5.37 7.96L3.38 6.36A7.20 7.20 0 0 1 2.11 6.89L1.83 9.42L-1.83 9.42L-2.11 6.89A7.20 7.20 0 0 1 -3.38 6.36L-5.37 7.96L-7.96 5.37L-6.36 3.38A7.20 7.20 0 0 1 -6.89 2.11L-9.42 1.83L-9.42 -1.83L-6.89 -2.11A7.20 7.20 0 0 1 -6.36 -3.38L-7.96 -5.37L-5.37 -7.96L-3.38 -6.36A7.20 7.20 0 0 1 -2.11 -6.89Z" fill="var(--bg-elevated)" stroke="var(--accent-brand)" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="0" cy="0" r="3" fill="var(--bg-blush)" stroke="var(--accent-brand)" strokeWidth="1.4" />
        </g>
    </svg>
);

export default BrandMark;
