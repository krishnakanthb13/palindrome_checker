# Contributing to Palindrome Checker

First off, thank you for considering contributing to this tool!

## How to Contribute

### 1. Reporting Bugs

- Use GitHub Issues to report bugs.
- Include your OS, Node.js version (`node --version`), the file size/type you were auditing, the detected encoding shown in the UI, and any error banner text.
- If a result looks stale, mention whether the status badge showed `Cached`, `Done`, or `Recomputed`.

### 2. Feature Suggestions

- We welcome performance-oriented features (for example, worker-thread analysis, phrase mode, or batch scanning).
- Keep the local-only, integrity-first design in mind.

### 3. Development Workflow

1. **Fork** the repository.
2. **Install dependencies** from the repository root (npm workspaces handle both packages):
   ```bash
   npm install
   ```
3. **Launch the app**:
   ```bash
   npm run dev
   ```
   Or use `./run_app.bat` / `sh run_app.sh`. The dev server opens the client on <http://127.0.0.1:8089> and proxies `/api` to <http://127.0.0.1:8088>.
4. **Create a branch** for your fix or feature.
5. **Run the checks**:
   ```bash
   npm test
   npm run lint
   npm run build
   python -m unittest discover -s century_dates -p "test_*.py"
   ```
6. **Submit a Pull Request**.

CI (`.github/workflows/ci.yml`) runs the Node tests, lint, and build on Node 20 and 22, plus the generator tests on Python 3.12. Match those versions for the smoothest experience; Node 20 is the minimum.

### 4. Where Tests Live

| Area | Test file |
| :--- | :--- |
| Palindromes, levidromes, Unicode | `tests/analysis.test.mjs` |
| Client fetch helpers and URL encoding | `tests/api.test.mjs` |
| BOM, UTF-8, Windows-1252, UTF-16, Mac Roman | `tests/encoding.test.mjs` |
| Occurrence navigation | `tests/search.test.mjs` |
| API, security, cache, encoding integration | `tests/server.test.mjs` |
| Date generator | `century_dates/test_generate_dates.py` |

## Pre-submission Checklist

- [ ] `npm test`, `npm run lint`, and `npm run build` pass.
- [ ] New analysis behavior has tests in `tests/analysis.test.mjs`.
- [ ] New API behavior has tests in `tests/server.test.mjs` and, when it is a client helper, `tests/api.test.mjs`.
- [ ] New encoding behavior has tests in `tests/encoding.test.mjs`.
- [ ] New navigation behavior has tests in `tests/search.test.mjs`.
- [ ] The cache schema and `analysisVersion`/`cacheVersion` are updated when result shapes change; `SERVER_VERSION` is updated when the API contract changes.
- [ ] `data/.cache/` and `data/*.log` are not committed.
- [ ] UI changes maintain the dark glassmorphic aesthetic, keyboard accessibility, and reduced-motion behavior.
- [ ] No regression on multi-megabyte file handling, request cancellation, or retry behavior.
- [ ] Documentation in `README.md`, `CODE_DOCUMENTATION.md`, `DESIGN_PHILOSOPHY.md`, and this file is updated.

## Code Style

- Follow `.editorconfig`: UTF-8, LF, final newline, 4-space indentation for JS (2 for JSON/YAML).
- Run `npm run lint`; the client uses the ESLint 9 flat config in `client/eslint.config.js`.
- Prettier is not configured yet. Match the surrounding style instead of reformatting unrelated files.

## Metadata

- **Main Maintainer**: [krishnakanthb13](https://github.com/krishnakanthb13)
- **Copyright**: © 2026 Krishna Kanth B
