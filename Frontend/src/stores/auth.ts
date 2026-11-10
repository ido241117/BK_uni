import { create } from 'zustand';
import { getCurrentAccount, login, logout } from '@/apis/auth';
import { resetQueryCache } from '@/config/query-client';
import useAuthzStore from '@/stores/authz';
import type { Account, Credentials } from '@/types';
import { getErrorMessage, isUnauthorized } from '@/utils/error';
import { setSessionExpiredHandler } from '@/utils/session-bus';
import { toastMessage } from '@/utils/toast';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

interface AuthState {
    status: AuthStatus;
    account: Account | null;
    error: string | null;
    restoreSession: () => Promise<void>;
    signIn: (credentials: Credentials) => Promise<Account>;
    signOut: () => Promise<void>;
    /** Xoá phiên phía client, không gọi API (dùng khi server đã báo 401). */
    reset: () => void;
}

let restoreRequest: Promise<void> | null = null;

const syncAuthz = (account: Account | null) => {
    useAuthzStore.getState().hydrate(account?.role ?? null);
};

export const useAuthStore = create<AuthState>((set, get) => ({
    status: 'loading',
    account: null,
    error: null,

    restoreSession: () => {
        if (restoreRequest) return restoreRequest;

        set({ status: 'loading', error: null });
        restoreRequest = getCurrentAccount()
            .then((account) => {
                syncAuthz(account);
                set({ status: 'authenticated', account, error: null });
            })
            .catch((error: unknown) => {
                if (isUnauthorized(error)) {
                    // Chưa đăng nhập là trạng thái bình thường, không phải lỗi.
                    set({ status: 'anonymous', account: null, error: null });
                } else {
                    // Mất mạng / server lỗi: hiển thị màn hình lỗi có nút thử lại.
                    set({ status: 'error', account: null, error: getErrorMessage(error) });
                }
                syncAuthz(null);
            })
            .finally(() => {
                restoreRequest = null;
            });

        return restoreRequest;
    },

    signIn: async (credentials) => {
        const account = await login(credentials);
        syncAuthz(account);
        set({ status: 'authenticated', account, error: null });
        return account;
    },

    signOut: async () => {
        try {
            await logout();
        } catch {
            // Đăng xuất phía server thất bại vẫn phải xoá phiên phía client.
        } finally {
            get().reset();
        }
    },

    reset: () => {
        resetQueryCache();
        syncAuthz(null);
        set({ status: 'anonymous', account: null, error: null });
    },
}));

setSessionExpiredHandler(() => {
    if (!useAuthStore.getState().account) return;

    useAuthStore.getState().reset();
    toastMessage.error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
});

export default useAuthStore;
