import { httpError } from './http.js';

const ALIASES = new Map([
    ['auto', 'auto'],
    ['utf8', 'utf-8'],
    ['utf-8', 'utf-8'],
    ['utf16le', 'utf-16le'],
    ['utf-16le', 'utf-16le'],
    ['utf16be', 'utf-16be'],
    ['utf-16be', 'utf-16be'],
    ['latin1', 'windows-1252'],
    ['iso-8859-1', 'windows-1252'],
    ['iso8859-1', 'windows-1252'],
    ['cp1252', 'windows-1252'],
    ['windows-1252', 'windows-1252'],
    ['mac', 'macintosh'],
    ['macintosh', 'macintosh'],
    ['x-mac-roman', 'macintosh'],
    ['iso-8859-2', 'iso-8859-2'],
    ['iso8859-2', 'iso-8859-2'],
    ['cp1250', 'windows-1250'],
    ['windows-1250', 'windows-1250'],
    ['windows-1251', 'windows-1251'],
    ['cp1251', 'windows-1251'],
]);

export const SUPPORTED_ENCODINGS = [
    'auto',
    'utf-8',
    'windows-1252',
    'macintosh',
    'windows-1250',
    'iso-8859-2',
    'windows-1251',
    'utf-16le',
    'utf-16be',
];

export function normalizeEncoding(label) {
    if (label === undefined || label === null || label === '') return 'auto';
    if (typeof label !== 'string') {
        throw httpError(400, 'Encoding must be a string', 'invalid_encoding');
    }

    const normalized = ALIASES.get(label.trim().toLowerCase());
    if (!normalized) {
        throw httpError(
            400,
            `Unsupported encoding. Use one of: ${SUPPORTED_ENCODINGS.join(', ')}`,
            'invalid_encoding',
        );
    }
    return normalized;
}

export function hasUtf16Bom(buffer) {
    return (
        buffer.length >= 2 &&
        ((buffer[0] === 0xff && buffer[1] === 0xfe) ||
            (buffer[0] === 0xfe && buffer[1] === 0xff))
    );
}

export function looksBinary(buffer) {
    const limit = Math.min(buffer.length, 8192);
    for (let index = 0; index < limit; index++) {
        if (buffer[index] === 0) return true;
    }
    return false;
}

function decodeStrict(buffer, encoding, label) {
    try {
        return new TextDecoder(encoding, { fatal: true }).decode(buffer);
    } catch {
        throw httpError(
            400,
            `The file is not valid ${label} text. Choose a different encoding.`,
            'decode_failed',
        );
    }
}

// Windows-1252 maps 0x80-0x9F to punctuation/symbols. Decoding by hand keeps
// the result identical on every platform and Node version; TextDecoder's table
// has varied between runtimes in practice.
const WINDOWS_1252_HIGH = [
    '\u20AC', '\u0081', '\u201A', '\u0192', '\u201E', '\u2026', '\u2020', '\u2021',
    '\u02C6', '\u2030', '\u0160', '\u2039', '\u0152', '\u008D', '\u017D', '\u008F',
    '\u0090', '\u2018', '\u2019', '\u201C', '\u201D', '\u2022', '\u2013', '\u2014',
    '\u02DC', '\u2122', '\u0161', '\u203A', '\u0153', '\u009D', '\u017E', '\u0178',
];

function decodeWindows1252(buffer) {
    let text = '';
    for (let index = 0; index < buffer.length; index++) {
        const byte = buffer[index];
        text +=
            byte >= 0x80 && byte <= 0x9F
                ? WINDOWS_1252_HIGH[byte - 0x80]
                : String.fromCharCode(byte);
    }
    return text;
}

/**
 * Decode a source file.
 *
 * Auto detection uses BOM sniffing, then strict UTF-8, then Windows-1252.
 * It never uses statistical guessing, which previously corrupted Norwegian,
 * Italian, and Spanish data. Log/cache files are always UTF-8 JSON elsewhere.
 */
export function decodeBuffer(buffer, requestedEncoding) {
    const encoding = normalizeEncoding(requestedEncoding);

    if (encoding !== 'auto') {
        if (encoding === 'utf-16le' || encoding === 'utf-16be') {
            return {
                text: decodeStrict(buffer, encoding, encoding),
                encoding,
                bom: hasUtf16Bom(buffer),
            };
        }
        if (encoding === 'windows-1252') {
            return {
                text: decodeWindows1252(buffer),
                encoding,
                bom: false,
            };
        }
        return {
            text: decodeStrict(buffer, encoding, encoding),
            encoding,
            bom: false,
        };
    }

    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return {
            text: decodeStrict(buffer.subarray(3), 'utf-8', 'UTF-8'),
            encoding: 'utf-8',
            bom: true,
        };
    }

    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        return {
            text: decodeStrict(buffer.subarray(2), 'utf-16le', 'UTF-16LE'),
            encoding: 'utf-16le',
            bom: true,
        };
    }

    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        return {
            text: decodeStrict(buffer.subarray(2), 'utf-16be', 'UTF-16BE'),
            encoding: 'utf-16be',
            bom: true,
        };
    }

    try {
        return {
            text: new TextDecoder('utf-8', { fatal: true }).decode(buffer),
            encoding: 'utf-8',
            bom: false,
        };
    } catch {
        return {
            text: decodeWindows1252(buffer),
            encoding: 'windows-1252',
            bom: false,
        };
    }
}
