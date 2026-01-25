# Palindrome Checker - Design Philosophy

## Problem Definition
Auditing large datasets (dictionaries, codebases, logs) for linguistic patterns like palindromes often leads to performance bottlenecks or "unresponsive page" crashes due to massive DOM overhead or inefficient O(n²) algorithms.

## The Solution
This tool provides a **high-efficiency, zero-overhead auditing environment**. It prioritizes raw performance and precise navigation over generic features.

## Design Principles
1. **Performance First**: Using raw pointer comparisons and avoiding string mutations ensures that even a 16MB dictionary is processed in milliseconds.
2. **Minimal DOM Footprint**: By using `<pre>` tags for raw source and virtualized layouts for logs, the UI retains stability even when handling 100,000+ line files.
3. **Surgical Precision**: The "Exact Match" navigation doesn't just scroll to a line; it uses the Browser Range API to find the exact pixel coordinates and visual selection of a token.
4. **Contextual Integrity**: Symbols are treated as delimiters or parts of words based on strict proximity rules, catering to technical data as much as natural language.

## Target Audience
- **Linguists**: For pattern detection in literal datasets.
- **Developers**: For identifying patterns or potential collision-points in code/logs.
- **Curious Users**: Anyone wanting to explore linguistic symmetry in large texts.

## Constraints & Trade-offs
- **Local-Only**: Designed for local development and auditing; not intended as a web-scale public service.
- **Monospaced Content**: Optimized for monospaced text to ensure surgical precision in navigation offsets.
