# Palindrome Checker - Code Documentation

## Project Structure

```text
/shared
  analysis.mjs            # Unicode-aware palindrome/levidrome algorithms (server + tests)
  version.mjs             # SERVER_VERSION shared by the API and the health check
/client
  index.html              # Vite entry document
  vite.config.js          # Dev/preview ports, repository fs allowlist, /api proxy
  eslint.config.js        # ESLint 9 flat config
  /public
    favicon.svg           # Application icon
  /src
    main.jsx              # React bootstrap
    App.jsx               # UI state, request tokens, filters, tabs, navigation, errors
    api.js                # Fetch helpers and HTTP error handling
    App.css               # Component styles, status tones, responsive breakpoints
    index.css             # Design tokens, base theme, scrollbars
    /components
      Icons.jsx           # Inline SVG icon set (no emoji icons)
    /utils
      palindrome.js       # Compatibility re-export of shared analysis
      levidrome.js        # Compatibility re-export of shared analysis
      search.js           # Case/punctuation-aware occurrence navigation
/server
  index.js                # Process entry point, env config, graceful shutdown
  app.js                  # Express app factory, routes, static serving
  /lib
    paths.js              # Path guard and data-file listing
    encoding.js           # BOM/UTF-8/Windows-1252 decoding and overrides
    cache.js              # Fingerprinted, atomic JSON cache store
    http.js               # HttpError helper
/data                     # Source datasets; generated caches in data/.cache
/century_dates
  generate_dates.py       # CLI date generator
  test_generate_dates.py  # Generator unit tests
/tests
  analysis.test.mjs       # Algorithm and Unicode tests
  api.test.mjs            # Fetch helper, URL encoding, and ApiError tests
  encoding.test.mjs       # BOM, UTF-8, Windows-1252, UTF-16, Mac Roman tests
  search.test.mjs         # Occurrence navigation tests
  server.test.mjs         # API, security, cache, and encoding integration tests
/scripts
  clean-caches.mjs        # Remove data/.cache (requires --yes)
  stop-app.ps1            # Targeted Windows shutdown helper
/.github/workflows
  ci.yml                  # Node 20/22 tests, lint, build; Python 3.12 tests
run_app.bat / run_app.sh  # Development launchers (foreground, Ctrl+C)
stop_app.bat              # Windows shutdown wrapper
.editorconfig             # Editor defaults (UTF-8, LF, 4-space JS)
.nvmrc                    # Node 20
```

## High-Level Architecture

The app is a local client-server system:

- **Shared analysis** (`shared/analysis.mjs`) is imported by the Node server and the tests. The browser receives the resulting structured data through the API; the thin re-exports under `client/src/utils/` keep the historical client-side module names available. `shared/version.mjs` holds the protocol version used by `/api/health` and the client check.
- **Server compute**: `POST /api/analysis` reads the source, decodes it, runs both algorithms, writes a cache entry, and returns structured results. The browser never sends computed result payloads and never blocks on the algorithms.
- **Fingerprinted cache**: `data/.cache/<sha256-of-relative-path>.json` stores the source path, size, mtime, SHA-256 of the raw bytes, detected encoding, analysis version, cache version, results, and timings.
- **Freshness**: a cache is fresh only when the source path, encoding, SHA-256, `analysisVersion`, and `cacheVersion` match. Editing a source or changing the encoding invalidates it. `mtimeMs` is stored as metadata but is not part of the freshness comparison.
- **Request safety**: the client uses a monotonic request token plus `AbortController`; state is committed only after the token check. Starting a new load aborts the previous request.
- **Error visibility**: non-2xx responses throw `ApiError`, the UI shows an error banner with retry, and a health overlay blocks incompatible or offline servers.
- **Local by default**: the API binds to `127.0.0.1`, CORS is not enabled, and the browser talks to the API through the same origin (Vite proxy in development, Express static serving in production).

## UI architecture

- **Design tokens** (`client/src/index.css`) define the dark palette, semantic colors (`accent`, `success`, `warning`, `danger`), surfaces, borders, radii, shadows, typography, and the shared transition. `client/src/App.css` contains component and responsive styles. Both files use a local system font stack, so the interface has no external asset dependency.
- **Iconography** (`client/src/components/Icons.jsx`) is an inline SVG set: logo, file, refresh, target, search, close, alert, check, database, arrow, and server. Icons inherit `currentColor` and `font-size`, scale with their controls, and are hidden from assistive technology. The UI uses no emoji as icons.
- **Sidebar**: brand header, a client-side file filter, a file-list refresh action, compact keyboard-focusable file buttons, and a footer with the project credit, the API protocol version, and local-only status. The list shows names only; file size, encoding, and modification date live in the workspace header.
- **Workspace header**: file identity and metadata, the encoding override, a semantic status pill, and the **Recompute** action. `statusTone()` maps the current status to `info`, `success`, or `warning`, so loading, cache hits, recomputation, stale caches, and navigation messages are visually distinct.
- **Source and results panels**: the source viewer keeps the single `<pre>` text node and synchronized scroll mirror. Results are tabbed and each tab shows its live count. The viewer toolbar filters the in-memory result array without a server request, and the list still pages in 500-row batches.
- **Client-side filtering**: `fileQuery` filters the file list; `resultQuery` filters palindromes by `word` and levidromes by either pair member. Both lists derive from `useMemo`. The result filter resets when a new file loads. Empty states distinguish “no results in this file” from “no matches for this filter”.
- **Keyboard and accessibility**: a skip link targets `<main id="main-content">`; file rows are real buttons with `aria-current`; tabs use `role="tablist"`/`role="tab"` with roving `tabIndex` and <kbd>←</kbd>/<kbd>→</kbd> handling; status and loading use live regions; errors use `role="alert"`; the server warning uses `alertdialog`; focus-visible rings and `prefers-reduced-motion` are respected. Pressing <kbd>/</kbd> focuses the result filter unless focus is already in a form control, and <kbd>Esc</kbd> clears the focused filter.
- **Responsive layout**: the shell is a two-column grid above 1080px, relaxes panel hints below that, becomes a stacked page at 860px, and reflows the header, tabs, and filter toolbar at 560px. The shell uses `100dvh`, and the layouts are checked for horizontal overflow.
- **Motion**: interactions use short (roughly 140–180ms) color, border, background, and transform transitions. There are no continuous background animations, so visual feedback does not compete with analysis.

## API

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Server, analysis, and cache versions plus supported encodings |
| `GET` | `/api/files` | List text-like files in `DATA_DIR` |
| `GET` | `/api/file?path=...&encoding=...` | Decode and return one source file |
| `GET` | `/api/analysis?source=...&encoding=...` | Return a fresh cache, or a miss/stale/corrupt status |
| `POST` | `/api/analysis` | Compute and cache results; body `{ source, encoding?, force? }` |

### Response shapes

`GET /api/health`:

```json
{
  "status": "ok",
  "version": "3.0",
  "analysisVersion": 1,
  "cacheVersion": 1,
  "encodings": ["auto", "utf-8", "windows-1252", "macintosh", "windows-1250", "iso-8859-2", "windows-1251", "utf-16le", "utf-16be"]
}
```

`GET /api/files`:

```json
{
  "files": [
    { "name": "words.txt", "size": "150 B", "bytes": 150, "mtimeMs": 1730000000000 }
  ]
}
```

`GET /api/file`:

```json
{ "content": "level racecar stop pots civic\n", "encoding": "utf-8", "size": 30, "mtimeMs": 1730000000000 }
```

`GET /api/analysis` when a fresh cache exists, and `POST /api/analysis` after computing or reusing a cache:

```json
{
  "exists": true,
  "fresh": true,
  "stale": false,
  "cached": false,
  "palindromes": [{ "word": "level", "count": 1 }],
  "levidromes": [{ "a": "stop", "b": "pots" }],
  "timing": { "palindrome": 0.42, "levidrome": 0.37 },
  "meta": {
    "source": "words.txt",
    "encoding": "utf-8",
    "size": 30,
    "mtimeMs": 1730000000000,
    "sha256": "…",
    "createdAt": "2026-11-02T00:00:00.000Z",
    "analysisVersion": 1,
    "cacheVersion": 1
  }
}
```

`POST` sets `cached` to `true` when it reused a fresh entry. `GET` returns `cached: false` because it never computes.

`GET /api/analysis` when no cache exists:

```json
{ "exists": false, "fresh": false, "stale": false, "corrupt": false, "supportedEncodings": ["auto", "utf-8", "…"] }
```

`corrupt` is `true` when an entry exists but fails validation or JSON parsing. When the source changed, the response is:

```json
{ "exists": false, "fresh": false, "stale": true, "corrupt": false, "reason": "source-changed", "meta": { "…": "summary of the cached entry" } }
```

All API errors are JSON: `{ "error": "...", "code": "..." }`. Status codes in use:

| Status | Meaning |
| :--- | :--- |
| `400` | Invalid query/body, unsupported encoding, undecodable text, malformed JSON body |
| `403` | Path outside `DATA_DIR`, the data directory itself, or a dot-segment |
| `404` | Missing file or unknown route |
| `413` | Source file exceeds `MAX_FILE_BYTES`, or request body exceeds 64 kB |
| `415` | Content looks binary (NUL byte in the first 8 KiB without a UTF-16 BOM/override) |
| `500` | Unexpected server error (details are logged, not returned) |

Unknown `/api/*` routes return JSON 404s. Unknown non-API routes also return JSON 404s, except when a production client build is being served: extensionless `GET` requests then fall back to `client/dist/index.html` for client-side routing, while unmatched requests with a file extension still return JSON 404s. The server binds to `127.0.0.1` by default, does not enable CORS, disables `x-powered-by`, sets `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`, and sends `Cache-Control: no-store` on successful `/api/file` and `/api/analysis` responses; `/api/health`, `/api/files`, and error responses do not set that header.

## Cache schema

```json
{
  "cacheVersion": 1,
  "analysisVersion": 1,
  "source": "words.txt",
  "encoding": "utf-8",
  "size": 4862985,
  "mtimeMs": 1730000000000,
  "sha256": "…",
  "createdAt": "2026-11-02T00:00:00.000Z",
  "palindromes": [{ "word": "level", "count": 2 }],
  "levidromes": [{ "a": "stop", "b": "pots" }],
  "timing": { "palindrome": 1618.2, "levidrome": 2320.4 }
}
```

Cache files are named after the SHA-256 of the normalized source path with forward slashes. Writes go to a temporary file and are atomically renamed into place. A per-source promise lock serializes read-modify-write cycles, and concurrent POSTs reuse a cache produced by the first request.

The store validates entries before returning them: version fields, source/encoding/hash strings, a non-negative size, arrays of `{ word, count }` and `{ a, b }` entries, and numeric/string timing values. Invalid or malformed entries are ignored, reported as `corrupt`, and rebuilt on the next POST.

## Core Modules

| Module | Function | Description |
| :--- | :--- | :--- |
| `shared/analysis.mjs` | `findPalindromes(text)` | Returns `[{ word, count }]`, deduplicated case-insensitively and sorted. |
| `shared/analysis.mjs` | `findLevidromes(text)` | Returns `[{ a, b }]` reverse pairs present in the source; palindromes and one-sided words are excluded. |
| `shared/version.mjs` | `SERVER_VERSION` | Protocol version shared by the API and the client health check. |
| `server/lib/paths.js` | `createPathGuard(root)` | Rejects `..`, the root itself, dot-segments, NUL bytes, sibling-prefix escapes, and symlink escapes. |
| `server/lib/paths.js` | `listDataFiles(root)` | Lists non-hidden, non-cache, non-log, non-binary files with size and mtime. |
| `server/lib/encoding.js` | `normalizeEncoding(label)` | Resolves aliases (`latin1`, `cp1250`, `x-mac-roman`, …) or rejects unknown labels. |
| `server/lib/encoding.js` | `decodeBuffer(buffer, encoding)` | BOM sniffing, strict UTF-8, Windows-1252 fallback, or an explicit encoding. |
| `server/lib/cache.js` | `CacheStore` | Validated reads, atomic writes, per-key lock, fingerprint comparison. |
| `server/lib/cache.js` | `isCacheFresh(data, fingerprint, version)` | Compares source, encoding, SHA-256, and analysis version. |
| `client/src/api.js` | `requestJson` | Checks `res.ok` and converts HTTP failures into visible `ApiError`s. |
| `client/src/App.jsx` | `loadFile` | Request-token + abort flow; commits file and result state only if still current. |
| `client/src/App.jsx` | `statusTone` | Maps status text to semantic pill tones (`info`, `success`, `warning`). |
| `client/src/components/Icons.jsx` | Icon components | Inline SVG icons that inherit `currentColor` and `font-size`; replaces emoji icons. |
| `client/src/utils/search.js` | `findOccurrence(content, word, requested)` | Finds the requested case/punctuation-aware token and cycles through occurrences. |
| `century_dates/generate_dates.py` | `generate_entries(start, end)` | Generates unique `YYMMDD`, `YYYYMMDD`, and timestamp-palindrome lines. |

## Execution Flow

1. **Launch**: `run_app.bat` / `run_app.sh` installs dependencies if needed and runs `npm run dev`.
2. **Health check**: the client verifies `/api/health` against `SERVER_VERSION`; an offline or outdated server gets a blocking overlay with retry.
3. **File selection**: the client requests the decoded file, then the cache status, with an abortable request token.
4. **Cache hit**: a fresh cache populates both result tabs immediately.
5. **Cache miss/stale**: the server computes both analyses and atomically writes the new cache. A stale cache makes the client POST with `force: true`.
6. **Display**: structured results populate both tabs with live counts. The viewer starts with 500 rows and adds 500 per “Show more” click, with occurrence counts, filter-aware empty states, and a semantic status pill.
7. **Filter**: typing in the result filter narrows the already-loaded array instantly (no request); `/` focuses it from anywhere outside a form control, and `Esc` clears it. The file filter works the same way in the sidebar.
8. **Navigate**: clicking a target button finds the next matching occurrence, selects it with the Range API, and scrolls it into view. The counter shows `current/total`; repeated clicks cycle.
9. **Refresh**: re-reads the source and forces a recomputation of both analyses.
10. **Encoding change**: reloads the source and analysis with the selected override.
11. **Retry**: the error banner retries the current file; the health overlay retries the connection and file list.

## Encoding

Auto detection is deterministic:

1. UTF-8 BOM (stripped), UTF-16 LE BOM, or UTF-16 BE BOM.
2. Strict UTF-8 (invalid bytes fail).
3. Windows-1252 fallback.

There is no statistical charset guessing. Statistical detection previously misread Norwegian, Italian, and Spanish data.

Explicit values: `auto`, `utf-8`, `windows-1252`, `macintosh`, `windows-1250`, `iso-8859-2`, `windows-1251`, `utf-16le`, `utf-16be`. Aliases include `latin1`/`iso-8859-1`/`cp1252` → Windows-1252, `cp1250` → Windows-1250, `cp1251` → Windows-1251, and `mac`/`x-mac-roman` → Mac Roman.

An explicit single-byte encoding always decodes; an explicit UTF-8/UTF-16 encoding fails with `400` (`decode_failed`) on invalid input. Files containing NUL bytes in the first 8 KiB are rejected with `415` unless they have a UTF-16 BOM or an explicit UTF-16 override. Cache files are always UTF-8 JSON and are never run through source detection.

## Unicode and Tokenization

- Tokens are split on whitespace or commas.
- Leading/trailing punctuation is stripped for comparison only; the original token is retained for display and navigation. Internal punctuation is significant, so `a-b-a` is a palindrome while `...` is ignored.
- NFC normalization and grapheme segmentation run only when combining marks, joiners, variation selectors, skin-tone modifiers, or flags are present; ASCII and ordinary accented words use fast paths.
- Case-insensitive deduplication preserves the first encountered casing. Palindromes carry an occurrence count; levidrome pairs require both reversed words to be present and are deduplicated with a structured key.
- Tokens with fewer than two letters/numbers are ignored, filtering punctuation noise and emoji-only tokens.
- Results are sorted with a module-level `Intl.Collator` using base sensitivity and numeric ordering.
- Phrase palindromes are intentionally out of scope.
- Case conversion uses `toLowerCase()` rather than full Unicode case folding, so a few locale-specific forms (for example Greek final sigma `ς` versus `σ`) are treated as distinct. This is a documented limitation rather than a locale-specific heuristic.

## Performance notes

Measured on the 16 MB `OPTED-Dictionary.txt`: roughly 2.1 s for palindromes and 2.7 s for levidromes in a warm Node process. The first server run can be slower while the JIT and `Intl` data warm up. The client remains responsive because analysis runs in the API process, not on the browser main thread.

`POST /api/analysis` computes both analyses regardless of which tab is open, so switching tabs never triggers recomputation. The viewer initially renders 500 result rows and adds 500 per “Show more” click. The source viewer uses one `<pre>` text node, which keeps Range-based navigation precise; a `ResizeObserver` keeps the scroll mirror height in sync. Very large sources are bounded by `MAX_FILE_BYTES`.

## Tests and CI

The Node test suite uses the built-in `node:test` runner:

- `tests/analysis.test.mjs` — palindromes, levidromes, dedupe/counting, punctuation, astral letters, combining marks, emoji filtering.
- `tests/api.test.mjs` — URL encoding, endpoint selection, request bodies, `ApiError` handling.
- `tests/encoding.test.mjs` — aliases, BOMs, strict UTF-8, Windows-1252 fallback, UTF-16, Mac Roman, binary detection.
- `tests/search.test.mjs` — occurrence cycling, wrapping, case/punctuation variants, boundaries, astral letters.
- `tests/server.test.mjs` — health/files/file/analysis routes, traversal and input validation, binary rejection, cache freshness/staleness/corruption, concurrent writes, Norwegian round-trip, JSON errors, 404s, static serving.

```bash
npm test
npm run lint
npm run build
python -m unittest discover -s century_dates -p "test_*.py"
```

CI (`.github/workflows/ci.yml`) runs the Node tests, lint, and build on Node 20 and 22, and runs the four generator tests on Python 3.12.

## Known limitations

- Phrase palindromes are not detected.
- `toLowerCase()` is used instead of full Unicode case folding (Greek final sigma is the notable case).
- Analysis runs on the API's main thread; a multi-user deployment should move it to `worker_threads`.
- Result rows load in 500-row batches rather than being truly virtualized; the source viewer uses a single large text node.
- Sources must already live in `DATA_DIR`; there is no file upload.
- Legacy datasets may contain upstream-corrupted accented bytes. The app avoids statistical guessing and exposes explicit encoding overrides, but it cannot reconstruct bytes that were already lost.

## External Data Sources

The dictionary dataset files used for auditing within this project were sourced and compiled from the following repositories and providers:

- **[dwyl/english-words](https://github.com/dwyl/english-words)**: A comprehensive list of over 466k English words.
- **[sujithps/Dictionary](https://github.com/sujithps/Dictionary)**: JSON and text-based English dictionary resources.
- **[Kaggle: OPTED Dictionary](https://www.kaggle.com/datasets/dfydata/the-online-plain-text-english-dictionary-opted)**: The Online Plain Text English Dictionary (OPTED) in a structured format.
- **[G. Wicks Dictionaries](http://www.gwicks.net/dictionaries.htm)**: A curated collection of large-scale word lists for various languages.
- **[Levidrome List](https://www.levidromelist.com/)**: A reference for identifying valid Levidromes.
