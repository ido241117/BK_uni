/** Logo mark (calendar + check, from ui-template/logo.txt). Temporary; swap the SVG here to change it everywhere. */
export const BrandMark = ({ size = 20 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="16" rx="3" stroke="var(--ink-primary)" strokeWidth="2" />
        <path d="M8 2.75V6.25M16 2.75V6.25M3.5 9.5H20.5" stroke="var(--ink-primary)" strokeWidth="2"
            strokeLinecap="round" />
        <path d="M8 14.5L10.75 17.25L16.25 12" stroke="var(--accent-teal)" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export default BrandMark;
