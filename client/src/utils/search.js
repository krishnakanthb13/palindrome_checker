function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripOuterPunctuation(token) {
    return token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function tokenBounds(content, index, length) {
    let start = index;
    let end = index + length;

    while (start > 0 && !/[\s,]/.test(content[start - 1])) start -= 1;
    while (end < content.length && !/[\s,]/.test(content[end])) end += 1;

    return { start, end };
}

function addMatch(matches, seen, content, index, termLength) {
    const { start, end } = tokenBounds(content, index, termLength);
    if (seen.has(start)) return;

    seen.add(start);
    matches.push({ index: start, length: end - start });
}

/**
 * Find the requested occurrence of a token in the source text.
 *
 * Matching is case-insensitive and respects whitespace/comma token boundaries.
 * It also searches the punctuation-stripped core inside each token, so a result
 * such as "level" can reach both "level" and "(level)", and vice versa. The
 * token's stripped core is compared before accepting a match, so "level" does
 * not match "levelheaded".
 */
export function findOccurrence(content, word, requested = 0) {
    if (!content || !word) {
        return { index: -1, total: 0, occurrence: 0, length: 0 };
    }

    const core = stripOuterPunctuation(word);
    const terms = new Set([word]);
    if (core && core !== word) terms.add(core);

    const seen = new Set();
    const matches = [];

    // Exact token forms (including the original punctuation and case).
    for (const term of terms) {
        if (!term) continue;

        let regex;
        try {
            regex = new RegExp(
                `(?:^|[\\s\\r\\n,])(${escapeRegExp(term)})(?=$|[\\s\\r\\n,])`,
                'gi',
            );
        } catch {
            continue;
        }

        let match;
        while ((match = regex.exec(content)) !== null) {
            addMatch(matches, seen, content, match.index + (match[0].length - match[1].length), match[1].length);
            if (match.index === regex.lastIndex) regex.lastIndex += 1;
        }
    }

    // Punctuation/case variants of the core inside otherwise-valid tokens.
    if (core) {
        let regex;
        try {
            regex = new RegExp(escapeRegExp(core), 'gi');
        } catch {
            regex = null;
        }

        if (regex) {
            const expected = core.toLowerCase();
            let match;
            while ((match = regex.exec(content)) !== null) {
                const { start, end } = tokenBounds(content, match.index, match[0].length);
                const token = content.slice(start, end);
                if (stripOuterPunctuation(token).toLowerCase() === expected) {
                    addMatch(matches, seen, content, match.index, match[0].length);
                }
                if (match.index === regex.lastIndex) regex.lastIndex += 1;
            }
        }
    }

    if (matches.length === 0) {
        return { index: -1, total: 0, occurrence: 0, length: 0 };
    }

    matches.sort((a, b) => a.index - b.index);
    const occurrence = ((requested % matches.length) + matches.length) % matches.length;
    const match = matches[occurrence];

    return {
        index: match.index,
        total: matches.length,
        occurrence,
        length: match.length,
    };
}
