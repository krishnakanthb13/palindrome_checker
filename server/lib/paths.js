import fs from 'node:fs';
import path from 'node:path';

import { httpError } from './http.js';

const BINARY_EXTENSIONS = new Set([
    '.7z',
    '.avi',
    '.bmp',
    '.class',
    '.dll',
    '.doc',
    '.docx',
    '.exe',
    '.gz',
    '.gif',
    '.ico',
    '.jar',
    '.jpeg',
    '.jpg',
    '.mov',
    '.mp3',
    '.mp4',
    '.pdf',
    '.png',
    '.pyc',
    '.rar',
    '.so',
    '.tar',
    '.webp',
    '.wav',
    '.woff',
    '.woff2',
    '.xls',
    '.xlsx',
    '.zip',
]);

function assertInside(root, target) {
    const relative = path.relative(root, target);
    if (
        !relative ||
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
    ) {
        throw httpError(403, 'Access denied', 'forbidden');
    }
}

/**
 * Create a path resolver confined to `rootDir`.
 *
 * It rejects the root directory itself, `..` escapes, sibling directories with
 * a shared prefix (for example `data-evil`), dotfiles, NUL bytes, and symlinks
 * that resolve outside the root.
 */
export function createPathGuard(rootDir) {
    const root = path.resolve(rootDir);
    const realRoot = fs.realpathSync(root);

    return function safePath(requested) {
        if (typeof requested !== 'string' || requested.trim() === '') {
            throw httpError(400, 'A non-empty path is required', 'invalid_path');
        }
        if (requested.includes('\0')) {
            throw httpError(400, 'Invalid path', 'invalid_path');
        }

        const cleaned = requested.replace(/^[/\\]+/, '');
        if (!cleaned) {
            throw httpError(403, 'Access denied', 'forbidden');
        }

        const resolved = path.resolve(root, cleaned);
        assertInside(root, resolved);

        const relative = path.relative(root, resolved);
        const segments = relative.split(path.sep);
        if (segments.some((segment) => segment === '' || segment.startsWith('.'))) {
            throw httpError(403, 'Access denied', 'forbidden');
        }

        if (fs.existsSync(resolved)) {
            assertInside(realRoot, fs.realpathSync(resolved));
        }

        return resolved;
    };
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function listDataFiles(rootDir) {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (entry.name.startsWith('.')) continue;

        const extension = path.extname(entry.name).toLowerCase();
        if (extension === '.log') continue;
        if (BINARY_EXTENSIONS.has(extension)) continue;

        try {
            const stat = fs.statSync(path.join(rootDir, entry.name));
            if (!stat.isFile()) continue;
            files.push({
                name: entry.name,
                size: formatSize(stat.size),
                bytes: stat.size,
                mtimeMs: stat.mtimeMs,
            });
        } catch {
            // The file may have disappeared between readdir and stat. Skip it
            // rather than failing the whole listing.
        }
    }

    return files.sort((a, b) => a.name.localeCompare(b.name));
}
