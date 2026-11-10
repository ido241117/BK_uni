import type { UserRole } from './authz';

export interface Account {
    id: string;
    email: string;
    role: UserRole;
}

export interface Credentials {
    email: string;
    password: string;
}
