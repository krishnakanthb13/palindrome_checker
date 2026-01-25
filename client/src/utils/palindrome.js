/**
 * Finds all unique palindromes in a given text.
 * Ignores single characters.
 * Case insensitive search, but returns original casing? 
 * Requirement: "Search all the words (any language or numbers)"
 */
export function findPalindromes(text) {
    if (!text) return [];

    // Split by non-word characters to get words/numbers
    // unicode support for "any language" is best done with \p{L} but JS regex support varies.
    // Let's use a broad splitter.
    const words = text.match(/[\p{L}\p{N}]+/gu) || [];

    const palindromes = new Set();

    words.forEach(word => {
        if (word.length < 2) return; // Ignore single chars
        const lower = word.toLowerCase();
        const reversed = lower.split('').reverse().join('');
        if (lower === reversed) {
            palindromes.add(word); // Store original casing or lower? "Display them... alphabetically"
            // Usually lower is better for sorting, but seeing original is nice.
            // Let's store lower for uniqueness, but maybe we want to show original?
            // "Search all the words" -> duplicate words? likely unique set.
        }
    });

    // Convert to array and sort alphabetically
    return Array.from(palindromes).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
