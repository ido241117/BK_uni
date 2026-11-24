import { Dropdown, type MenuProps } from 'antd';
import { PiCaretDown, PiSignOut, PiUser } from 'react-icons/pi';
import { useNavigate } from 'react-router';
import { useAsyncAction, useCurrentUser, usePermission } from '@/hooks';
import { PAGE_RESOURCES, toPageViewPermission } from '@/config/access-control/page-resources';
import { useAuthStore } from '@/stores';
import { ROLE_LABEL } from '@/types';

/** Avatar + account text; the dropdown holds the profile link and logout (spec: one account menu). */
export const AccountMenu = () => {
    const account = useCurrentUser();
    const navigate = useNavigate();
    const signOut = useAuthStore(state => state.signOut);
    const canViewProfile = usePermission(toPageViewPermission(PAGE_RESOURCES.PROFILE));

    const logout = useAsyncAction(() => signOut(), {
        onSuccess: () => navigate('/login', { replace: true }),
    });

    if (!account) return null;

    // The account has no display name, only email + role.
    const items: MenuProps['items'] = [
        ...(canViewProfile ? [{ key: 'profile', icon: <PiUser />, label: 'Hồ sơ cá nhân' }, { type: 'divider' as const }] : []),
        { key: 'logout', icon: <PiSignOut />, label: 'Đăng xuất', disabled: logout.loading },
    ];

    const onClick: MenuProps['onClick'] = ({ key }) => {
        if (key === 'profile') navigate('/profile');
        if (key === 'logout') void logout.run();
    };

    return (
        <Dropdown menu={{ items, onClick }} trigger={['click']} placement="bottomRight">
            <button type="button" className="account-cluster" aria-label="Tài khoản">
                <span className="avatar" aria-hidden="true">{account.email.slice(0, 2)}</span>
                <span className="account-text">
                    <div className="name" title={account.email}>{account.email}</div>
                    <div className="email">{ROLE_LABEL[account.role]}</div>
                </span>
                <PiCaretDown className="caret" aria-hidden="true" />
            </button>
        </Dropdown>
    );
};

export default AccountMenu;
