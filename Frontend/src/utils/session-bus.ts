type SessionExpiredHandler = () => void;

let handler: SessionExpiredHandler | null = null;

/**
 * Cầu nối một chiều giữa tầng transport (axios) và tầng state (zustand).
 * Nhờ vậy `config/query-method` không phải import store, tránh import vòng.
 */
export const setSessionExpiredHandler = (nextHandler: SessionExpiredHandler | null) => {
    handler = nextHandler;
};

export const emitSessionExpired = () => {
    handler?.();
};
