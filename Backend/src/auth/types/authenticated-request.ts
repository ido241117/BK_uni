import { Request } from 'express';
import { RequestUser } from '../strategies/jwt.strategy';

export type AuthenticatedRequest = Request & { user: RequestUser };
