import type { AdvisorSession, AdvisorStep, SendAdvisorMessagePayload } from '@/types';
import { ApiError, isApiResultEnvelope, isUnauthorized } from '@/utils/error';
import { emitSessionExpired } from '@/utils/session-bus';
import { toastMessage } from '@/utils/toast';
import i18n from '@/i18n';

export interface AdvisorStreamHandlers {
    /** Phát đầu tiên: cuộc trò chuyện (mới tạo hoặc đang có) của lượt này. */
    onSession?: (session: AdvisorSession) => void;
    /** Mỗi bước ngay khi backend vừa lưu. */
    onStep?: (step: AdvisorStep) => void;
}

const BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

const fail = (message: string, status?: number): never => {
    const error = new ApiError(message, status);
    if (isUnauthorized(error)) emitSessionExpired();
    else toastMessage.error(message);
    throw error;
};

/** Đọc lỗi HTTP (trước khi stream mở) theo envelope `{ error, message }` của backend. */
const readHttpError = async (response: Response): Promise<never> => {
    let message = i18n.t('Đã xảy ra lỗi. Vui lòng thử lại.');
    try {
        const body: unknown = await response.json();
        if (isApiResultEnvelope(body) && typeof body.message === 'string' && body.message.trim()) message = body.message;
    } catch {
        // Body không phải JSON: dùng thông điệp mặc định.
    }
    return fail(message, response.status);
};

/**
 * Gửi tin nhắn qua `POST /advisor/messages/stream` (Server-Sent Events). Không dùng được `EventSource` vì cần
 * POST kèm snapshot, nên tự đọc stream bằng `fetch`. Trả về cuộc trò chuyện sau khi lượt kết thúc.
 */
export const streamAdvisorMessage = async (
    payload: SendAdvisorMessagePayload,
    handlers: AdvisorStreamHandlers = {},
    signal?: AbortSignal,
): Promise<AdvisorSession> => {
    let response: Response;
    try {
        response = await fetch(`${BASE_URL}/advisor/messages/stream`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
            body: JSON.stringify(payload),
            signal,
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        return fail(i18n.t('Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.'));
    }
    if (!response.ok || !response.body) return readHttpError(response);

    let session: AdvisorSession | null = null;
    let done = false;
    const handle = (event: string, data: string) => {
        const parsed: unknown = JSON.parse(data);
        if (event === 'session') {
            session = parsed as AdvisorSession;
            handlers.onSession?.(session);
        } else if (event === 'step') {
            handlers.onStep?.(parsed as AdvisorStep);
        } else if (event === 'done') {
            session = (parsed as { session: AdvisorSession }).session;
            done = true;
        } else if (event === 'error') {
            fail((parsed as { message?: string }).message || i18n.t('AI chưa trả lời được.'));
        }
    };

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
        const { value, done: ended } = await reader.read();
        if (ended) break;
        buffer += value.replace(/\r\n?/g, '\n');
        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf('\n\n');

            let event = 'message';
            const data: string[] = [];
            for (const line of block.split('\n')) {
                if (line.startsWith(':')) continue; // heartbeat
                if (line.startsWith('event:')) event = line.slice(6).trim();
                else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
            }
            if (data.length) handle(event, data.join('\n'));
        }
    }

    if (!done || !session) return fail(i18n.t('Kết nối bị ngắt trước khi AI trả lời xong. Hãy tải lại cuộc trò chuyện để xem kết quả.'));
    return session;
};
