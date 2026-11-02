# Palindrome Checker - Design Philosophy

## Problem Definition

Auditing large datasets (dictionaries, codebases, logs) for linguistic patterns like palindromes often leads to performance bottlenecks or “unresponsive page” crashes due to massive DOM overhead or inefficient O(n²) algorithms.

## The Solution

This tool provides a **local, high-signal auditing environment**. It prioritizes predictable performance, precise navigation, and data integrity over generic features.

## Design Principles

1. **Responsiveness over raw client speed**: Analysis runs in the Express process, not on the browser main thread. The 16 MB OPTED dictionary takes a few seconds to analyze, but the UI stays interactive and shows progress. Starting a new load aborts the previous request.
2. **Progressive result rendering**: The source viewer uses a single `<pre>` text node for exact Range navigation. Result lists start with 500 rows and add 500 per “Show more” click instead of dumping every result into the DOM at once.
3. **Surgical precision**: Navigation uses the Browser Range API to select the matching token and scroll it into view. It understands case and surrounding-punctuation variants, and repeated words can be cycled with a visible `current/total` counter.
4. **Synthetic dataset generation**: The suite includes a CLI generator for century-scale date datasets and timestamp palindromes, with configurable `--start`, `--end`, and `--output`.
5. **Explicit tokenization**: Whitespace/comma delimiters, punctuation trimming for comparison, case-insensitive deduplication, grapheme-aware comparison, and a minimum of two letters/numbers are documented and tested. Phrase palindromes are intentionally out of scope.
6. **Server-side compute**: The browser sends only a source path, an optional encoding, and a force flag. The server decodes, analyzes, and caches. This removes client-trusted result payloads and duplicated logic; the 64 kB JSON cap applies only to those small requests.
7. **Integrity by default**: Cache entries carry a source SHA-256, size, mtime, encoding, algorithm version, and cache version. Freshness is decided by source path, encoding, SHA-256, and version — not by mtime. Writes are atomic and serialized per source. Stale or corrupt caches are never presented as fresh.
8. **Local by default**: The API binds to `127.0.0.1`, CORS is disabled, path traversal is rejected by directory-boundary and realpath checks, sources are capped by `MAX_FILE_BYTES`, and HTTP errors do not leak absolute paths. Successful file and analysis responses send `Cache-Control: no-store`, and all responses set `nosniff`/`no-referrer` headers.
9. **Deterministic encoding**: Auto detection is BOM sniffing → strict UTF-8 → Windows-1252, never statistical guessing. The detected encoding is visible, and users can override it with Mac Roman, Windows-1250/1251, ISO-8859-2, or UTF-16 LE/BE.
10. **Visible state**: The UI surfaces server health, cache state, detected encoding, execution time, occurrence counts, and retry actions instead of failing silently.

## Target Audience

- **Linguists**: For pattern detection in literal datasets.
- **Developers**: For identifying patterns or potential collision-points in code/logs.
- **Curious Users**: Anyone wanting to explore linguistic symmetry in large texts.

## Constraints & Trade-offs

- **Local-Only**: Designed for local development and auditing; not intended as a web-scale public service.
- **Single-process compute**: The server analyzes on its main thread. A local single-user workflow is unaffected, but a multi-user deployment should move analysis to `worker_threads`.
- **Monospaced Content**: Optimized for monospaced text to ensure precise navigation offsets.
- **Legacy data**: Bundled non-UTF-8 dictionaries are decoded with a Windows-1252 fallback rather than rewritten. The UI exposes the detected encoding and explicit overrides, including Mac Roman. Some bundled files contain upstream-corrupted accented bytes that no standard encoding can reconstruct.
- **Incremental batches, not virtualization**: Result rows load 500 at a time on demand, and the source remains one text node. This keeps navigation and scrolling predictable without introducing a virtualized DOM.
- **No phrase mode**: The audit operates on whitespace/comma-delimited tokens. Phrase palindromes and configurable delimiters are intentionally unsupported.
- **Case folding**: `toLowerCase()` is used rather than full Unicode case folding; Greek final sigma is the notable limitation.
- **Local files only**: Sources must already be in `DATA_DIR`; there is no upload or remote fetch.
