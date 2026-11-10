import { create } from 'zustand';
import { getPermissionsForRole, hasPermissionAccess, hasRoleAccess } from '@/config/access-control';
import type { PermissionMap, PermissionRequirement, UserRole } from '@/types';

interface AuthzState {
    role: UserRole | null;
    permissions: PermissionMap;
    /** Nạp quyền cho role hiện tại (gọi khi đăng nhập / khôi phục phiên). */
    hydrate: (role: UserRole | null) => void;
    clear: () => void;
    /** Người dùng hiện tại có quyền này không. */
    can: (requirement?: PermissionRequirement) => boolean;
    /** Người dùng hiện tại có thuộc một trong các role này không. */
    is: (roles?: UserRole[]) => boolean;
}

export const useAuthzStore = create<AuthzState>((set, get) => ({
    role: null,
    permissions: {},

    hydrate: (role) => {
        set({ role, permissions: getPermissionsForRole(role) });
    },

    clear: () => {
        set({ role: null, permissions: {} });
    },

    can: (requirement) => {
        const { role, permissions } = get();
        return hasPermissionAccess(role, permissions, requirement);
    },

    is: (roles) => hasRoleAccess(get().role, roles),
}));

export default useAuthzStore;
