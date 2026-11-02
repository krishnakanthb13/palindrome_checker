import test from 'node:test';
import assert from 'node:assert/strict';

import { findPalindromes } from '../client/src/utils/palindrome.js';
import { findLevidromes } from '../client/src/utils/levidrome.js';

test('findPalindromes: detects and sorts basic words', () => {
    assert.deepEqual(findPalindromes('racecar level'), [
        { word: 'level', count: 1 },
        { word: 'racecar', count: 1 },
    ]);
});

test('findPalindromes: ignores non-strings, empty text, single chars, and noise', () => {
    assert.deepEqual(findPalindromes(''), []);
    assert.deepEqual(findPalindromes(null), []);
    assert.deepEqual(findPalindromes(undefined), []);
    assert.deepEqual(findPalindromes('a b 1 ... -=-'), []);
});

test('findPalindromes: detects numbers', () => {
    assert.deepEqual(findPalindromes('12321 12 121'), [
        { word: '121', count: 1 },
        { word: '12321', count: 1 },
    ]);
});

test('findPalindromes: deduplicates case-insensitively and counts occurrences', () => {
    assert.deepEqual(findPalindromes('Racecar racecar RACECAR'), [
        { word: 'Racecar', count: 3 },
    ]);
});

test('findPalindromes: ignores surrounding punctuation', () => {
    assert.deepEqual(findPalindromes('(level) level. #madam#'), [
        { word: '(level)', count: 2 },
        { word: '#madam#', count: 1 },
    ]);
});

test('findPalindromes: keeps internal symbols significant', () => {
    assert.deepEqual(findPalindromes('a-b-a'), [{ word: 'a-b-a', count: 1 }]);
});

test('findPalindromes: supports astral-plane letters', () => {
    assert.deepEqual(findPalindromes('\u{20000}\u{20001}\u{20000}'), [
        { word: '\u{20000}\u{20001}\u{20000}', count: 1 },
    ]);
});

test('findPalindromes: uses graphemes for combining marks', () => {
    // "a" + combining acute + "a" normalizes to "\u00e1a", which is not a palindrome.
    assert.deepEqual(findPalindromes('a\u0301a'), []);
});

test('findPalindromes: filters emoji-only tokens', () => {
    assert.deepEqual(findPalindromes('\u{1F600}a\u{1F600}'), []);
});

test('findLevidromes: detects and deduplicates a reverse pair', () => {
    assert.deepEqual(findLevidromes('stop pots pots stop'), [
        { a: 'stop', b: 'pots' },
    ]);
});

test('findLevidromes: preserves encounter order for the pair', () => {
    assert.deepEqual(findLevidromes('pots stop'), [{ a: 'pots', b: 'stop' }]);
});

test('findLevidromes: preserves original casing', () => {
    assert.deepEqual(findLevidromes('Stop pots'), [{ a: 'Stop', b: 'pots' }]);
});

test('findLevidromes: excludes one-sided words and palindromes', () => {
    assert.deepEqual(findLevidromes('stop level'), []);
    assert.deepEqual(findLevidromes('level'), []);
    assert.deepEqual(findLevidromes(''), []);
    assert.deepEqual(findLevidromes(null), []);
});

test('findLevidromes: ignores surrounding punctuation when matching', () => {
    assert.deepEqual(findLevidromes('(stop) pots'), [{ a: '(stop)', b: 'pots' }]);
});

test('findLevidromes: supports astral-plane letters', () => {
    assert.deepEqual(findLevidromes('\u{20000}\u{20001} \u{20001}\u{20000}'), [
        { a: '\u{20000}\u{20001}', b: '\u{20001}\u{20000}' },
    ]);
});

test('findLevidromes: handles tokens containing printable separators', () => {
    assert.deepEqual(findLevidromes('a|b b|a'), [{ a: 'a|b', b: 'b|a' }]);
    assert.deepEqual(findLevidromes('a<=>b b>=<a'), [{ a: 'a<=>b', b: 'b>=<a' }]);
});
