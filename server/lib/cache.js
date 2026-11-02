import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CACHE_VERSION = 1;

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPalindromeEntry(value) {
    return (
        isPlainObject(value) &&
        typeof value.word === 'string' &&
        Number.isInteger(value.count) &&
        value.count > 0
    );
}

function isLevidromeEntry(value) {
    return (
        isPlainObject(value) &&
        typeof value.a === 'string' &&
        typeof value.b === 'string'
    );
}

export function validateCache(data) {
    if (!isPlainObject(data)) return false;
    if (data.cacheVersion !== CACHE_VERSION) return false;
    if (typeof data.analysisVersion !== 'number') return false;
    if (typeof data.source !== 'string') return false;
    if (typeof data.encoding !== 'string') return false;
    if (typeof data.sha256 !== 'string') return false;
    if (!Number.isFinite(data.size) || data.size < 0) return false;
    if (!Array.isArray(data.palindromes) || !data.palindromes.every(isPalindromeEntry)) {
        return false;
    }
    if (!Array.isArray(data.levidromes) || !data.levidromes.every(isLevidromeEntry)) {
        return false;
    }
    if (!isPlainObject(data.timing)) return false;

    return Object.values(data.timing).every(
        (value) => typeof value === 'number' || typeof value === 'string',
    );
}

export function isCacheFresh(data, fingerprint, analysisVersion) {
    return (
        validateCache(data) &&
        data.analysisVersion === analysisVersion &&
        data.source === fingerprint.source &&
        data.encoding === fingerprint.encoding &&
        data.sha256 === fingerprint.sha256
    );
}

export function fingerprintBuffer(buffer, source, encoding) {
    return {
        source,
        encoding,
        sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
        size: buffer.length,
    };
}

export class CacheStore {
    constructor(dataDir, { logger = console } = {}) {
        this.dataDir = path.resolve(dataDir);
        this.cacheDir = path.join(this.dataDir, '.cache');
        this.logger = logger;
        this.locks = new Map();
    }

    keyFor(source) {
        const normalized = source.split(path.sep).join('/');
        return crypto.createHash('sha256').update(normalized).digest('hex');
    }

    pathFor(source) {
        return path.join(this.cacheDir, `${this.keyFor(source)}.json`);
    }

    async read(source) {
        const filePath = this.pathFor(source);

        let raw;
        try {
            raw = await fs.promises.readFile(filePath, 'utf8');
        } catch (error) {
            if (error.code === 'ENOENT') return { data: null, corrupt: false };
            throw error;
        }

        try {
            const data = JSON.parse(raw);
            if (!validateCache(data)) {
                this.logger.warn(`[cache] Ignoring invalid cache: ${filePath}`);
                return { data: null, corrupt: true };
            }
            return { data, corrupt: false };
        } catch {
            this.logger.warn(`[cache] Ignoring malformed cache: ${filePath}`);
            return { data: null, corrupt: true };
        }
    }

    async write(source, data) {
        await fs.promises.mkdir(this.cacheDir, { recursive: true });

        const filePath = this.pathFor(source);
        const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
        const body = `${JSON.stringify(data, null, 2)}\n`;

        try {
            await fs.promises.writeFile(temporary, body, 'utf8');
            await fs.promises.rename(temporary, filePath);
        } catch (error) {
            await fs.promises.rm(temporary, { force: true }).catch(() => {});
            throw error;
        }
    }

    /**
     * Serialize work per source path. This prevents two requests from doing a
     * read-modify-write cycle on the same cache entry at the same time.
     */
    async withLock(source, work) {
        const key = this.keyFor(source);
        const previous = this.locks.get(key) ?? Promise.resolve();

        let release;
        const gate = new Promise((resolve) => {
            release = resolve;
        });
        const tail = previous.then(() => gate, () => gate);
        this.locks.set(key, tail);

        await previous.catch(() => {});

        try {
            return await work();
        } finally {
            release();
            if (this.locks.get(key) === tail) {
                this.locks.delete(key);
            }
        }
    }
}
