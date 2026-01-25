
/**
 * Finds all unique Levidromes (word pairs) in a given text.
 * Levidrome: A word that spells another valid word when reversed.
 * This function finds pairs where BOTH words exist in the input text.
 * Example: "stop" and "pots" -> "stop <=> pots"
 */
export function findLevidromes(text) {
    if (!text) return [];

    // split by whitespace/commas
    const words = text.split(/[\s\r\n\t,]+/).filter(Boolean);

    // Create a Set for O(1) lookup of valid words in this text
    // Normalize to lowercase for matching
    const wordSet = new Set();
    const originalMap = new Map(); // Store original casing

    for (const w of words) {
        if (w.length < 2) continue; // Ignore single chars
        // Filter noise
        if ((w.match(/[\p{L}\p{N}]/gu) || []).length < 2) continue;

        const lower = w.toLowerCase();
        wordSet.add(lower);
        if (!originalMap.has(lower)) {
            originalMap.set(lower, w); // Keep first occurrence casing
        }
    }

    const foundPairs = new Set(); // To avoid duplicates like "stop <=> pots" AND "pots <=> stop"
    const results = [];

    for (const lowerWord of wordSet) {
        const reversed = lowerWord.split('').reverse().join('');

        // Check if reversed exists in the set
        // AND it's not a palindrome (levidromes must be different words)
        if (wordSet.has(reversed) && reversed !== lowerWord) {
            // Check if we already found this pair
            const pairKey = [lowerWord, reversed].sort().join('|');

            if (!foundPairs.has(pairKey)) {
                foundPairs.add(pairKey);

                // Construct result using original casing
                const w1 = originalMap.get(lowerWord);
                const w2 = originalMap.get(reversed);
                results.push(`${w1} <=> ${w2}`);
            }
        }
    }

    return results.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
