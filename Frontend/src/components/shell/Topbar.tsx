import { Fragment, type ReactNode } from 'react';
import { PiCalendar, PiCaretRight } from 'react-icons/pi';
import { useTranslation } from 'react-i18next';
import { semesterLabel } from '@/utils/semester';

interface TopbarProps {
    /** Left side, normally `<Breadcrumb>`. */
    start?: ReactNode;
    /** Right side actions, left to right. */
    children?: ReactNode;
}

/** Sticky app topbar: stays visible while the workspace scrolls. */
export const Topbar = ({ start, children }: TopbarProps) => (
    <header className="topbar">
        <div className="topbar-start">{start}</div>
        <div className="top-actions">{children}</div>
    </header>
);

/** "Group > Page" trail; the last item is the current page. */
export const Breadcrumb = ({ items }: { items: string[] }) => (
    <nav className="breadcrumb" aria-label="Breadcrumb">
        {items.map((item, index) => {
            const last = index === items.length - 1;
            return (
                <Fragment key={`${index}-${item}`}>
                    {index > 0 && <PiCaretRight aria-hidden="true" />}
                    <span className={last ? 'curr' : undefined} aria-current={last ? 'page' : undefined}>{item}</span>
                </Fragment>
            );
        })}
    </nav>
);

/** System semester from the calendar (not the student's own setting in "Hiệu chỉnh"). */
export const SemesterBadge = ({ code }: { code: string }) => {
    const { t } = useTranslation();
    return (
        <div className="sem-badge" title={semesterLabel(code)}>
            <PiCalendar aria-hidden="true" />
            <span className="sem-badge-label">{t('Học kỳ hiện tại:')}</span>
            <strong>{t('HK {{code}}', { code })}</strong>
        </div>
    );
};
