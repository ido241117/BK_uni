import type { ReactNode } from 'react';
import { PiArrowsSplit, PiChartBar, PiCompass, PiPath } from 'react-icons/pi';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { BrandMark, LanguageMenu, ThemeToggle } from '@/components/shell';
import { BRAND } from '@/config/brand';
import { currentSemester, parseSemester } from '@/utils/semester';

const Feature = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
    <div className="feat-item"><span className="feat-icon" aria-hidden="true">{icon}</span><span>{children}</span></div>
);

/**
 * Split editorial layout for login / register (ui-template/dang-nhap.html): blush brand pane on the left
 * (hidden below 900px), white form canvas on the right.
 */
const AuthLayout = () => {
    const { t } = useTranslation();
    const year = parseSemester(currentSemester())?.year ?? new Date().getFullYear();

    return (
        <div className="login-shell">
            <aside className="brand-pane" aria-label={t('Giới thiệu {{name}}', { name: BRAND.name })}>
                <Link to="/" className="brand-lockup">
                    <span className="brand-mark"><BrandMark /></span>
                    <span className="brand-name">{BRAND.wordmark[0]}<span>{BRAND.wordmark[1]}</span></span>
                </Link>

                <div className="editorial-pitch">
                    <div className="eyebrow"><PiCompass aria-hidden="true" /> {t('Cổng hoạch định học tập')}</div>
                    <h2>{t('Thiết kế lộ trình tốt nghiệp theo nhịp độ của riêng bạn.')}</h2>
                    <p>{t('Theo dõi tín chỉ tích lũy, kiểm tra điều kiện tiên quyết và mô phỏng các kịch bản đăng ký môn học chỉ trong vài giây.')}</p>
                    <div className="feature-thread">
                        <Feature icon={<PiPath />}>{t('Tự động gợi ý lộ trình tối ưu số kỳ học và tải tín chỉ')}</Feature>
                        <Feature icon={<PiArrowsSplit />}>{t('Mô phỏng giả định What-If trước mỗi đợt đăng ký môn')}</Feature>
                        <Feature icon={<PiChartBar />}>{t('Đối chiếu trực quan tiến độ từng khối kiến thức')}</Feature>
                    </div>
                </div>

                <div className="pane-foot">
                    {t('Hệ thống hỗ trợ lập kế hoạch học tập; kết quả không thay thế xác nhận chính thức của nhà trường.')}
                    <br />
                    {t('Năm học {{from}}–{{to}}', { from: year, to: year + 1 })}
                </div>
            </aside>

            <main className="form-pane">
                <div className="top-utility"><ThemeToggle /><LanguageMenu /></div>
                <div className="form-box">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default AuthLayout;
