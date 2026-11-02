import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const clientPort = Number(process.env.CLIENT_PORT || 8089);
const serverPort = Number(process.env.SERVER_PORT || 8088);
const apiTarget = process.env.VITE_API_TARGET || `http://127.0.0.1:${serverPort}`;
const rootDir = fileURLToPath(new URL('..', import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: clientPort,
        strictPort: true,
        fs: {
            allow: [rootDir],
        },
        proxy: {
            '/api': {
                target: apiTarget,
                changeOrigin: false,
                secure: false,
            },
        },
    },
    preview: {
        port: clientPort,
        strictPort: true,
        proxy: {
            '/api': {
                target: apiTarget,
                changeOrigin: false,
                secure: false,
            },
        },
    },
});
