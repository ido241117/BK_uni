import { queryMethod } from '@/config/query-method';
import type { AdvisorSession, AdvisorSessionDetail } from '@/types';

export const listAdvisorSessions = () =>
    queryMethod.get<AdvisorSession[]>('/advisor/sessions');

export const getAdvisorSession = (id: string) =>
    queryMethod.get<AdvisorSessionDetail>(`/advisor/sessions/${id}`);

export const deleteAdvisorSession = (id: string) =>
    queryMethod.delete(`/advisor/sessions/${id}`);

export { streamAdvisorMessage, type AdvisorStreamHandlers } from './stream';
