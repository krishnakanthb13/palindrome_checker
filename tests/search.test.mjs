import test from 'node:test';
import assert from 'node:assert/strict';

import { findOccurrence } from '../client/src/utils/search.js';

test('findOccurrence cycles through repeated tokens', () => {
    const content = 'level level level';

    assert.deepEqual(findOccurrence(content, 'level', 0), {
        index: 0,
        total: 3,
        occurrence: 0,
        length: 5,
    });
    assert.deepEqual(findOccurrence(content, 'level', 1), {
        index: 6,
        total: 3,
        occurrence: 1,
        length: 5,
    });
    assert.deepEqual(findOccurrence(content, 'level', 2), {
        index: 12,
        total: 3,
        occurrence: 2,
        length: 5,
    });
});

test('findOccurrence wraps around after the last occurrence', () => {
    const found = findOccurrence('level level', 'level', 2);
    assert.equal(found.index, 0);
    assert.equal(found.occurrence, 0);
    assert.equal(found.total, 2);
});

test('findOccurrence is case-insensitive', () => {
    const found = findOccurrence('Racecar racecar RACECAR', 'Racecar', 1);
    assert.equal(found.total, 3);
    assert.equal(found.index, 8);
    assert.equal(found.length, 7);
});

test('findOccurrence reaches punctuation-wrapped and plain forms', () => {
    const content = '(level) level #madam# madam';

    const first = findOccurrence(content, '(level)', 0);
    assert.equal(first.total, 2);
    assert.equal(first.index, 0);
    assert.equal(first.length, 7);

    const second = findOccurrence(content, '(level)', 1);
    assert.equal(second.index, 8);
    assert.equal(second.length, 5);

    const madam = findOccurrence(content, '#madam#', 1);
    assert.equal(madam.total, 2);
    assert.equal(madam.index, 22);
    assert.equal(madam.length, 5);
});

test('findOccurrence works when the plain form is encountered first', () => {
    for (const content of ['level (level)', 'level #level#']) {
        const first = findOccurrence(content, 'level', 0);
        const second = findOccurrence(content, 'level', 1);

        assert.equal(first.total, 2, content);
        assert.equal(first.index, 0, content);
        assert.equal(second.total, 2, content);
        assert.equal(second.index, 6, content);
        assert.equal(second.length, 7, content);
    }

    const trailing = findOccurrence('level... level', 'level', 1);
    assert.equal(trailing.total, 2);
    assert.equal(trailing.index, 9);
    assert.equal(trailing.length, 5);
});

test('findOccurrence respects token boundaries', () => {
    assert.equal(findOccurrence('level levels level', 'level', 1).index, 13);
    assert.equal(findOccurrence('level levelheaded level', 'level', 1).index, 18);
    assert.equal(findOccurrence('a-b-a a-b-a', 'a-b-a', 1).index, 6);
});

test('findOccurrence handles regex metacharacters and printable separators', () => {
    assert.equal(findOccurrence('a|b a|b', 'a|b', 1).index, 4);
    assert.equal(findOccurrence('a<=>b b>=<a', 'a<=>b', 0).index, 0);
});

test('findOccurrence handles astral-plane letters', () => {
    const word = '\u{20000}\u{20001}\u{20000}';
    const found = findOccurrence(`${word} ${word}`, word, 1);
    assert.equal(found.total, 2);
    assert.equal(found.index, word.length + 1);
    assert.equal(found.length, word.length);
});

test('findOccurrence reports no match cleanly', () => {
    assert.deepEqual(findOccurrence('level', 'racecar', 0), {
        index: -1,
        total: 0,
        occurrence: 0,
        length: 0,
    });
    assert.deepEqual(findOccurrence('', 'level', 0), {
        index: -1,
        total: 0,
        occurrence: 0,
        length: 0,
    });
});
