import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp, SERVER_VERSION } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const port = Number(process.env.PORT || process.env.SERVER_PORT || 8088);
const host = process.env.HOST || '127.0.0.1';
const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.resolve(__dirname, '../data');

if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`[server] Invalid PORT: ${process.env.PORT ?? process.env.SERVER_PORT}`);
    process.exit(1);
}

const app = createApp({ dataDir });

const server = app.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;

    console.log('');
    console.log('========================================');
    console.log(`Palindrome Checker server ${SERVER_VERSION}`);
    console.log(`Listening on http://${host}:${actualPort}`);
    console.log(`Serving files from: ${dataDir}`);
    console.log(`Cache directory: ${app.locals.cacheDir}`);
    console.log('========================================');
    console.log('');
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(
            `[server] Port ${port} is already in use. Stop the other process or set PORT to a free port.`,
        );
    } else {
        console.error('[server] Failed to start:', error);
    }
    process.exit(1);
});

let shuttingDown = false;

function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n[server] ${signal} received, shutting down...`);

    const forceExit = setTimeout(() => {
        console.error('[server] Forced shutdown after timeout.');
        process.exit(1);
    }, 5000);
    forceExit.unref();

    server.close((error) => {
        clearTimeout(forceExit);
        if (error) {
            console.error('[server] Error during shutdown:', error);
            process.exit(1);
        }
        process.exit(0);
    });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
