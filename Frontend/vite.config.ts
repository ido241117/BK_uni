import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Tách vendor theo package để bundle không thành một chunk khổng lồ. */
const manualChunks = (id: string): string | undefined => {
    const normalized = id.replace(/\\/g, '/');
    const index = normalized.lastIndexOf('/node_modules/');
    if (index === -1) return undefined;

    const segments = normalized.slice(index + '/node_modules/'.length).split('/');
    const packageName = segments[0].startsWith('@') ? `${segments[0]}/${segments[1] ?? ''}` : segments[0];
    if (!packageName) return undefined;

    if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler') {
        return 'vendor-react';
    }
    if (packageName === 'react-router') return 'vendor-router';
    if (packageName === 'antd' || packageName.startsWith('@ant-design/') || packageName.startsWith('rc-') || packageName.startsWith('@rc-component/')) {
        return 'vendor-antd';
    }
    if (packageName === '@tanstack/react-query') return 'vendor-query';
    if (packageName === 'dayjs') return 'vendor-dayjs';
    if (packageName === 'zustand') return 'vendor-zustand';
    if (packageName === 'react-toastify') return 'vendor-toastify';
    if (packageName === 'react-icons') return 'vendor-icons';

    return undefined;
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), 'VITE_');

    return {
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
            },
        },
        build: {
            // antd là vendor lớn nhất; đã tách riêng nên nới ngưỡng cảnh báo.
            chunkSizeWarningLimit: 1100,
            rollupOptions: {
                output: {
                    manualChunks,
                },
            },
        },
        server: {
            port: 5173,
            proxy: {
                '/api': {
                    target: env.VITE_API_PROXY_TARGET || 'http://localhost:3210',
                    changeOrigin: true,
                },
            },
        },
    };
});
