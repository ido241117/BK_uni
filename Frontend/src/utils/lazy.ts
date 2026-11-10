import type { ComponentType } from 'react';
import { lazy as reactLazy } from 'react';

const CHUNK_RELOAD_KEY = 'bk-uni:last-chunk-reload';
const RELOAD_COOLDOWN_MS = 15_000;

const isChunkError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return /dynamically imported module|chunkloaderror|failed to fetch|importing a module script failed/i.test(message);
};

const reloadOnce = () => {
    if (typeof window === 'undefined') return;

    const lastReload = Number(window.localStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (Date.now() - lastReload < RELOAD_COOLDOWN_MS) return;

    window.localStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    const url = new URL(window.location.href);
    url.searchParams.set('t', String(Date.now()));
    window.location.replace(url.toString());
};

const importWithRetry = async <T>(importFn: () => Promise<T>, retries = 2, delay = 800): Promise<T> => {
    for (let attempt = 0; ; attempt += 1) {
        try {
            return await importFn();
        } catch (error) {
            if (attempt >= retries) throw error;
            await new Promise(resolve => window.setTimeout(resolve, delay));
        }
    }
};

/**
 * `React.lazy` + retry khi mạng chập chờn + tự reload một lần khi chunk cũ
 * không còn tồn tại sau khi deploy.
 */
export const lazy = <T extends ComponentType<Record<string, never>>>(importFn: () => Promise<{ default: T }>) =>
    reactLazy(() => importWithRetry(importFn).catch((error: unknown) => {
        if (isChunkError(error)) {
            reloadOnce();
            return new Promise<{ default: T }>(() => undefined);
        }
        throw error;
    }));
