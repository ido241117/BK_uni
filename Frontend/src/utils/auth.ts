import { ROLE } from '@/types';

export const HOME_ROUTE: Record<string, string> = {
    [ROLE.ADMIN]: '/admin/curricula',
    [ROLE.STUDENT]: '/courses',
};

export const homeForRole = (role: string): string => HOME_ROUTE[role] ?? '/login';
