import { useEffect } from 'react';
import { Button, Result, Spin } from 'antd';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuthzStore, useAuthStore } from '@/stores';
import type { PermissionRequirement, UserRole } from '@/types';
import { homeForRole } from '@/utils/auth';

/** Khôi phục phiên từ cookie trước khi render bất kỳ route nào. */
export const SessionBoundary = () => {
    const status = useAuthStore(state => state.status);
    const error = useAuthStore(state => state.error);
    const restoreSession = useAuthStore(state => state.restoreSession);

    useEffect(() => {
        void restoreSession();
    }, [restoreSession]);

    if (status === 'loading') {
        return (
            <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
                <Spin size="large" description="Đang kiểm tra phiên đăng nhập" />
            </div>
        );
    }

    if (status === 'error') {
        return (
            <Result
                status="error"
                title="Không thể kiểm tra phiên đăng nhập"
                subTitle={error ?? 'Vui lòng thử lại.'}
                extra={<Button type="primary" onClick={() => void restoreSession()}>Thử lại</Button>}
            />
        );
    }

    return <Outlet />;
};

/** Chỉ cho khách: đã đăng nhập thì đẩy về trang chủ theo role. */
export const RequireGuest = () => {
    const account = useAuthStore(state => state.account);
    return account ? <Navigate to={homeForRole(account.role)} replace /> : <Outlet />;
};

export const RequireAuth = () => {
    const account = useAuthStore(state => state.account);
    const location = useLocation();

    if (!account) {
        return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    }

    return <Outlet />;
};

interface RequireAccessProps {
    roles?: UserRole[];
    permission?: PermissionRequirement;
}

/** Chặn theo role + quyền; hiển thị 403 thay vì âm thầm 404. */
export const RequireAccess = ({ roles, permission }: RequireAccessProps) => {
    const can = useAuthzStore(state => state.can);
    const is = useAuthzStore(state => state.is);
    const account = useAuthStore(state => state.account);
    const navigate = useNavigate();

    if (!is(roles) || !can(permission)) {
        return (
            <Result
                status="403"
                title="Bạn không có quyền truy cập"
                subTitle="Tài khoản hiện tại không được phép xem trang này."
                extra={(
                    <Button type="primary" onClick={() => navigate(account ? homeForRole(account.role) : '/login', { replace: true })}>
                        Về trang của tôi
                    </Button>
                )}
            />
        );
    }

    return <Outlet />;
};

/** Điều hướng trang chủ theo role. */
export const HomeRedirect = () => {
    const account = useAuthStore(state => state.account);
    return <Navigate to={account ? homeForRole(account.role) : '/login'} replace />;
};
