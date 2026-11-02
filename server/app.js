import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import {
    ANALYSIS_VERSION,
    findLevidromes,
    findPalindromes,
} from '../shared/analysis.mjs';
import { SERVER_VERSION } from '../shared/version.mjs';
import { CACHE_VERSION, CacheStore, fingerprintBuffer, isCacheFresh } from './lib/cache.js';
import {
    SUPPORTED_ENCODINGS,
    decodeBuffer,
    hasUtf16Bom,
    looksBinary,
    normalizeEncoding,
} from './lib/encoding.js';
import { HttpError, httpError } from './lib/http.js';
import { createPathGuard, listDataFiles } from './lib/paths.js';

export { SERVER_VERSION };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../data');
const DEFAULT_CLIENT_DIST = path.resolve(__dirname, '../client/dist');

function requireString(value, name) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw httpError(400, `${name} is required`, 'invalid_request');
    }
    return value;
}

function optionalString(value) {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') {
        throw httpError(400, 'Query parameters must be strings', 'invalid_request');
    }
    return value;
}

function payload(data, extra = {}) {
    return {
        exists: true,
        fresh: true,
        stale: false,
        cached: false,
        palindromes: data.palindromes,
        levidromes: data.levidromes,
        timing: data.timing,
        meta: {
            source: data.source,
            encoding: data.encoding,
            size: data.size,
            mtimeMs: data.mtimeMs,
            sha256: data.sha256,
            createdAt: data.createdAt,
            analysisVersion: data.analysisVersion,
            cacheVersion: data.cacheVersion,
        },
        ...extra,
    };
}

function summary(data) {
    return {
        source: data.source,
        encoding: data.encoding,
        size: data.size,
        mtimeMs: data.mtimeMs,
        sha256: data.sha256,
        createdAt: data.createdAt,
        analysisVersion: data.analysisVersion,
        cacheVersion: data.cacheVersion,
    };
}

export function createApp({
    dataDir = DEFAULT_DATA_DIR,
    clientDist = DEFAULT_CLIENT_DIST,
    logger = console,
    serveStatic = true,
    maxFileBytes = Number(process.env.MAX_FILE_BYTES) || 64 * 1024 * 1024,
} = {}) {
    fs.mkdirSync(dataDir, { recursive: true });

    const rootDir = path.resolve(dataDir);
    const safePath = createPathGuard(rootDir);
    const cacheStore = new CacheStore(rootDir, { logger });

    if (!Number.isFinite(maxFileBytes) || maxFileBytes <= 0) {
        throw new Error('maxFileBytes must be a positive number');
    }

    const app = express();
    app.disable('x-powered-by');

    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        next();
    });

    // The client only sends a source path and a few flags, so a small limit is
    // plenty. Computed results are never accepted from the client.
    app.use(express.json({ limit: '64kb' }));

    function readSource(source, encodingParam) {
        const resolved = safePath(source);

        let stat;
        try {
            stat = fs.statSync(resolved);
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw httpError(404, 'File not found', 'not_found');
            }
            throw error;
        }

        if (!stat.isFile()) {
            throw httpError(404, 'File not found', 'not_found');
        }
        if (stat.size > maxFileBytes) {
            throw httpError(
                413,
                `File is too large (limit: ${Math.floor(maxFileBytes / (1024 * 1024))} MB)`,
                'file_too_large',
            );
        }

        const buffer = fs.readFileSync(resolved);
        const requested = normalizeEncoding(encodingParam);

        if (
            looksBinary(buffer) &&
            !hasUtf16Bom(buffer) &&
            requested !== 'utf-16le' &&
            requested !== 'utf-16be'
        ) {
            throw httpError(415, 'File appears to be binary', 'binary_file');
        }

        const decoded = decodeBuffer(buffer, requested);
        return {
            resolved,
            stat,
            buffer,
            text: decoded.text,
            encoding: decoded.encoding,
        };
    }

    app.get('/api/health', (req, res) => {
        res.json({
            status: 'ok',
            version: SERVER_VERSION,
            analysisVersion: ANALYSIS_VERSION,
            cacheVersion: CACHE_VERSION,
            encodings: SUPPORTED_ENCODINGS,
        });
    });

    app.get('/api/files', (req, res) => {
        res.json({ files: listDataFiles(rootDir) });
    });

    app.get('/api/file', (req, res) => {
        const source = requireString(optionalString(req.query.path), 'path');
        const encoding = optionalString(req.query.encoding);
        const sourceInfo = readSource(source, encoding);

        res.setHeader('Cache-Control', 'no-store');
        res.json({
            content: sourceInfo.text,
            encoding: sourceInfo.encoding,
            size: sourceInfo.stat.size,
            mtimeMs: sourceInfo.stat.mtimeMs,
        });
    });

    app.get('/api/analysis', async (req, res) => {
        const source = requireString(optionalString(req.query.source), 'source');
        const encoding = optionalString(req.query.encoding);

        // A cheap existence check runs before touching the cache or reading the
        // full file.
        const resolved = safePath(source);
        let stat;
        try {
            stat = fs.statSync(resolved);
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw httpError(404, 'File not found', 'not_found');
            }
            throw error;
        }
        if (!stat.isFile()) {
            throw httpError(404, 'File not found', 'not_found');
        }

        const { data, corrupt } = await cacheStore.read(source);
        if (!data) {
            res.setHeader('Cache-Control', 'no-store');
            return res.json({
                exists: false,
                fresh: false,
                stale: false,
                corrupt,
                supportedEncodings: SUPPORTED_ENCODINGS,
            });
        }

        const sourceInfo = readSource(source, encoding);
        const fingerprint = fingerprintBuffer(
            sourceInfo.buffer,
            source,
            sourceInfo.encoding,
        );

        if (!isCacheFresh(data, fingerprint, ANALYSIS_VERSION)) {
            res.setHeader('Cache-Control', 'no-store');
            return res.json({
                exists: false,
                fresh: false,
                stale: true,
                corrupt: false,
                reason: 'source-changed',
                meta: summary(data),
            });
        }

        res.setHeader('Cache-Control', 'no-store');
        return res.json(payload(data));
    });

    app.post('/api/analysis', async (req, res) => {
        const body = req.body;
        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
            throw httpError(400, 'A JSON object body is required', 'invalid_request');
        }

        const source = requireString(body.source, 'source');
        const encoding = optionalString(body.encoding);
        const force = body.force ?? false;

        if (typeof force !== 'boolean') {
            throw httpError(400, 'force must be a boolean', 'invalid_request');
        }

        const sourceInfo = readSource(source, encoding);
        const fingerprint = fingerprintBuffer(
            sourceInfo.buffer,
            source,
            sourceInfo.encoding,
        );

        const result = await cacheStore.withLock(source, async () => {
            const { data: existing } = await cacheStore.read(source);

            if (!force && existing && isCacheFresh(existing, fingerprint, ANALYSIS_VERSION)) {
                return { cached: true, data: existing };
            }

            const palindromeStart = performance.now();
            const palindromes = findPalindromes(sourceInfo.text);
            const palindromeMs = performance.now() - palindromeStart;

            const levidromeStart = performance.now();
            const levidromes = findLevidromes(sourceInfo.text);
            const levidromeMs = performance.now() - levidromeStart;

            const data = {
                cacheVersion: CACHE_VERSION,
                analysisVersion: ANALYSIS_VERSION,
                source,
                encoding: sourceInfo.encoding,
                size: sourceInfo.stat.size,
                mtimeMs: sourceInfo.stat.mtimeMs,
                sha256: fingerprint.sha256,
                createdAt: new Date().toISOString(),
                palindromes,
                levidromes,
                timing: {
                    palindrome: Number(palindromeMs.toFixed(2)),
                    levidrome: Number(levidromeMs.toFixed(2)),
                },
            };

            await cacheStore.write(source, data);
            logger.info(
                `[analysis] ${source} (${sourceInfo.encoding}, ${sourceInfo.stat.size} B): ` +
                    `${palindromes.length} palindromes in ${data.timing.palindrome}ms, ` +
                    `${levidromes.length} levidromes in ${data.timing.levidrome}ms`,
            );

            return { cached: false, data };
        });

        res.setHeader('Cache-Control', 'no-store');
        res.json(payload(result.data, { cached: result.cached }));
    });

    app.use('/api', (req, res) => {
        res.status(404).json({ error: 'Not found', code: 'not_found' });
    });

    const indexPath = path.join(clientDist, 'index.html');
    if (serveStatic && fs.existsSync(indexPath)) {
        app.use(express.static(clientDist, { index: false, maxAge: '1h' }));

        app.use((req, res, next) => {
            if (req.method !== 'GET' || path.extname(req.path)) return next();
            res.sendFile(indexPath);
        });
    }

    app.use((req, res) => {
        res.status(404).json({ error: 'Not found', code: 'not_found' });
    });

    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, next) => {
        if (res.headersSent) return;

        if (error instanceof HttpError) {
            return res.status(error.status).json({
                error: error.message,
                code: error.code ?? 'error',
            });
        }

        if (error.type === 'entity.parse.failed') {
            return res.status(400).json({
                error: 'Invalid JSON body',
                code: 'invalid_json',
            });
        }

        if (error.type === 'entity.too.large') {
            return res.status(413).json({
                error: 'Request body is too large',
                code: 'payload_too_large',
            });
        }

        logger.error('[server] Unhandled error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            code: 'internal_error',
        });
    });

    app.locals.dataDir = rootDir;
    app.locals.cacheDir = cacheStore.cacheDir;
    return app;
}
