import { queryMethod } from '@/config/query-method';
import type { AdvisorSession, AdvisorSessionDetail, AdvisorTurnResult, SendAdvisorMessagePayload } from '@/types';

/** Agent có thể gọi model nhiều vòng; cho phép chờ lâu hơn mặc định 30 giây. */
const AGENT_TIMEOUT_MS = 5 * 60_000;

export const listAdvisorSessions = () =>
    queryMethod.get<AdvisorSession[]>('/advisor/sessions');

export const getAdvisorSession = (id: string) =>
    queryMethod.get<AdvisorSessionDetail>(`/advisor/sessions/${id}`);

export const deleteAdvisorSession = (id: string) =>
    queryMethod.delete(`/advisor/sessions/${id}`);

export const sendAdvisorMessage = (payload: SendAdvisorMessagePayload) =>
    queryMethod.post<AdvisorTurnResult>('/advisor/messages', payload, { timeout: AGENT_TIMEOUT_MS });
