# Palindrome Checker 🎯

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

![App Screenshot](./assets/palindrome_checker.png)

A local, multilingual palindrome and levidrome auditing suite for large text files. Analysis runs in the Express process, so the browser stays responsive even for multi-megabyte dictionaries.

## Features

- **🚀 Large-file friendly**: The 16 MB OPTED dictionary is analyzed in a few seconds without freezing the UI.
- **🌐 Unicode-aware**: Grapheme-aware comparison handles astral-plane letters, combining marks, and emoji filtering.
- **🧭 Matching navigation**: Jump to a token with the Range API, cycle through repeated occurrences, and see `current/total`. Navigation also reaches punctuation- and case-variant forms of the same token.
- **🛸 Levidrome detection**: Structured pairs such as `stop ⇄ pots`, with independent navigation for each word.
- **💾 Fingerprinted caching**: Results live in `data/.cache/<sha256-of-source-path>.json` with source size, mtime, SHA-256, encoding, analysis version, and cache version. Editing a source invalidates its cache automatically.
- **🔤 Encoding control**: BOM sniffing, strict UTF-8, and Windows-1252 fallback, with overrides for Mac Roman, Windows-1250, ISO-8859-2, Windows-1251, UTF-16 LE, and UTF-16 BE. A detected-encoding badge and manual selector are available in the UI.
- **📊 Health checks**: The client verifies the server protocol version and shows a clear overlay when the API is unavailable or outdated.
- **📅 Date generator**: Generate palindrome-friendly date permutations with `century_dates/generate_dates.py`, including custom `--start`, `--end`, and `--output` options.
- **🌓 Sleek dark UI**: Glassmorphic desktop layout with a responsive stacked layout, 500-row result batches, keyboard-accessible controls, and reduced-motion support.

## Quick Start

Requirements: Node.js 20 or newer (CI runs Node 20 and 22).

```bash
npm install
npm run dev
```

Then open <http://127.0.0.1:8089>. The Vite dev server proxies `/api` to the Express server on port 8088.

Or use a launcher:

- **Windows**: `./run_app.bat`, stop with `./stop_app.bat`
- **Unix/Linux**: `sh run_app.sh`, stop with `Ctrl+C`

The launchers `cd` to the repository root, install root workspace dependencies if `node_modules` is missing, and run the foreground dev command. The Windows shutdown script only targets listeners on the configured ports and leaves processes it cannot attribute to this project running. Nothing runs a global `taskkill /im node.exe`.

### Production build

```bash
npm run build
npm start
```

The Express server serves `client/dist` at <http://127.0.0.1:8088> and exposes the API on the same origin. To serve the built client through Vite instead, start the API and run `npm run preview`; it uses the same `/api` proxy on port 8089.

## Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` / `SERVER_PORT` | `8088` | Express API port (also the default Vite proxy target) |
| `HOST` | `127.0.0.1` | API bind address (localhost only by default) |
| `CLIENT_PORT` | `8089` | Vite dev/preview port |
| `VITE_API_TARGET` | `http://127.0.0.1:$SERVER_PORT` | Override the Vite `/api` proxy target |
| `DATA_DIR` | repository `data/` | Directory containing source files |
| `MAX_FILE_BYTES` | `67108864` (64 MB) | Per-file read limit |

## Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Run the API and Vite dev server together |
| `npm run dev:server` / `dev:client` | Run one side only |
| `npm run build` | Build the client into `client/dist` |
| `npm start` | Serve `client/dist` and the API from Express |
| `npm run preview` | Preview the built client through Vite |
| `npm test` | Run all Node test files |
| `npm run lint` | Run ESLint with the client's flat config |
| `npm run clean -- --yes` | Remove `data/.cache` |

## Tests and checks

```bash
npm test          # analysis, client API, encoding, search, and server tests
npm run lint      # ESLint flat config
npm run build     # production bundle
python -m unittest discover -s century_dates -p "test_*.py"
```

GitHub Actions runs the Node suite on Node 20 and 22, then lint and build, plus the Python 3.12 generator tests. See `.github/workflows/ci.yml`.

## Tokenization policy

- Tokens are separated by whitespace or commas.
- Leading/trailing punctuation is ignored for comparison; the original token is kept for display and navigation. Internal punctuation stays significant (`a-b-a`).
- Comparison is case-insensitive and grapheme-aware. Tokens with fewer than two letters/numbers (including emoji-only tokens) are ignored.
- Results are deduplicated case-insensitively and preserve the first encountered casing. Palindromes include an occurrence count; levidromes are returned as structured `{ a, b }` pairs.
- Phrase palindromes are intentionally not detected; the audit operates on individual tokens.
- Case conversion uses `toLowerCase()` rather than full Unicode case folding, so a few locale-specific forms (for example Greek final sigma `ς` versus `σ`) are treated as distinct. This is a documented limitation.

## Caching

Caches are stored in `data/.cache/<sha256-of-source-path>.json`. Each entry records the source path, byte size, mtime, SHA-256 of the raw bytes, detected encoding, `analysisVersion`, `cacheVersion`, results, and timings. Freshness compares the source path, encoding, SHA-256, analysis version, and cache version; mtime is metadata only. Writes are atomic and serialized per source, and stale or corrupt entries are never served as fresh.

The old `data/*.log` caches and `data/.cache/` are ignored by Git. Remove generated caches with:

```bash
npm run clean -- --yes
```

Run that command from the repository root.

## Documentation

- [Code walkthrough](./CODE_DOCUMENTATION.md)
- [Design philosophy](./DESIGN_PHILOSOPHY.md)
- [Contributing guidelines](./CONTRIBUTING.md)
- [Original audit report](./ds.md)

## License

Licensed under the [GNU GPL v3](./LICENSE).

Built with 🧠, ☕ and 🤖 by [krishnakanthb13](https://github.com/krishnakanthb13)
