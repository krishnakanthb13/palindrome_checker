import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createApp } from '../server/app.js';
import { CacheStore } from '../server/lib/cache.js';

const silentLogger = { info() {}, warn() {}, error() {} };

let baseDir;
let dataDir;
let server;
let baseUrl;

function write(name, content) {
    const target = path.join(dataDir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
}

async function getJson(pathname) {
    const response = await fetch(`${baseUrl}${pathname}`);
    return { response, json: await response.json() };
}

async function postAnalysis(body) {
    const response = await fetch(`${baseUrl}/api/analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { response, json: await response.json() };
}

before(async () => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'palindrome-checker-'));
    dataDir = path.join(baseDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });

    write('words.txt', 'level racecar stop pots civic\n');
    write('empty.txt', 'hello world nothing here\n');

    // Norwegian text encoded as Windows-1252. Statistical detection used to
    // misread this as Windows-1251 and produce Cyrillic garbage.
    write(
        'norsk.txt',
        Buffer.from([
            0x64, 0xe5, 0x64, 0x20, 0x64, 0xf8, 0x64, 0x20,
            0x72, 0xe5, 0x72, 0x20, 0x72, 0xf8, 0x72, 0x0a,
        ]),
    );

    // Mac Roman "appliqué": 0x8E is a lowercase e-acute.
    write('macroman.txt', Buffer.from('appliqu\x8e', 'latin1'));

    write('binary.dat', Buffer.from([0x00, 0x01, 0x02, 0x03]));
    write('sibling.log', 'not listed');

    // A sibling directory whose name shares the `data` prefix. The old
    // startsWith() check allowed reading this.
    fs.mkdirSync(path.join(baseDir, 'data-evil'), { recursive: true });
    fs.writeFileSync(path.join(baseDir, 'data-evil', 'secret.txt'), 'SECRET-OUTSIDE-DATA');

    const app = createApp({ dataDir, serveStatic: false, logger: silentLogger });
    await new Promise((resolve) => {
        server = app.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) {
        await new Promise((resolve) => server.close(resolve));
    }
    fs.rmSync(baseDir, { recursive: true, force: true });
});

test('health endpoint reports the protocol versions', async () => {
    const { response, json } = await getJson('/api/health');
    assert.equal(response.status, 200);
    assert.equal(json.status, 'ok');
    assert.equal(json.version, '3.0');
    assert.equal(typeof json.analysisVersion, 'number');
    assert.equal(typeof json.cacheVersion, 'number');
    assert.ok(json.encodings.includes('windows-1252'));
});

test('files endpoint lists text files and hides logs, dotfiles, and cache', async () => {
    const { response, json } = await getJson('/api/files');
    assert.equal(response.status, 200);
    const names = json.files.map((file) => file.name);
    assert.ok(names.includes('words.txt'));
    assert.ok(names.includes('norsk.txt'));
    assert.ok(!names.includes('sibling.log'));
    assert.ok(!names.includes('.cache'));
    assert.ok(json.files.every((file) => typeof file.size === 'string'));
});

test('file endpoint decodes UTF-8 and reports the encoding', async () => {
    const { response, json } = await getJson('/api/file?path=words.txt');
    assert.equal(response.status, 200);
    assert.equal(json.encoding, 'utf-8');
    assert.match(json.content, /level/);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('file endpoint decodes legacy Windows-1252 instead of guessing', async () => {
    const { response, json } = await getJson('/api/file?path=norsk.txt');
    assert.equal(response.status, 200);
    assert.equal(json.encoding, 'windows-1252');
    assert.match(json.content, /dåd/);
    assert.match(json.content, /død/);
    assert.doesNotMatch(json.content, /[шШеЕ]/);
});

test('an explicit Mac Roman override decodes accented characters', async () => {
    const auto = await getJson('/api/file?path=macroman.txt');
    assert.equal(auto.json.encoding, 'windows-1252');
    assert.match(auto.json.content, /appliquŽ/);

    const mac = await getJson('/api/file?path=macroman.txt&encoding=macintosh');
    assert.equal(mac.response.status, 200);
    assert.equal(mac.json.encoding, 'macintosh');
    assert.match(mac.json.content, /appliqué/);
});

test('path traversal to a sibling directory is rejected', async () => {
    const { response, json } = await getJson('/api/file?path=../data-evil/secret.txt');
    assert.equal(response.status, 403);
    assert.equal(json.code, 'forbidden');
    assert.doesNotMatch(JSON.stringify(json), /SECRET-OUTSIDE-DATA/);
});

test('the data directory itself cannot be read', async () => {
    const { response } = await getJson('/api/file?path=.');
    assert.equal(response.status, 403);
});

test('missing, repeated, and non-string query parameters are rejected', async () => {
    assert.equal((await getJson('/api/file')).response.status, 400);
    assert.equal((await getJson('/api/file?path=')).response.status, 400);
    assert.equal((await getJson('/api/file?path=a&path=b')).response.status, 400);
    assert.equal((await getJson('/api/analysis')).response.status, 400);
});

test('binary files are rejected with 415', async () => {
    const { response, json } = await getJson('/api/file?path=binary.dat');
    assert.equal(response.status, 415);
    assert.equal(json.code, 'binary_file');
});

test('analysis is computed server-side and cached with a source fingerprint', async () => {
    const first = await postAnalysis({ source: 'words.txt' });
    assert.equal(first.response.status, 200);
    assert.equal(first.json.exists, true);
    assert.equal(first.json.cached, false);
    assert.deepEqual(
        first.json.palindromes.map((item) => item.word),
        ['civic', 'level', 'racecar'],
    );
    assert.deepEqual(first.json.levidromes, [{ a: 'stop', b: 'pots' }]);
    assert.equal(first.json.meta.encoding, 'utf-8');
    assert.match(first.json.meta.sha256, /^[a-f0-9]{64}$/);

    const cached = await postAnalysis({ source: 'words.txt' });
    assert.equal(cached.response.status, 200);
    assert.equal(cached.json.cached, true);
    assert.deepEqual(cached.json.palindromes, first.json.palindromes);
});

test('a fresh cache is returned by GET without recomputing', async () => {
    const { response, json } = await getJson('/api/analysis?source=words.txt');
    assert.equal(response.status, 200);
    assert.equal(json.exists, true);
    assert.equal(json.fresh, true);
    assert.equal(json.stale, false);
    assert.equal(json.meta.source, 'words.txt');
});

test('empty results are still a valid, fresh cache (no infinite recompute)', async () => {
    const computed = await postAnalysis({ source: 'empty.txt' });
    assert.equal(computed.response.status, 200);
    assert.deepEqual(computed.json.palindromes, []);
    assert.deepEqual(computed.json.levidromes, []);

    const { response, json } = await getJson('/api/analysis?source=empty.txt');
    assert.equal(response.status, 200);
    assert.equal(json.exists, true);
    assert.equal(json.fresh, true);
    assert.deepEqual(json.palindromes, []);
    assert.deepEqual(json.levidromes, []);
});

test('editing the source marks the cache stale and a forced POST refreshes it', async () => {
    await postAnalysis({ source: 'words.txt' });
    write('words.txt', 'level racecar stop pots civic kayak\n');

    const stale = await getJson('/api/analysis?source=words.txt');
    assert.equal(stale.response.status, 200);
    assert.equal(stale.json.exists, false);
    assert.equal(stale.json.stale, true);

    const refreshed = await postAnalysis({ source: 'words.txt', force: true });
    assert.equal(refreshed.response.status, 200);
    assert.equal(refreshed.json.cached, false);
    assert.ok(refreshed.json.palindromes.some((item) => item.word === 'kayak'));

    write('words.txt', 'level racecar stop pots civic\n');
});

test('Norwegian words survive the full analysis and cache round-trip', async () => {
    const computed = await postAnalysis({ source: 'norsk.txt' });
    assert.equal(computed.response.status, 200);
    assert.equal(computed.json.meta.encoding, 'windows-1252');

    const words = computed.json.palindromes.map((item) => item.word);
    assert.ok(words.includes('dåd'));
    assert.ok(words.includes('død'));
    assert.ok(words.includes('rår'));
    assert.ok(words.includes('rør'));
    assert.ok(!words.some((word) => /[шШеЕ]/.test(word)));

    const cached = await getJson('/api/analysis?source=norsk.txt');
    assert.equal(cached.json.exists, true);
    assert.deepEqual(cached.json.palindromes, computed.json.palindromes);
});

test('concurrent analysis requests serialize and leave a fresh cache', async () => {
    const [first, second] = await Promise.all([
        postAnalysis({ source: 'words.txt', force: true }),
        postAnalysis({ source: 'words.txt', force: true }),
    ]);

    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
    assert.deepEqual(first.json.palindromes, second.json.palindromes);
    assert.deepEqual(first.json.levidromes, second.json.levidromes);

    const fresh = await getJson('/api/analysis?source=words.txt');
    assert.equal(fresh.json.exists, true);
    assert.equal(fresh.json.fresh, true);
});

test('a corrupt cache is reported and can be rebuilt', async () => {
    const cachePath = new CacheStore(dataDir).pathFor('words.txt');
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, 'this is not json');

    const corrupt = await getJson('/api/analysis?source=words.txt');
    assert.equal(corrupt.response.status, 200);
    assert.equal(corrupt.json.exists, false);
    assert.equal(corrupt.json.corrupt, true);

    const rebuilt = await postAnalysis({ source: 'words.txt' });
    assert.equal(rebuilt.response.status, 200);
    assert.equal(rebuilt.json.cached, false);
    assert.ok(rebuilt.json.palindromes.length > 0);
});

test('analysis input is validated', async () => {
    assert.equal((await postAnalysis({})).response.status, 400);
    assert.equal((await postAnalysis({ source: 42 })).response.status, 400);
    assert.equal((await postAnalysis({ source: 'words.txt', force: 'yes' })).response.status, 400);
    assert.equal((await postAnalysis({ source: 'words.txt', encoding: 'not-real' })).response.status, 400);
    assert.equal((await postAnalysis({ source: '../data-evil/secret.txt' })).response.status, 403);
});

test('malformed JSON and oversized bodies return JSON errors', async () => {
    const malformed = await fetch(`${baseUrl}/api/analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).code, 'invalid_json');

    const oversized = await fetch(`${baseUrl}/api/analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'words.txt', padding: 'x'.repeat(70_000) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).code, 'payload_too_large');
});

test('unknown API routes and non-API routes return JSON 404s', async () => {
    const api = await getJson('/api/nope');
    assert.equal(api.response.status, 404);
    assert.equal(api.json.code, 'not_found');

    const root = await getJson('/nope');
    assert.equal(root.response.status, 404);
    assert.equal(root.json.code, 'not_found');
});
