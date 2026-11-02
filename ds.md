# Palindrome Checker — Code Audit

**Date:** 2026-11-02
**Scope:** client, server, launcher scripts, dataset generator, configs, docs, and the shipped datasets.
**Method:** static review plus live API tests and direct execution of the analysis functions against the bundled data.
**Files changed during the audit:** none (this document only).

---

## Verdict

The core idea is sound. The palindrome/levidrome functions are small, dependency-free, and easy to test. The server’s root-directory concept and the health-check idea are good starting points, and preserving original casing was a thoughtful choice.

However, the current build has several confirmed defects:

- a **path-traversal bypass** in the file API;
- **encoding auto-detection that corrupts multilingual data** and the app’s own caches;
- **caches that are never invalidated**, plus a Refresh button that does not re-read the source;
- an **empty-result cache loop** that re-runs analysis on every open;
- a **client race** that can display one file’s content under another file’s name;
- **silent HTTP failures**, including a confirmed 413 that the UI treats as success;
- **Unicode bugs** for astral-plane letters and combining marks.

The sections below list each finding with evidence, impact, and a concrete fix.

---

## Severity summary

| Severity | Finding |
| :--- | :--- |
| **Critical** | Path traversal bypass in `safePath` (confirmed) |
| **Critical** | Encoding auto-detection corrupts multilingual data and caches (confirmed) |
| **High** | Caches never invalidated; Refresh re-runs stale in-memory content (confirmed) |
| **High** | Empty result cache reported as “missing” → re-analysis on every open (confirmed) |
| **High** | Client request race; double-click guard is ineffective |
| **High** | Silent fetch/POST failures; 413 is ignored (confirmed) |
| **High** | Astral Unicode and combining-mark handling is wrong (confirmed) |
| **Medium** | Punctuation/case/phrase gaps; fragile `<=>` string serialization |
| **Medium** | Non-atomic, unvalidated, client-trusted cache writes |
| **Medium** | Broken dependency declaration, scripts, lint, and production build |
| **Medium** | UI blocks for seconds on large files; docs overstate performance |
| **Low** | Dead health-check UI, docs drift, repo hygiene, accessibility |

---

## Critical findings

### 1. Path traversal bypass in `safePath`

**Location:** `server/index.js:28-34`

```js
const resolvedPath = path.resolve(ROOT_DIR, requestedPath.replace(/^[/\\]/, ""));
if (!resolvedPath.startsWith(ROOT_DIR)) {
    throw new Error("Access Denied");
}
```

`startsWith` is a plain prefix check, not a directory-boundary check. Any sibling directory whose name starts with `data` passes:

```text
C:\...\palindrome_checker\data          <- ROOT_DIR
C:\...\palindrome_checker\data-evil     <- starts with ROOT_DIR
```

**Confirmed live:** I created `data-evil/secret.txt` with content `SECRET-OUTSIDE-DATA`, started the server, and requested:

```text
GET /api/file?path=../data-evil/secret.txt
-> {"content":"SECRET-OUTSIDE-DATA\r\n"}
```

The check also:

- accepts `ROOT_DIR` itself (reading a directory produces a 500);
- follows symlinks inside `data/` that point outside the root;
- returns 500 instead of 403 on denial.

**Amplifiers:**

- `app.use(cors())` (`server/index.js:11`) allows every origin.
- `app.listen(PORT)` (`server/index.js:170`) binds all interfaces, not just localhost. The documentation calls the app “local-only”, but the API is reachable from the LAN.
- Errors return `err.message` (`server/index.js:57,119,166`), leaking absolute filesystem paths.

**Fix:**

```js
const safePath = (requested) => {
    if (typeof requested !== 'string' || !requested) {
        throw httpError(400, 'Invalid path');
    }

    const resolved = path.resolve(ROOT_DIR, requested.replace(/^[/\\]+/, ''));
    const rel = path.relative(ROOT_DIR, resolved);

    if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
        throw httpError(403, 'Access denied');
    }

    if (fs.existsSync(resolved)) {
        const realRoot = fs.realpathSync(ROOT_DIR);
        const realRel = path.relative(realRoot, fs.realpathSync(resolved));
        if (!realRel || realRel === '..' || realRel.startsWith('..' + path.sep) || path.isAbsolute(realRel)) {
            throw httpError(403, 'Access denied');
        }
    }

    return resolved;
};
```

Also:

- `app.listen(PORT, '127.0.0.1')` or configure the host explicitly.
- Remove `cors()` (the Vite proxy makes the browser requests same-origin) or allowlist only the local client origin.
- Return generic error messages; log the details server-side.

---

### 2. Encoding auto-detection corrupts multilingual data and the app’s own caches

**Location:** `server/index.js:72-75`, `96-98`, `140-142`

`jschardet` is used for source files **and for the app’s own UTF-8 JSON log files**.

Observed detection on the shipped datasets:

| File | Detected | Problem |
| :--- | :--- | :--- |
| `norsk.txt` | `windows-1251` | Norwegian `ø/å/æ` become Cyrillic `ш/е/ж` |
| `italiano.txt` | `ISO-8859-2` | `à` becomes `ŕ` |
| `espanol.log` | `ISO-8859-2` | stored `eĂąe` becomes `eÄ\x82Ä\x85e` |

**Confirmed source corruption:**

```text
detected encoding: windows-1251
palindromes produced: dеd, dшd, rеr, rшr, sеs, tшt
correct Norwegian:    dåd, død, rår, rør, sås, tøt

levidromes produced:  dшl <=> lшd, dшr <=> rшd, kеl <=> lеk ...
correct Norwegian:    døl <=> lød, dør <=> rød, kål <=> låk ...
```

**Confirmed cache corruption:** `data/norsk.log` exactly matches the output of the wrong `windows-1251` decode, so the committed cache contains Cyrillic garbage. `data/espanol.log` contains `eĂąe` while the source now produces `eñe`.

**Confirmed log re-corruption:** reading `espanol.log` through the same detector yields `eÄ\x82Ä\x85e` instead of `eĂąe`. Because POST reads the log with the same detector and writes it back, every write can persist and compound mojibake.

If a log is misdetected as UTF-16, `JSON.parse` fails, the cache is treated as absent, and the next POST can overwrite the other section — data loss.

**Fix (recommended):**

1. Normalize the bundled `.txt` datasets to UTF-8 once. Every current non-UTF-8 file is compatible with `windows-1252`.
2. Decode sources with BOM sniffing → strict UTF-8 → `windows-1252` fallback. Do not use statistical guessing for sources.
3. **Always read and write log files as UTF-8**, never through `jschardet`.

```js
function decodeSource(buf) {
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        return { text: buf.subarray(3).toString('utf8'), encoding: 'utf-8' };
    }
    try {
        return {
            text: new TextDecoder('utf-8', { fatal: true }).decode(buf),
            encoding: 'utf-8',
        };
    } catch {
        return {
            text: iconv.decode(buf, 'windows-1252'),
            encoding: 'windows-1252',
        };
    }
}
```

Logs:

```js
const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));
```

Also expose the detected encoding in the UI and allow an `?encoding=` override for genuinely legacy files. After the fix, **delete/regenerate every `data/*.log`**; otherwise the wrong committed caches remain visible. The `norsk` and `espanol` caches are provably wrong today.

`jschardet` can then be removed from the runtime, which also improves performance (it scans the entire 16 MB file on every open).

---

## High-severity findings

### 3. Caches are never invalidated, and Refresh does not re-read the source

**Location:** `server/index.js:83-121`, `124-168`; `client/src/App.jsx:168-179`

The cache key is only `path.parse(source).name`:

```js
const baseName = path.parse(sourceFile).name;
const logFilename = `${baseName}.log`;
```

There is no source size, mtime, hash, encoding, or algorithm version in the log. Consequences:

- Editing `data/words.txt` while the app is open and reopening/refreshing it continues to serve the **old cached results**.
- Clicking **Refresh** calls `processAnalysis(selectedFile, fileContent, true, true)` using the **stale `fileContent` from React state**. It never re-fetches `/api/file`, so it re-audits old text and writes a cache for old text.
- `foo.txt` and `foo.md` both map to `foo.log`.
- Files in different subdirectories with the same basename collide.
- A source file literally named `foo.log` maps its cache to itself and would be overwritten.

The committed `espanol.log` is already stale (`eĂąe` vs source `eñe`), proving the problem in practice.

**Fix:**

Store metadata in each cache:

```json
{
  "source": "espanol.txt",
  "size": 1896554,
  "mtimeMs": 1730000000000,
  "sha256": "...",
  "encoding": "windows-1252",
  "algoVersion": 2,
  "cacheVersion": 2,
  "palindromes": [],
  "levidromes": [],
  "timing": {}
}
```

Then:

- On `GET /api/log`, compare metadata with the current file and return `{ exists, stale, content, timing, meta }`.
- Store caches in `data/.cache/<hash-of-relative-path>.json`, not next to sources.
- Make Refresh re-fetch the file, update both panels, and force recomputation.
- Bump `algoVersion` when the analysis logic changes; old caches invalidate automatically.

This single change fixes stale results, cross-file collisions, `.log` self-overwrite, and ensures the encoding fix actually takes effect after deployment.

---

### 4. Empty results are reported as “cache missing”

**Location:** `server/index.js:110`; `client/src/App.jsx:92-94`

```js
res.json({ content, exists: content.length > 0, timing: cachedTime });
```

If a valid log has zero palindromes or zero levidromes, `exists` is `false`. The client then re-runs the analysis and re-POSTs every time the file is opened, forever.

**Confirmed live:**

```text
POST /api/log with content ""  -> 200, log file created
GET  /api/log?source=audit_tmp.txt
     -> {"content":"","exists":false,"timing":"0.01"}
```

**Fix:** separate “the log exists and the key is present” from “the result is non-empty”:

```js
const key = type === 'levidrome' ? 'levidromes' : 'palindromes';
const items = Array.isArray(data[key]) ? data[key] : null;

res.json({
    exists: items !== null,
    count: items ? items.length : 0,
    content: (items || []).join('\n'),
    timing: cachedTime,
});
```

Then the client recomputes only when `!exists`, not when `count === 0`.

---

### 5. Client request race and ineffective double-click guard

**Location:** `client/src/App.jsx:41-103`

There is a guard at line 88, but state is written **before** it:

```js
setFileContent(content);                          // line 57 — unguarded
setLogContent(palLogData.content);                // line 71 — unguarded
setLevContent(levLogData.content);                // line 80 — unguarded
setExecutionTime(newExecutionTime);               // line 86 — unguarded
if (activeFileRef.current !== filename) return;   // line 88 — too late
```

**Failure sequence:**

1. Select large file A.
2. Quickly select small file B.
3. B finishes and renders.
4. A’s slow response arrives later, sets A’s content, then hits the guard and returns — but A’s state remains.

Result: the sidebar says **B**, while the Processor shows **A**. `scrollToWord` then searches A’s text against B’s offsets, producing wrong jumps or caught range errors.

The double-click guard is also inverted:

```js
if (activeFileRef.current === filename && !loading) return;
```

While a file is loading, `activeFileRef.current === filename` and `loading === true`, so a second click does **not** return and starts duplicate work. Conversely, after a failed load, `loading` is false and the same file cannot be retried by clicking it again.

**Fix:** use a monotonic request token and commit state once after all awaits:

```js
const requestRef = useRef(0);

const loadFile = async (filename, { force = false } = {}) => {
    const id = ++requestRef.current;
    setSelectedFile(filename);
    setLoading(true);
    setError(null);

    try {
        const [fileRes, palRes, levRes] = await Promise.all([
            fetch(`/api/file?path=${encodeURIComponent(filename)}`),
            fetch(`/api/log?source=${encodeURIComponent(filename)}`),
            fetch(`/api/log?source=${encodeURIComponent(filename)}&type=levidrome`),
        ]);

        if (id !== requestRef.current) return;
        if (!fileRes.ok || !palRes.ok || !levRes.ok) {
            throw new Error('Failed to load file data');
        }

        const [file, pal, lev] = await Promise.all([
            fileRes.json(),
            palRes.json(),
            levRes.json(),
        ]);

        if (id !== requestRef.current) return;

        // Commit all state only after every await and the guard.
        setFileContent(file.content);
        setLogContent(pal.content);
        setLevContent(lev.content);
        setExecutionTime({
            palindrome: pal.timing ? `Cached: ${pal.timing}ms` : 'Cached',
            levidrome: lev.timing ? `Cached: ${lev.timing}ms` : 'Cached',
        });

        if (force || !pal.exists || !lev.exists) {
            await processAnalysis(id, filename, file.content, !pal.exists, !lev.exists);
        }
    } catch (err) {
        if (id === requestRef.current) setError(String(err));
    } finally {
        if (id === requestRef.current) setLoading(false);
    }
};
```

Pass `id` into `processAnalysis` and compare `id !== requestRef.current` after each await. Add an `AbortController` so abandoned requests are cancelled. Add an explicit retry action, because a failed selection currently blocks retrying the same file.

---

### 6. Silent failures, including a confirmed 413

**Location:** `client/src/App.jsx:54-66`, `136-140`, `160-164`; `server/index.js:12`

The client never checks `res.ok`:

- A missing file returns 404 with `{error}`; the client reads `content || ''` and renders an **empty file** with “Found: 0”.
- A failed `/api/log` write is fire-and-forget. `fetch` only rejects on network errors, so **HTTP 413/500/403 all look like success**.
- `express.json()` defaults to a **100 kB** body limit.

**Confirmed live:** a 150 kB log POST returns:

```text
413 Payload Too Large
```

and the client would ignore it. The shipped largest log section is ~68 kB, so it works today, but a file with more palindromes will silently fail to cache.

The POSTs are not awaited, so closing the tab or navigating can drop the cache write entirely.

**Fix:**

```js
async function jsonOrThrow(res) {
    if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
    }
    return res.json();
}
```

- Await the POSTs and surface failures; add a retry.
- Either raise the JSON limit deliberately (`express.json({ limit: '2mb' })`) **or**, better, stop sending computed content from the client (see finding 10).
- Add a visible error state/toast. Never render an error response as an empty file.
- Use `navigator.sendBeacon` only if writes must survive page unload.

---

### 7. Unicode: astral characters and combining marks are handled incorrectly

**Location:** `client/src/utils/palindrome.js:23-35`; `client/src/utils/levidrome.js:35`

The code compares UTF-16 code units and reverses with `split('')`, both of which break astral-plane letters.

**Confirmed:**

```text
findPalindromes("𠀀𠀁𠀀")      -> []          // should match
findLevidromes("𠀀𠀁 𠀁𠀀")   -> []          // should match
findPalindromes("a\u0301a")     -> ["a\u0301a"] // false positive: "áa" is not a palindrome
```

The first two are false negatives caused by surrogate-pair comparison. The third is a false positive caused by treating a combining mark as an independent character.

This directly contradicts the “multilingual / any language” claim.

**Fix:** normalize and compare grapheme clusters:

```js
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const units = (s) =>
    [...segmenter.segment(s.normalize('NFC').toLowerCase())].map((x) => x.segment);

function isPalindrome(word) {
    const u = units(word);
    for (let i = 0, j = u.length - 1; i < j; i++, j--) {
        if (u[i] !== u[j]) return false;
    }
    return true;
}
```

For levidromes, reverse the grapheme array, not the code units:

```js
const reversed = units(word).reverse().join('');
```

Add tests for astral letters, combining marks, emoji (should be filtered), and RTL scripts. Note that full Unicode case folding (for example, Greek final sigma) still needs a documented policy.

---

## Medium-severity findings

### 8. Tokenization, punctuation, case duplicates, and phrase palindromes

**Location:** `client/src/utils/palindrome.js:12,20,38`; `client/src/utils/levidrome.js:12`

**Punctuation is inconsistent:**

```text
"(level)"  -> not detected
"level."   -> not detected
"#madam#"  -> detected
```

The split regex only separates on whitespace and commas, and the palindrome comparison includes punctuation. This means symbols can prevent detection or accidentally participate in it.

**Case variants are duplicated.** The `Set` stores the original word:

```text
"Racecar racecar RACECAR" -> ["Racecar", "racecar", "RACECAR"]
```

The shipped logs already contain duplicates:

```text
deutsch.log:  tat / Tat
OPTED-Dictionary.log: alla / Alla, ana / Ana, ...
Oxford English Dictionary.log: civic / Civic, deed / Deed, ...
swiss.log: tat / Tat
```

**Phrase palindromes are not detected.** `data/test.txt` contains:

```text
Step on no pets
Was it a car or a cat I saw
```

Neither appears in the cache. The app only checks individual tokens. If phrase-level auditing is intended, it is missing.

**Fix:**

- Choose and document a tokenization policy:
  - strip surrounding punctuation before comparison, but return the original token; or
  - require the token to be entirely alphanumeric.
- Deduplicate case-insensitively with a `Map<lower, original>`.
- Use one module-level collator instead of creating one per comparison:

```js
const collator = new Intl.Collator(undefined, {
    sensitivity: 'base',
    numeric: true,
});
return [...seen.values()].sort(collator.compare);
```

- Optional phrase mode: normalize a line, then use center expansion or Manacher’s algorithm to find palindromic substrings with a minimum length.

---

### 9. Result serialization with `<=>` and `|` is fragile

**Location:** `client/src/utils/levidrome.js:41,49`; `client/src/App.jsx:356-375`

LevIdrome results are strings like `"stop <=> pots"`, and the UI parses them with `split('<=>')`. A token containing the literal delimiter breaks that.

**Confirmed example:** the token `a<=>=<a` is a palindrome and is detected, but the UI splits it into `["a", "=<a"]` and searches only `"a"`.

Pair keys also use `|`:

```js
const pairKey = [lowerWord, reversed].sort().join('|');
```

Words containing `|` can produce colliding keys.

**Fix:** return structured data:

```js
// findLevidromes -> [{ a: 'stop', b: 'pots' }]
// findPalindromes -> [{ word: 'level', count: 3 }]
```

Then the UI never parses display strings, and keys are unambiguous.

---

### 10. Cache writes are non-atomic, unvalidated, and trusted

**Location:** `server/index.js:137-161`

Issues:

- `fs.writeFileSync` writes directly to the destination. A crash mid-write leaves invalid JSON; the next read treats it as empty, and the next write can wipe the other section.
- Parsed JSON is assumed to be an object. If it is `null`, `data.timing` throws. If it is an array, assignments are silently dropped by `JSON.stringify`.
- `type` is unvalidated (`server/index.js:129`), so a client can set `type=__proto__` or add arbitrary keys.
- `content` is assumed to be a string; a number or object throws.
- The server accepts client-computed results as truth. Combined with open CORS and all-interface binding, any origin on the network can poison caches.
- Read-modify-write is not concurrency-safe across multiple server processes. A single Node process with synchronous I/O serializes today, but that is accidental and will break if the I/O becomes async (which it should).

**Fix:**

- Write to `path + '.tmp'`, then `fs.renameSync(tmp, path)` (or the async equivalent).
- Validate with a small schema: object, arrays of strings, allowed `type` enum, string `content`, string/number `timing`.
- Serialize writes per cache key with a promise queue, or use `proper-lockfile` if multiple instances are possible.
- Best: compute on the server in a worker thread and let the client only read results. That removes the trust problem and the payload limit in one move. If client computation remains, require the source hash in the POST and reject mismatches.

---

### 11. Broken dependency declaration, scripts, lint, and production build

#### Dependencies

`server/package.json` does **not** list `iconv-lite` or `jschardet`, although `server/index.js` requires both. They exist only as root `devDependencies` and happen to be hoisted. `npm ci --omit=dev` or `cd server && npm install` leaves the server unable to start.

`body-parser` is listed but unused.

Confirmed with `npm ls --workspaces --depth=0`:

```text
server@1.0.0
+-- body-parser@2.2.2
+-- cors@2.8.6
`-- express@5.2.1
```

#### Launcher scripts

- `run_app.bat:42-43` and `stop_app.bat:27-28` run `taskkill /f /im node.exe`. That kills **every** Node process on the machine, including unrelated editors, dev servers, and agents.
- `findstr :8088` also matches ports such as `18088` and can kill the wrong process.
- `run_app.sh:14` uses `trap 'kill 0'`, which targets the entire process group and can kill the invoking shell.
- None of the launchers `cd` to the project directory first, so invoking them from elsewhere fails.

#### Lint

`client/package.json` has `"lint": "eslint ."`, but there is no `eslint.config.js`. Running it fails:

```text
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
```

#### Production build

`vite.config.js` sets `server.proxy`, but `vite preview` does not inherit it (`preview.proxy` is separate), and Express does not serve `client/dist`. The built app cannot reach `/api`.

#### Ports

`run_app.bat` / `run_app.sh` set `SERVER_PORT` and `CLIENT_PORT` only for messages and `netstat`; the server hard-codes `8088`, and Vite hard-codes `8089` in the script and proxy target. Change one and the system drifts.

**Fixes:**

- Move `iconv-lite` / `jschardet` to `server` dependencies; remove `body-parser` (and `cors` if CORS is removed).
- `cd /d "%~dp0"` in the `.bat`; `cd "$(dirname "$0")"` in the `.sh`.
- Never kill by image name. Store the PIDs you started, or use `concurrently --kill-others` and kill that process tree. On Windows, target `Get-NetTCPConnection -LocalPort 8088 -State Listen` and verify ownership.
- Add `client/eslint.config.js` (ESLint 9 flat config) and run it in CI.
- Add `strictPort: true` so Vite fails instead of silently moving to 8090.
- Serve `client/dist` from Express, or add `preview.proxy`. Use `process.env.PORT` and `VITE_API_TARGET`.
- Add `"engines": { "node": ">=20" }` and a `.nvmrc`.

---

### 12. UI blocks for seconds on large files; performance claims are inaccurate

**Location:** `client/src/App.jsx:106,116-165,318`; `DESIGN_PHILOSOPHY.md:10-11`

Measured against the shipped 16 MB `OPTED-Dictionary.txt` in Node:

```text
palindromes: 1,618 ms
levidromes:  2,921 ms
```

`yieldToMain()` only waits 50 ms before and after each task; it does not yield during the computation. The browser UI is blocked for roughly 4.5 seconds.

The docs claim:

- “16MB … processed in milliseconds” (`DESIGN_PHILOSOPHY.md:10`) — false.
- “virtualized layouts” (`DESIGN_PHILOSOPHY.md:11`, `CODE_DOCUMENTATION.md:11`) — there is no virtualization.
- `<pre>{fileContent}</pre>` (`App.jsx:318`) creates one enormous text node for a 16 MB file.

**Fix:**

- Move both algorithms to a **Web Worker** (or compute server-side in `worker_threads`). Transfer the text once and receive results.
- Disable Refresh while a computation is running; use a request token for cancellation.
- Virtualize or cap the Viewer list; 5,000 result rows with buttons are also heavy. `content-visibility: auto` can help, but true virtualization is better.
- Use `ResizeObserver` for the scroll mirror. The current effect only reacts to `fileContent` (`App.jsx:233-237`), so sidebar resizing and font loading leave the mirror height stale.

---

## Smaller issues and cleanups

### Client

- **Dead health-check feature.** `serverStatus` is set in `App.jsx:17,20-31` but never rendered. `.server-warning-overlay` / `.warning-box` exist in `App.css:438-480` but are unused. Either implement the “outdated server” overlay (the CSS is already there) or remove both. Currently an incompatible server is silently accepted.
- **Refresh cannot refresh an empty file.** `if (!selectedFile || !fileContent) return` (`App.jsx:169`) means a zero-byte file cannot be re-audited.
- **`levidromeToggleMap` is never reset.** Switching files keeps toggles keyed by old result strings (`App.jsx:12,41-50`). Clear it on file change and prune stale entries.
- **Navigation only finds the first occurrence.** `scrollToWord` uses `regex.exec` once (`App.jsx:190`). Add occurrence cycling and a “1/N” counter; important for dictionaries with repeated words.
- **`key={idx}` for results** (`App.jsx:351`) can reuse DOM incorrectly when the list changes. Use a stable key (`item.word` / pair key) once results are structured.
- **Dead code.** `times` in `processAnalysis` (`App.jsx:114,131`) is assigned but never read. `handleRefresh` also sets `loading` false even if another load started. Remove the dead variable and use the request-token pattern.
- **Result list size.** `currentList` maps every result to a row with a button. Thousands of rows are heavy; virtualize or paginate.
- **No user-visible errors.** Every failure goes to `console.error` (`App.jsx:36,97,174`); the app looks empty instead of broken.
- **No server-down state.** If `/api/files` fails, the Explorer is silently empty.
- **No file-list refresh.** Files added externally are not discoverable without reloading the page.
- **`viewMode` persists across files**; probably desired, but worth confirming.
- **`loading` is a single boolean** for potentially concurrent operations; use a request token or counter.
- **Stale cache is invisible.** Add a “cached / recomputed / stale” indicator.
- **Detected encoding is invisible.** Add an encoding badge and an override selector.

### Accessibility and styling

- Clickable `<li>` file rows (`App.jsx:259-270`) are not keyboard accessible. Use `<button>` or add `role="button"`, `tabIndex`, and key handling.
- Tabs lack `role="tablist"`, `role="tab"`, and `aria-selected` (`App.jsx:328-339`).
- The 🎯 buttons need `aria-label`; `title` alone is not reliable for screen readers (`App.jsx:353-379`).
- The loading overlay needs `role="status"` / `aria-live`.
- Add `:focus-visible` styles.
- Add `prefers-reduced-motion` handling for the infinite background animation, spinner, and pulsing warning.
- Use `100dvh` instead of `100vh` for mobile browsers.
- The layout has no small-screen breakpoint; a 240 px minimum sidebar plus fixed `100vw` will overflow.
- Google Fonts are loaded over the network, which conflicts with the “local-only” positioning; self-host or rely on system fonts.
- The favicon is still Vite (`client/index.html:5`, `client/public/vite.svg`).

### Server

- `app.listen` has no `EADDRINUSE` handler and no graceful shutdown.
- `fs.mkdirSync(ROOT_DIR)` is not recursive (`server/index.js:23-25`).
- `/api/files` 500s the whole listing if one entry disappears during `statSync`, and it follows symlinks. Use `readdirSync(..., { withFileTypes: true })`, wrap per-entry stats, and sort by name.
- File filtering is case-sensitive: `*.LOG` would not be excluded.
- Binary files are listed and offered for reading; a binary “text” response can produce NULs and enormous garbage. Restrict by extension or content sniff.
- `/api/file` returns the entire file as JSON; a 16 MB file becomes a larger escaped JSON string. Serve `text/plain; charset=...` and stream it, or cap the size.
- `iconv.decode` can throw if `jschardet` returns an unsupported encoding. Validate with `iconv.encodingExists`.
- No input validation for query/body types. `?path=a&path=b` yields an array and `.replace` throws. Validate `typeof === 'string'`.
- `GET /api/log` treats malformed JSON as an empty cache rather than reporting corruption; the next POST may overwrite it.
- `POST /api/log` can reset a corrupt cache and lose the other section.
- `type` should be an enum; arbitrary keys also permit `__proto__` assignment.
- `content` should be a string; `timing` should be a string or number.
- Errors return 500 for client mistakes and leak paths.
- No 404 JSON handler and no centralized error middleware. Malformed JSON requests return an HTML error page.
- Each log request writes to `console.log`, which is noisy. Use structured logging or remove it.
- `cors` is unnecessary when using the Vite proxy; removing it reduces exposure.
- Add `app.disable('x-powered-by')` and, if serving static assets, security headers.

### Python generator

`century_dates/generate_dates.py` is logically correct. I verified that every 12- and 14-digit line is a palindrome and every time is valid:

```text
non-palindrome 12/14 lines: 0
invalid times: 0
```

Minor issues:

- `open(output_path, 'w')` uses the platform default encoding and newline. Use `encoding='utf-8', newline='\n'`.
- There is one duplicate, `891213`, because 1989 and 2089 share the two-digit year. Use a `set` or document it.
- The comment says “20th and 21st centuries”, but 1989–2089 crosses parts of three centuries.
- `hhmmss_candidate_8` is actually a 6-digit string; rename it for clarity.
- Add CLI arguments for the date range instead of hard-coding it.

### Documentation drift

- `CONTRIBUTING.md:22-23` says `npm start` (does not exist; use `npm run dev`) and suggests `cd client && npm install` (workspaces make the root install sufficient).
- `README.md:14` says “atomic-cached” (writes are not atomic).
- `CODE_DOCUMENTATION.md:11` says “virtualized layouts” (none).
- `DESIGN_PHILOSOPHY.md:10` claims milliseconds (measured seconds).
- `README.md:16` advertises “real-time monitoring”, but the health result is never displayed.
- `CODE_DOCUMENTATION.md:32` implies the palindrome function supports configurable delimiters; it does not.
- Document the tokenization policy: punctuation handling, case folding, phrase support, and single-character exclusion.

### Repository hygiene

- `data/` is 40.3 MB. All `.log` caches are tracked (`git ls-files data` lists both `.txt` and `.log`).
- `.gitignore:31` has `# *.log` commented out.
- Tracking caches means stale or corrupt caches survive code fixes. Ignore `data/*.log` and `data/.cache/`, remove them from the index, and regenerate.
- Consider Git LFS or a download script for the large dictionaries.
- Root `package.json` has no `license`; `server/package.json` says `ISC` while the project is GPLv3. Set `GPL-3.0-only` consistently.
- `client/` contains unused Vite scaffold files: `src/main.ts`, `src/counter.ts`, `src/style.css`, `src/typescript.svg`, `tsconfig.json`, and `public/vite.svg`. Remove them or commit to TypeScript.
- Mixed formatting and quote styles; add Prettier and an `.editorconfig`.
- No CI workflow.

### Testing

There are no tests. `server/package.json` has a placeholder test script.

Add Vitest + React Testing Library for the client and supertest for the server. Minimum coverage:

- Palindromes: empty, single char, digits, case-insensitive, punctuation policy, astral letters, combining marks, case-variant dedupe, sorting.
- Levidromes: both words present, only one present, palindrome excluded, case differences, astral letters, long tokens, `<=>` and `|` in tokens.
- Server: traversal attempts, symlink escape, empty-result cache, stale fingerprint, UTF-8 log round-trip with `ñ`/`ø`, malformed cache JSON, 413 payload, concurrent writes, input type validation.
- Client: out-of-order file loads (A then B), retry after a failed load, error rendering, URL encoding of filenames with `&`, `#`, `%`, and spaces.
- Generator: all 12/14-digit lines are palindromic; no duplicate output.

---

## Suggested architecture improvements

1. **Extract the pure algorithms into a shared module** used by both client and server. Today they live only in `client/src/utils`, which is why the server cannot compute results itself.
2. **Compute server-side in a `worker_threads` worker.** The server already owns the files and cache. This removes:
   - the 100 kB POST limit,
   - client-trusted cache content,
   - the need to ship 16 MB of results through the browser to be recomputed,
   - duplicated cache logic.

   The client would fetch `/api/file` for display and `/api/analysis?source=...` for results. If you prefer client compute, use a Web Worker and keep the server as a verified cache.
3. **Split `App.jsx`** into `FileExplorer`, `SourceViewer`, `AnalysisViewer`, and hooks such as `useFileAnalysis` and `useScrollSync`.
4. **Split `server/index.js`** into `lib/paths.js`, `lib/encoding.js`, `lib/cache.js`, and route modules. Add a small schema validator.
5. **Return structured result objects** from the algorithms instead of display strings. This removes delimiter parsing, key collisions, and the need to re-split pairs in the UI.
6. **Add a status bar** showing server health, detected encoding, cache state (fresh/stale), and source fingerprint. This turns invisible integrity problems into visible ones.
7. **Add JSDoc or migrate to TypeScript.** `tsconfig.json` already exists but is unused; either use it or remove it.

---

## Suggested implementation order

1. **Security/correctness:** fix `safePath`, bind localhost, restrict/remove CORS, stop leaking paths.
2. **Encoding:** normalize datasets to UTF-8; strict UTF-8 + BOM + `windows-1252` fallback; read/write logs as UTF-8; regenerate all caches.
3. **Cache integrity:** add source fingerprint + cache directory + `exists`/`stale` semantics; make Refresh re-fetch; invalidate on algorithm/encoding change.
4. **Client reliability:** request tokens/abort, `res.ok` handling, URL encoding, await writes, visible errors and retry.
5. **Unicode:** grapheme-aware comparison/reversal, NFC, case-insensitive dedupe; add tests.
6. **Robustness:** atomic writes, schema validation, input validation, per-key write queue; move analysis to a worker/server worker.
7. **Tooling:** fix dependencies, lint config, launcher scripts, production serving, env ports; add tests and CI.
8. **Polish:** structured result objects, occurrence cycling, virtualization, accessibility, docs accuracy, repo hygiene.

Items 1–5 are the ones I would not ship without. Items 1, 2, 3, 4, and 6 are observable in the current app; items 7–8 are quality and maintainability work.

---

## Appendix: verification commands and results

### Path traversal

```text
GET /api/file?path=../data-evil/secret.txt
-> {"content":"SECRET-OUTSIDE-DATA\r\n"}
```

### Empty cache loop

```text
POST /api/log {"source":"audit_tmp.txt","content":"","timing":"0.01"}  -> 200
GET  /api/log?source=audit_tmp.txt
-> {"content":"","exists":false,"timing":"0.01"}
```

### Payload limit

```text
POST /api/log with a 150 kB content field
-> 413 Payload Too Large
```

### Encoding

```text
norsk.txt detected as windows-1251:
  dшl <=> lшd  (should be døl <=> lød)
  dеd, dшd, rеr, rшr ... (should be dåd, død, rår, rør ...)

italiano.txt detected as ISO-8859-2:
  0xE0 decoded as ŕ (should be à)

espanol.log:
  stored:       eĂąe
  via detector: eÄ\x82Ä\x85e
  source:       eñe
```

### Unicode

```text
findPalindromes("𠀀𠀁𠀀")      -> []
findLevidromes("𠀀𠀁 𠀁𠀀")   -> []
findPalindromes("a\u0301a")     -> ["a\u0301a"]
```

### Performance

```text
OPTED-Dictionary.txt (16 MB)
palindromes: 1,618 ms
levidromes:  2,921 ms
```

### Lint

```text
> eslint .
ESLint couldn't find an eslint.config.(js|mjs|cjs) file.
```

### Dependencies

```text
server@1.0.0
+-- body-parser@2.2.2
+-- cors@2.8.6
`-- express@5.2.1
```

`iconv-lite` and `jschardet` are only present as root `devDependencies`.

### Generator correctness

```text
counts by length: { 6: 36526, 8: 36526, 12: 4560, 14: 540 }
total: 78152, unique: 78151
non-palindrome 12/14 lines: 0
invalid times: 0
duplicate: 891213
```
