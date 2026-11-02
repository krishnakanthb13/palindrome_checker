/**
 * Shared palindrome / levidrome analysis.
 *
 * The Node server imports this module and the client consumes the structured
 * results through the API. Thin re-exports under client/src/utils keep the
 * historical client-side module names available.
 *
 * Policy:
 *  - A token is delimited by whitespace or commas.
 *  - Leading/trailing punctuation is ignored for comparison, but the original
 *    token is returned so the UI can locate it in the source text.
 *  - Comparison is case-insensitive and grapheme-aware.
 *  - Results are deduplicated case-insensitively. Palindromes include an
 *    occurrence count; levidromes are returned as structured { a, b } pairs.
 */

export const ANALYSIS_VERSION = 1;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

const ASCII_ONLY = /^[\x00-\x7F]*$/;
const ASCII_TRIM = /^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g;
const UNICODE_TRIM = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const TWO_ALPHANUMERIC = /[\p{L}\p{N}][\s\S]*[\p{L}\p{N}]/u;

// Grapheme segmentation is only required when the text contains combining
// marks, joiners, variation selectors, skin-tone modifiers, or flags.
const NEEDS_GRAPHEMES = /[\p{M}\u200D\uFE0F\u{1F3FB}-\u{1F3FF}\p{Regional_Indicator}]/u;

function graphemes(value) {
    return [...segmenter.segment(value)].map((part) => part.segment);
}

function stripOuterPunctuation(token) {
    return token.replace(ASCII_ONLY.test(token) ? ASCII_TRIM : UNICODE_TRIM, '');
}

function normalizeToken(token) {
    const stripped = stripOuterPunctuation(token);

    if (ASCII_ONLY.test(stripped)) {
        return stripped.toLowerCase();
    }

    // NFC is only needed when combining marks are present. Avoiding it for
    // ordinary accented words keeps large dictionaries fast.
    const normalized = NEEDS_GRAPHEMES.test(stripped)
        ? stripped.normalize('NFC')
        : stripped;

    return normalized.toLowerCase();
}

function isPalindromeCore(core) {
    if (ASCII_ONLY.test(core)) {
        for (let left = 0, right = core.length - 1; left < right; left++, right--) {
            if (core[left] !== core[right]) return false;
        }
        return true;
    }

    const units = NEEDS_GRAPHEMES.test(core) ? graphemes(core) : Array.from(core);
    for (let left = 0, right = units.length - 1; left < right; left++, right--) {
        if (units[left] !== units[right]) return false;
    }
    return true;
}

function reverseCore(core) {
    if (ASCII_ONLY.test(core)) {
        let reversed = '';
        for (let index = core.length - 1; index >= 0; index--) {
            reversed += core[index];
        }
        return reversed;
    }

    const units = NEEDS_GRAPHEMES.test(core) ? graphemes(core) : Array.from(core);
    return units.reverse().join('');
}

function comparePalindromes(a, b) {
    return (
        collator.compare(normalizeToken(a.word), normalizeToken(b.word)) ||
        collator.compare(a.word, b.word)
    );
}

function comparePairs(x, y) {
    return (
        collator.compare(normalizeToken(x.a), normalizeToken(y.a)) ||
        collator.compare(normalizeToken(x.b), normalizeToken(y.b))
    );
}

export function findPalindromes(text) {
    if (typeof text !== 'string' || !text) return [];

    const words = text.split(/[\s,]+/);
    const found = new Map();

    for (const token of words) {
        if (!token) continue;

        const core = normalizeToken(token);
        if (core.length < 2) continue;

        // Require at least two letters/numbers. This filters noise such as
        // "..." or "-=-" while still allowing internal punctuation ("a-b-a").
        if (!TWO_ALPHANUMERIC.test(core)) continue;
        if (!isPalindromeCore(core)) continue;

        const existing = found.get(core);
        if (existing) {
            existing.count += 1;
        } else {
            found.set(core, { word: token, count: 1 });
        }
    }

    return [...found.values()].sort(comparePalindromes);
}

export function findLevidromes(text) {
    if (typeof text !== 'string' || !text) return [];

    const words = text.split(/[\s,]+/);
    const originalByCore = new Map();

    for (const token of words) {
        if (!token) continue;

        const core = normalizeToken(token);
        if (core.length < 2) continue;
        if (!TWO_ALPHANUMERIC.test(core)) continue;

        if (!originalByCore.has(core)) {
            originalByCore.set(core, token);
        }
    }

    const pairs = new Map();

    for (const core of originalByCore.keys()) {
        const reversed = reverseCore(core);
        if (reversed === core || !originalByCore.has(reversed)) continue;

        // Deduplicate "stop <=> pots" and "pots <=> stop" without relying on
        // a printable separator that a word could contain.
        const pairKey = JSON.stringify([core, reversed].sort());
        if (pairs.has(pairKey)) continue;

        pairs.set(pairKey, {
            a: originalByCore.get(core),
            b: originalByCore.get(reversed),
        });
    }

    return [...pairs.values()].sort(comparePairs);
}
