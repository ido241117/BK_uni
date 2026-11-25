import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ErrorBoundary } from './components';
import { queryClient } from './config/query-client';
import './i18n';
// Self-hosted fonts: each file is split by unicode-range (vietnamese / latin-ext / latin), so the browser fetches only
// the subsets a page uses, from our own origin (no third-party request, no flash of broken Vietnamese accents).
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource-variable/fraunces/opsz.css';
import './styles/index.css';

// Sau khi deploy, tab đang mở có thể trỏ tới chunk cũ đã bị xoá → tải lại một lần.
const CHUNK_RELOAD_KEY = 'bk-uni:last-chunk-reload';

window.addEventListener('vite:preloadError', () => {
    const lastReload = Number(window.localStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (Date.now() - lastReload < 15_000) return;

    window.localStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    window.location.reload();
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary>
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>
        </ErrorBoundary>
    </StrictMode>,
);
