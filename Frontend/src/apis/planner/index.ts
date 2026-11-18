import { queryMethod } from '@/config/query-method';
import type { PlanResult, SolvePlanPayload } from '@/types';

/** Bộ giải có thể chạy tới vài chục giây (Clingo); chờ lâu hơn mặc định. */
const SOLVE_TIMEOUT_MS = 2 * 60_000;

export const solvePlan = (payload: SolvePlanPayload) =>
    queryMethod.post<PlanResult>('/plans/solve', payload, { timeout: SOLVE_TIMEOUT_MS });
