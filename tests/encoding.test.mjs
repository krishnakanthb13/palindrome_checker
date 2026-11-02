import test from 'node:test';
import assert from 'node:assert/strict';

import {
    SUPPORTED_ENCODINGS,
    decodeBuffer,
    hasUtf16Bom,
    looksBinary,
    normalizeEncoding,
} from '../server/lib/encoding.js';
import { HttpError } from '../server/lib/http.js';

test('normalizeEncoding accepts aliases and rejects unknown labels', () => {
    assert.equal(normalizeEncoding(undefined), 'auto');
    assert.equal(normalizeEncoding(''), 'auto');
    assert.equal(normalizeEncoding('UTF8'), 'utf-8');
    assert.equal(normalizeEncoding('latin1'), 'windows-1252');
    assert.equal(normalizeEncoding('cp1250'), 'windows-1250');
    assert.equal(normalizeEncoding('x-mac-roman'), 'macintosh');
    assert.ok(SUPPORTED_ENCODINGS.includes('windows-1250'));
    assert.ok(SUPPORTED_ENCODINGS.includes('macintosh'));

    assert.throws(() => normalizeEncoding('klingon'), (error) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 400);
        return true;
    });
});

test('auto detection strips a UTF-8 BOM and keeps UTF-8 text', () => {
    const buffer = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('dåd død', 'utf8'),
    ]);
    const result = decodeBuffer(buffer, 'auto');

    assert.equal(result.encoding, 'utf-8');
    assert.equal(result.bom, true);
    assert.equal(result.text, 'dåd død');
});

test('auto detection falls back to Windows-1252 instead of guessing', () => {
    // 0xE5 and 0xF8 are not valid UTF-8 on their own.
    const buffer = Buffer.from([0x64, 0xe5, 0x64, 0x20, 0x64, 0xf8, 0x64]);
    const result = decodeBuffer(buffer, 'auto');

    assert.equal(result.encoding, 'windows-1252');
    assert.equal(result.text, 'dåd død');
});

test('Mac Roman can be selected explicitly', () => {
    // In Mac Roman, 0x8E is a lowercase e-acute.
    const buffer = Buffer.from('appliqu\x8e', 'latin1');
    const result = decodeBuffer(buffer, 'macintosh');

    assert.equal(result.encoding, 'macintosh');
    assert.equal(result.text, 'appliqué');
});

test('explicit UTF-8 rejects invalid bytes', () => {
    assert.throws(() => decodeBuffer(Buffer.from([0xe5]), 'utf-8'), (error) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 400);
        return true;
    });
});

test('UTF-16 LE and BE BOMs are detected', () => {
    const le = Buffer.from([0xff, 0xfe, 0x64, 0x00, 0xe5, 0x00]);
    const be = Buffer.from([0xfe, 0xff, 0x00, 0x64, 0x00, 0xe5]);

    assert.equal(decodeBuffer(le, 'auto').text, 'då');
    assert.equal(decodeBuffer(be, 'auto').text, 'då');
    assert.equal(hasUtf16Bom(le), true);
    assert.equal(hasUtf16Bom(be), true);
    assert.equal(hasUtf16Bom(Buffer.from('text')), false);
});

test('binary detection ignores UTF-16 text with a BOM', () => {
    const le = Buffer.from([0xff, 0xfe, 0x64, 0x00]);
    const binary = Buffer.from([0x64, 0x00, 0x65, 0x00]);

    assert.equal(looksBinary(le), true);
    assert.equal(hasUtf16Bom(le), true);
    assert.equal(looksBinary(binary), true);
    assert.equal(looksBinary(Buffer.from('plain text')), false);
});
