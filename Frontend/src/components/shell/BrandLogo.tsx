import { Link } from 'react-router';
import { BRAND } from '@/config/brand';
import { BrandMark } from './BrandMark';

interface BrandLogoProps {
    /** Hide the wordmark (collapsed sidebar). */
    iconOnly?: boolean;
    to?: string;
}

/** Mark + wordmark; teal appears only on the wordmark's second part and the check (spec: --accent-teal). */
export const BrandLogo = ({ iconOnly = false, to = '/' }: BrandLogoProps) => (
    <Link to={to} className="bk-logo" aria-label={`${BRAND.name} - trang chủ`}>
        <span className="bk-icon-box"><BrandMark /></span>
        {!iconOnly && <span className="bk-title">{BRAND.wordmark[0]}<span>{BRAND.wordmark[1]}</span></span>}
    </Link>
);

export default BrandLogo;
