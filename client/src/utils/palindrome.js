/**
 * Finds all unique palindromes in a given text.
 * Ignores single characters.
 * Case insensitive search, but returns original casing? 
 * Requirement: "Search all the words (any language or numbers)"
 */
export function findPalindromes(text) {
    if (!text) return [];

    // Split by explicit delimiters (whitespace and commas)
    // This treats symbols (other than commas) as part of the "word"
    const words = text.split(/[\s\r\n\t,]+/).filter(Boolean);
    const palindromes = new Set();

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (word.length < 2) continue;

        // Filter out "noise": words must contain at least 2 letters/numbers
        const alphaNumericCore = word.match(/[\p{L}\p{N}]/gu) || [];
        if (alphaNumericCore.length < 2) continue;

        const lower = word.toLowerCase();
        let isPalindrome = true;
        let left = 0;
        let right = lower.length - 1;

        while (left < right) {
            if (lower[left] !== lower[right]) {
                isPalindrome = false;
                break;
            }
            left++;
            right--;
        }

        if (isPalindrome) {
            palindromes.add(word);
        }
    }

    // Convert to array and sort alphabetically
    return Array.from(palindromes).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}
