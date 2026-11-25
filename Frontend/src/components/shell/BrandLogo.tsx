import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BRAND } from '@/config/brand';
import { BrandMark } from './BrandMark';

interface BrandLogoProps {
    /** Hide the wordmark (collapsed sidebar). */
    iconOnly?: boolean;
    to?: string;
}

/** Badge + wordmark; the brand blue appears on the wordmark's second part and one schedule block of the badge (--accent-brand). */
export const BrandLogo = ({ iconOnly = false, to = '/' }: BrandLogoProps) => {
    const { t } = useTranslation();
    return (
        <Link to={to} className="bk-logo" aria-label={t('{{name}} - trang chủ', { name: BRAND.name })}>
            <span className="bk-icon-box"><BrandMark /></span>
            {!iconOnly && <span className="bk-title">{BRAND.wordmark[0]}<span>{BRAND.wordmark[1]}</span></span>}
        </Link>
    );
};

export default BrandLogo;
