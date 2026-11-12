import { LuLogOut, LuMoon, LuSun } from 'react-icons/lu';
import { Link, useNavigate } from 'react-router';
import { IOutLinedBtn, IconBtn } from '@/components';
import { useAppTheme } from '@/contexts';
import { useAsyncAction, useCurrentUser } from '@/hooks';
import { useAuthStore } from '@/stores';
import { ROLE_LABEL } from '@/types';

interface AppHeaderProps {
    /** Mobile không có sidebar nên hiện logo trên topbar. */
    showBrand?: boolean;
}

export const AppHeader = ({ showBrand = false }: AppHeaderProps) => {
    const account = useCurrentUser();
    const navigate = useNavigate();
    const { isDark, toggleMode } = useAppTheme();
    const signOut = useAuthStore(state => state.signOut);

    const logout = useAsyncAction(() => signOut(), {
        onSuccess: () => navigate('/login', { replace: true }),
    });

    return (
        <header className="app-topbar">
            {showBrand && (
                <Link to="/" className="app-brand" aria-label="BK Uni - trang chủ">
                    <span className="app-brand-mark">bk</span>
                </Link>
            )}

            <div className="app-topbar-grow" />

            <IconBtn
                icon={isDark ? <LuSun /> : <LuMoon />}
                label={isDark ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
                onClick={toggleMode}
            />

            <div className="app-topbar-user">
                <strong title={account?.email}>{account?.email}</strong>
                <small>{account ? ROLE_LABEL[account.role] : ''}</small>
            </div>

            <IOutLinedBtn
                icon={<LuLogOut />}
                loading={logout.loading}
                onClick={() => void logout.run()}
            >
                Đăng xuất
            </IOutLinedBtn>
        </header>
    );
};

export default AppHeader;
