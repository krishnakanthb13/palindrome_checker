import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    ApiError,
    computeAnalysis,
    getAnalysis,
    getFile,
    getHealth,
    listFiles,
} from '../client/src/api.js';

const originalFetch = globalThis.fetch;

function mockFetch(handler) {
    const calls = [];
    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return handler(url, options);
    };
    return calls;
}

afterEach(() => {
    globalThis.fetch = originalFetch;
});

test('getFile URL-encodes paths and encodings', async () => {
    const calls = mockFetch(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ content: 'ok' }),
    }));

    await getFile('a b&c#d%e.txt', 'windows-1252');

    assert.equal(calls.length, 1);
    const url = calls[0].url;
    assert.match(url, /^\/api\/file\?/);
    assert.match(url, /path=a\+b%26c%23d%25e\.txt/);
    assert.match(url, /encoding=windows-1252/);
});

test('listFiles and getHealth hit the expected endpoints', async () => {
    const calls = mockFetch(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ files: [] }),
    }));

    await listFiles();
    await getHealth();

    assert.equal(calls[0].url, '/api/files');
    assert.equal(calls[1].url, '/api/health');
});

test('getAnalysis omits empty optional parameters', async () => {
    const calls = mockFetch(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ exists: false }),
    }));

    await getAnalysis('words.txt', undefined);

    assert.equal(calls[0].url, '/api/analysis?source=words.txt');
});

test('computeAnalysis sends a small JSON request, not computed content', async () => {
    const calls = mockFetch(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ exists: true }),
    }));

    await computeAnalysis('words.txt', 'utf-8', true);

    assert.equal(calls[0].url, '/api/analysis');
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
        source: 'words.txt',
        encoding: 'utf-8',
        force: true,
    });
});

test('non-2xx responses throw ApiError with the server message', async () => {
    mockFetch(async () => ({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: 'Access denied', code: 'forbidden' }),
    }));

    await assert.rejects(getFile('../data-evil/secret.txt'), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 403);
        assert.equal(error.message, 'Access denied');
        assert.equal(error.payload.code, 'forbidden');
        return true;
    });
});

test('non-JSON error bodies still throw a useful error', async () => {
    mockFetch(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
            throw new Error('not json');
        },
    }));

    await assert.rejects(listFiles(), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, 500);
        assert.match(error.message, /500/);
        return true;
    });
});
