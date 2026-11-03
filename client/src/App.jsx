import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SERVER_VERSION } from '../../shared/version.mjs';
import { computeAnalysis, getAnalysis, getFile, getHealth, listFiles } from './api';
import { findOccurrence } from './utils/search';
import {
    AlertIcon,
    ArrowRightLeftIcon,
    CloseIcon,
    DatabaseIcon,
    FileIcon,
    LogoIcon,
    RefreshIcon,
    SearchIcon,
    ServerIcon,
    TargetIcon,
} from './components/Icons.jsx';
import './App.css';

const PAGE_SIZE = 500;
const ENCODINGS = [
    { value: 'auto', label: 'Auto-detect' },
    { value: 'utf-8', label: 'UTF-8' },
    { value: 'windows-1252', label: 'Windows-1252 / Latin-1' },
    { value: 'macintosh', label: 'Mac Roman' },
    { value: 'windows-1250', label: 'Windows-1250' },
    { value: 'iso-8859-2', label: 'ISO-8859-2' },
    { value: 'windows-1251', label: 'Windows-1251' },
    { value: 'utf-16le', label: 'UTF-16 LE' },
    { value: 'utf-16be', label: 'UTF-16 BE' },
];

function timingLabel(value, cached) {
    if (typeof value !== 'number') return null;
    return cached ? `Cached · ${value}ms` : `${value}ms`;
}

function statusTone(value) {
    if (!value) return 'neutral';
    if (value.startsWith('Cache stale')) return 'warning';
    if (value === 'Cached' || value === 'Recomputed' || value === 'Done') return 'success';
    if (value.startsWith('No exact') || value.startsWith('Could not')) return 'warning';
    return 'info';
}

function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function matchesResult(item, viewMode, query) {
    if (!query) return true;
    if (viewMode === 'palindrome') return item.word.toLowerCase().includes(query);
    return item.a.toLowerCase().includes(query) || item.b.toLowerCase().includes(query);
}

function App() {
    const [files, setFiles] = useState([]);
    const [filesState, setFilesState] = useState('loading');
    const [filesError, setFilesError] = useState(null);
    const [fileQuery, setFileQuery] = useState('');

    const [selectedFile, setSelectedFile] = useState(null);
    const [fileContent, setFileContent] = useState('');
    const [fileMeta, setFileMeta] = useState(null);
    const [results, setResults] = useState({ palindromes: [], levidromes: [] });
    const [timings, setTimings] = useState({});
    const [viewMode, setViewMode] = useState('palindrome');
    const [encoding, setEncoding] = useState('auto');
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [navState, setNavState] = useState({});
    const [resultQuery, setResultQuery] = useState('');

    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [error, setError] = useState(null);

    const [health, setHealth] = useState('checking');
    const [healthDetail, setHealthDetail] = useState(null);

    const requestRef = useRef(0);
    const abortRef = useRef(null);
    const navRef = useRef({});
    const processorRef = useRef(null);
    const mirrorRef = useRef(null);
    const fileFilterRef = useRef(null);
    const resultFilterRef = useRef(null);
    const palindromeTabRef = useRef(null);
    const levidromeTabRef = useRef(null);
    const [scrollHeight, setScrollHeight] = useState(0);

    const checkHealth = useCallback(async () => {
        setHealth('checking');
        try {
            const data = await getHealth();
            if (data.version !== SERVER_VERSION) {
                setHealth('outdated');
                setHealthDetail(data);
            } else {
                setHealth('ok');
                setHealthDetail(null);
            }
        } catch (err) {
            setHealth('offline');
            setHealthDetail(err.message);
        }
    }, []);

    const loadFiles = useCallback(async () => {
        setFilesState('loading');
        setFilesError(null);
        try {
            const data = await listFiles();
            setFiles(data.files || []);
            setFilesState('ready');
        } catch (err) {
            setFilesState('error');
            setFilesError(err.message);
        }
    }, []);

    useEffect(() => {
        checkHealth();
        loadFiles();
    }, [checkHealth, loadFiles]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const loadFile = useCallback(
        async (filename, { force = false, encodingOverride = encoding } = {}) => {
            const requestId = requestRef.current + 1;
            requestRef.current = requestId;
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;

            setSelectedFile(filename);
            setLoading(true);
            setError(null);
            setStatus(force ? 'Recomputing…' : 'Loading…');
            setFileContent('');
            setFileMeta(null);
            setResults({ palindromes: [], levidromes: [] });
            setTimings({});
            setNavState({});
            navRef.current = {};
            setResultQuery('');
            setVisibleCount(PAGE_SIZE);

            try {
                const file = await getFile(filename, encodingOverride, controller.signal);
                if (requestId !== requestRef.current) return;

                setFileContent(file.content ?? '');
                setFileMeta(file);

                let analysis = null;
                if (!force) {
                    setStatus('Checking cache…');
                    analysis = await getAnalysis(filename, file.encoding, controller.signal);
                    if (requestId !== requestRef.current) return;

                    if (analysis.exists && analysis.fresh) {
                        setResults({
                            palindromes: analysis.palindromes,
                            levidromes: analysis.levidromes,
                        });
                        setTimings(analysis.timing || {});
                        setStatus('Cached');
                        return;
                    }

                    if (analysis.stale) {
                        setStatus('Cache stale — recomputing…');
                    }
                }

                setStatus('Analyzing…');
                const computed = await computeAnalysis(
                    filename,
                    file.encoding,
                    force || Boolean(analysis?.stale),
                    controller.signal,
                );
                if (requestId !== requestRef.current) return;

                setResults({
                    palindromes: computed.palindromes,
                    levidromes: computed.levidromes,
                });
                setTimings(computed.timing || {});
                setStatus(
                    analysis?.stale ? 'Recomputed' : computed.cached ? 'Cached' : 'Done',
                );
            } catch (err) {
                if (err.name === 'AbortError' || requestId !== requestRef.current) return;
                setError(err.message || String(err));
                setStatus('');
            } finally {
                if (requestId === requestRef.current) setLoading(false);
            }
        },
        [encoding],
    );

    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [selectedFile, viewMode, results, resultQuery]);

    useEffect(() => {
        const container = processorRef.current;
        if (!container) return undefined;

        const update = () => setScrollHeight(container.scrollHeight);
        update();

        let observer;
        if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(update);
            observer.observe(container);
            const pre = container.querySelector('pre');
            if (pre) observer.observe(pre);
        }

        window.addEventListener('resize', update);
        return () => {
            if (observer) observer.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [fileContent, selectedFile]);

    useEffect(() => {
        const handleShortcut = (event) => {
            if (!selectedFile || event.defaultPrevented) return;
            if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;

            const target = event.target;
            const typing =
                target instanceof HTMLElement &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    target.isContentEditable);
            if (typing) return;

            event.preventDefault();
            resultFilterRef.current?.focus();
        };

        window.addEventListener('keydown', handleShortcut);
        return () => window.removeEventListener('keydown', handleShortcut);
    }, [selectedFile]);

    const handleProcessorScroll = (event) => {
        if (
            mirrorRef.current &&
            Math.abs(mirrorRef.current.scrollTop - event.currentTarget.scrollTop) > 1
        ) {
            mirrorRef.current.scrollTop = event.currentTarget.scrollTop;
        }
    };

    const handleMirrorScroll = (event) => {
        if (
            processorRef.current &&
            Math.abs(processorRef.current.scrollTop - event.currentTarget.scrollTop) > 1
        ) {
            processorRef.current.scrollTop = event.currentTarget.scrollTop;
        }
    };

    const handleFileSelect = (filename) => {
        if (filename === selectedFile && loading) return;
        if (filename === selectedFile && !error) return;
        loadFile(filename);
    };

    const handleRefresh = () => {
        if (!selectedFile || loading) return;
        loadFile(selectedFile, { force: true, encodingOverride: encoding });
    };

    const handleEncodingChange = (event) => {
        const nextEncoding = event.target.value;
        setEncoding(nextEncoding);
        if (selectedFile) {
            loadFile(selectedFile, { force: false, encodingOverride: nextEncoding });
        }
    };

    const handleRetry = () => {
        if (!selectedFile) return;
        loadFile(selectedFile, { force: false, encodingOverride: encoding });
    };

    const retryConnection = () => {
        checkHealth();
        loadFiles();
    };

    const clearFileFilter = () => {
        setFileQuery('');
        fileFilterRef.current?.focus();
    };

    const clearResultFilter = () => {
        setResultQuery('');
        resultFilterRef.current?.focus();
    };

    const focusTab = (next) => {
        setViewMode(next);
        requestAnimationFrame(() => {
            const target = next === 'palindrome' ? palindromeTabRef : levidromeTabRef;
            target.current?.focus();
        });
    };

    const handleTabKeyDown = (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        focusTab(viewMode === 'palindrome' ? 'levidrome' : 'palindrome');
    };

    const scrollToRange = (charIndex, length) => {
        const container = processorRef.current;
        const pre = container?.querySelector('pre');
        const textNode = pre?.firstChild;

        if (!container || !textNode || textNode.nodeType !== 3) return;

        try {
            const range = document.createRange();
            range.setStart(textNode, charIndex);
            range.setEnd(textNode, Math.min(charIndex + length, fileContent.length));

            const selection = window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                selection.addRange(range);
            }

            const rect = range.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            container.scrollTo({
                top: container.scrollTop + (rect.top - containerRect.top) - containerRect.height / 2,
                left: container.scrollLeft + (rect.left - containerRect.left) - containerRect.width / 2,
                behavior: 'auto',
            });
        } catch (err) {
            setStatus(`Could not navigate: ${err.message}`);
        }
    };

    const handleNavigate = (key, word) => {
        const requested = navRef.current[key]?.next ?? 0;
        const found = findOccurrence(fileContent, word, requested);

        if (found.total === 0) {
            setStatus(`No exact match for "${word}"`);
            return;
        }

        scrollToRange(found.index, found.length);
        const next = (found.occurrence + 1) % found.total;
        navRef.current[key] = { next };
        setNavState((previous) => ({
            ...previous,
            [key]: { occurrence: found.occurrence + 1, total: found.total },
        }));
        setStatus(`"${word}": occurrence ${found.occurrence + 1} of ${found.total}`);
    };

    const currentList = useMemo(
        () => (viewMode === 'palindrome' ? results.palindromes : results.levidromes),
        [results, viewMode],
    );

    const filteredList = useMemo(() => {
        const query = resultQuery.trim().toLowerCase();
        if (!query) return currentList;
        return currentList.filter((item) => matchesResult(item, viewMode, query));
    }, [currentList, resultQuery, viewMode]);

    const filteredFiles = useMemo(() => {
        const query = fileQuery.trim().toLowerCase();
        if (!query) return files;
        return files.filter((file) => file.name.toLowerCase().includes(query));
    }, [files, fileQuery]);

    const visibleItems = filteredList.slice(0, visibleCount);
    const remaining = filteredList.length - visibleItems.length;
    const currentTiming = timings[viewMode];
    const timing = timingLabel(currentTiming, status === 'Cached');
    const tone = statusTone(status);
    const sizeLabel = formatBytes(fileMeta?.size);
    const modified = fileMeta?.mtimeMs ? new Date(fileMeta.mtimeMs) : null;

    return (
        <div className="app-container">
            <a className="skip-link" href="#main-content">
                Skip to main content
            </a>

            <aside className="sidebar" aria-label="File explorer">
                <div className="brand">
                    <span className="brand-mark" aria-hidden="true">
                        <LogoIcon />
                    </span>
                    <div className="brand-text">
                        <h1>
                            Palindrome <span>Checker</span>
                        </h1>
                        <p>Symmetry audit console</p>
                    </div>
                </div>

                <div className="sidebar-toolbar">
                    <div className="search-field">
                        <SearchIcon />
                        <input
                            ref={fileFilterRef}
                            type="search"
                            value={fileQuery}
                            onChange={(event) => setFileQuery(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Escape') clearFileFilter();
                            }}
                            placeholder="Filter files"
                            aria-label="Filter files"
                        />
                        {fileQuery && (
                            <button
                                type="button"
                                className="search-clear"
                                onClick={clearFileFilter}
                                aria-label="Clear file filter"
                            >
                                <CloseIcon />
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={loadFiles}
                        disabled={filesState === 'loading'}
                        aria-label="Refresh file list"
                        title="Refresh file list"
                    >
                        <RefreshIcon />
                    </button>
                </div>

                <div className="sidebar-section">
                    <span>Files</span>
                    <span>
                        {filteredFiles.length} / {files.length}
                    </span>
                </div>

                {filesState === 'loading' && (
                    <p className="sidebar-note" role="status">
                        Loading files…
                    </p>
                )}

                {filesState === 'error' && (
                    <div className="sidebar-note error" role="alert">
                        <span>Could not load files: {filesError}</span>
                        <button type="button" className="inline-link" onClick={loadFiles}>
                            Retry
                        </button>
                    </div>
                )}

                <ul className="file-list">
                    {filteredFiles.map((file) => (
                        <li key={file.name}>
                            <button
                                type="button"
                                className={`file-row ${selectedFile === file.name ? 'active' : ''}`}
                                onClick={() => handleFileSelect(file.name)}
                                aria-current={selectedFile === file.name ? 'true' : undefined}
                                title={file.name}
                            >
                                <span className="file-icon" aria-hidden="true">
                                    <FileIcon />
                                </span>
                                <span className="file-info">
                                    <span className="file-name">{file.name}</span>
                                </span>
                            </button>
                        </li>
                    ))}

                    {filesState === 'ready' && files.length === 0 && (
                        <li className="sidebar-empty">No files in the data directory.</li>
                    )}

                    {filesState === 'ready' && files.length > 0 && filteredFiles.length === 0 && (
                        <li className="sidebar-empty">No files match “{fileQuery}”.</li>
                    )}
                </ul>

                <div className="sidebar-footer">
                    <div className="sidebar-footer-brand">
                        <p>Palindrome Checker</p>
                        <small>Created with 🧠, ☕ &amp; 🤖 by krishnakanthb</small>
                    </div>
                    <div className="sidebar-footer-row">
                        <span>Protocol</span>
                        <span className="version-badge">v{SERVER_VERSION}</span>
                    </div>
                    <div className="sidebar-footer-row">
                        <span>Data</span>
                        <span>local only</span>
                    </div>
                </div>
            </aside>

            <main id="main-content" className="main-content" aria-busy={loading} tabIndex={-1}>
                {error && (
                    <div className="error-banner" role="alert">
                        <span className="error-message">
                            <AlertIcon />
                            <span>{error}</span>
                        </span>
                        <button
                            type="button"
                            className="btn"
                            onClick={handleRetry}
                            disabled={!selectedFile || loading}
                        >
                            Retry
                        </button>
                        <button
                            type="button"
                            className="icon-btn ghost"
                            onClick={() => setError(null)}
                            aria-label="Dismiss error"
                            title="Dismiss error"
                        >
                            <CloseIcon />
                        </button>
                    </div>
                )}

                {!selectedFile ? (
                    <div className="empty-state">
                        <div className="empty-visual" aria-hidden="true">
                            <LogoIcon />
                        </div>
                        <h1>Audit text for symmetry</h1>
                        <p>
                            Select a source from the explorer to detect palindromes and levidromes
                            without anything leaving your machine.
                        </p>
                        <div className="empty-hints">
                            <span className="empty-hint">
                                <FileIcon />
                                Local files
                            </span>
                            <span className="empty-hint">
                                <DatabaseIcon />
                                Fingerprinted cache
                            </span>
                            <span className="empty-hint">
                                <TargetIcon />
                                Range navigation
                            </span>
                        </div>
                        <button
                            type="button"
                            className="btn"
                            onClick={() => fileFilterRef.current?.focus()}
                        >
                            <SearchIcon />
                            Find a file
                        </button>
                    </div>
                ) : (
                    <div className="workspace">
                        <div className="workspace-header">
                            <div className="file-heading">
                                <span className="file-glyph" aria-hidden="true">
                                    <FileIcon />
                                </span>
                                <div className="file-heading-text">
                                    <h2 title={selectedFile}>{selectedFile}</h2>
                                    <div className="file-heading-meta">
                                        {sizeLabel && <span>{sizeLabel}</span>}
                                        {fileMeta?.encoding && (
                                            <>
                                                <span aria-hidden="true">·</span>
                                                <span>{fileMeta.encoding}</span>
                                            </>
                                        )}
                                        {modified && Number.isFinite(modified.getTime()) && (
                                            <>
                                                <span aria-hidden="true">·</span>
                                                <time dateTime={modified.toISOString()}>
                                                    {modified.toLocaleDateString()}
                                                </time>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="header-controls">
                                <label className="encoding-select">
                                    <DatabaseIcon />
                                    <span className="sr-only">Source encoding</span>
                                    <select
                                        value={encoding}
                                        onChange={handleEncodingChange}
                                        disabled={loading}
                                        title="Source encoding"
                                    >
                                        {ENCODINGS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                {status && (
                                    <span
                                        className={`status-pill status-${tone}`}
                                        role="status"
                                        aria-live="polite"
                                    >
                                        {status}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    className="btn primary"
                                    onClick={handleRefresh}
                                    disabled={loading}
                                    title="Re-read the source and recalculate both analyses"
                                >
                                    <RefreshIcon />
                                    Recompute
                                </button>
                            </div>
                        </div>

                        <div className="split-view">
                            <section className="panel processor-panel" aria-label="Source viewer">
                                <header className="panel-header">
                                    <div className="panel-title">
                                        <h3>
                                            <FileIcon />
                                            Source
                                        </h3>
                                        <span className="panel-hint">
                                            Select a target in Results to jump to it
                                        </span>
                                    </div>
                                    <div className="header-controls">
                                        {timing && <span className="badge accent">{timing}</span>}
                                        {fileMeta?.encoding && (
                                            <span className="badge">{fileMeta.encoding}</span>
                                        )}
                                    </div>
                                </header>

                                <div className="dual-scrollbar-layout">
                                    <div
                                        className="scrollbar-mirror"
                                        ref={mirrorRef}
                                        onScroll={handleMirrorScroll}
                                        aria-hidden="true"
                                    >
                                        <div
                                            style={{ height: `${scrollHeight}px`, width: '1px' }}
                                        ></div>
                                    </div>
                                    <div
                                        className="content-area"
                                        ref={processorRef}
                                        onScroll={handleProcessorScroll}
                                    >
                                        <pre>{fileContent}</pre>
                                    </div>
                                </div>
                            </section>

                            <section
                                className="panel viewer-panel"
                                id="viewer-panel"
                                role="tabpanel"
                                aria-labelledby={`tab-${viewMode}`}
                            >
                                <header className="panel-header">
                                    <div className="panel-title">
                                        <h3>
                                            <TargetIcon />
                                            Results
                                        </h3>
                                        <span className="panel-hint">
                                            Press / to filter this list
                                        </span>
                                    </div>

                                    <div className="tabs" role="tablist" aria-label="Analysis view">
                                        <button
                                            type="button"
                                            role="tab"
                                            ref={palindromeTabRef}
                                            id="tab-palindrome"
                                            aria-selected={viewMode === 'palindrome'}
                                            aria-controls="viewer-panel"
                                            tabIndex={viewMode === 'palindrome' ? 0 : -1}
                                            className={`tab-btn ${viewMode === 'palindrome' ? 'active' : ''}`}
                                            onClick={() => setViewMode('palindrome')}
                                            onKeyDown={handleTabKeyDown}
                                        >
                                            Palindromes
                                            <span className="tab-count">
                                                {results.palindromes.length}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            role="tab"
                                            ref={levidromeTabRef}
                                            id="tab-levidrome"
                                            aria-selected={viewMode === 'levidrome'}
                                            aria-controls="viewer-panel"
                                            tabIndex={viewMode === 'levidrome' ? 0 : -1}
                                            className={`tab-btn ${viewMode === 'levidrome' ? 'active' : ''}`}
                                            onClick={() => setViewMode('levidrome')}
                                            onKeyDown={handleTabKeyDown}
                                        >
                                            Levidromes
                                            <span className="tab-count">
                                                {results.levidromes.length}
                                            </span>
                                        </button>
                                    </div>
                                </header>

                                <div className="viewer-toolbar">
                                    <div className="search-field">
                                        <SearchIcon />
                                        <input
                                            ref={resultFilterRef}
                                            type="search"
                                            value={resultQuery}
                                            onChange={(event) => setResultQuery(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Escape') clearResultFilter();
                                            }}
                                            placeholder="Filter results ( / )"
                                            aria-label="Filter results"
                                        />
                                        {resultQuery && (
                                            <button
                                                type="button"
                                                className="search-clear"
                                                onClick={clearResultFilter}
                                                aria-label="Clear result filter"
                                            >
                                                <CloseIcon />
                                            </button>
                                        )}
                                    </div>
                                    <span className="badge">
                                        Showing {visibleItems.length} of {filteredList.length}
                                    </span>
                                    {resultQuery && (
                                        <span className="badge">
                                            Total {currentList.length}
                                        </span>
                                    )}
                                </div>

                                <div className="horizontal-scroll-view">
                                    {!loading && filteredList.length === 0 ? (
                                        <div className="viewer-empty">
                                            {currentList.length === 0 ? (
                                                <>
                                                    <strong>No {viewMode}s found.</strong>
                                                    <span>
                                                        Try another file or change the source
                                                        encoding.
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <strong>
                                                        No results match “{resultQuery}”.
                                                    </strong>
                                                    <button
                                                        type="button"
                                                        className="inline-link"
                                                        onClick={clearResultFilter}
                                                    >
                                                        Clear filter
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ) : (
                                        <ul
                                            className="columns-container"
                                            aria-label={`${viewMode} results`}
                                        >
                                            {visibleItems.map((item) => {
                                                if (viewMode === 'palindrome') {
                                                    const key = `p:${item.word}`;
                                                    const nav = navState[key];

                                                    return (
                                                        <li key={key} className="result-item">
                                                            <span className="result-word">
                                                                {item.word}
                                                            </span>
                                                            {item.count > 1 && (
                                                                <span
                                                                    className="count-badge"
                                                                    title={`${item.count} occurrences`}
                                                                >
                                                                    ×{item.count}
                                                                </span>
                                                            )}
                                                            {nav && (
                                                                <span
                                                                    className="occurrence-count"
                                                                    aria-label={`Occurrence ${nav.occurrence} of ${nav.total}`}
                                                                >
                                                                    {nav.occurrence}/{nav.total}
                                                                </span>
                                                            )}
                                                            <button
                                                                type="button"
                                                                className="nav-btn"
                                                                onClick={() =>
                                                                    handleNavigate(key, item.word)
                                                                }
                                                                title={`Find "${item.word}" in source`}
                                                                aria-label={`Find "${item.word}" in source`}
                                                            >
                                                                <TargetIcon />
                                                            </button>
                                                        </li>
                                                    );
                                                }

                                                const key = `l:${JSON.stringify([item.a, item.b])}`;
                                                const aKey = `${key}:a`;
                                                const bKey = `${key}:b`;
                                                const aNav = navState[aKey];
                                                const bNav = navState[bKey];

                                                return (
                                                    <li
                                                        key={key}
                                                        className="result-item levidrome-item"
                                                    >
                                                        <button
                                                            type="button"
                                                            className="nav-btn"
                                                            onClick={() =>
                                                                handleNavigate(aKey, item.a)
                                                            }
                                                            title={`Find "${item.a}" in source`}
                                                            aria-label={`Find "${item.a}" in source`}
                                                        >
                                                            <TargetIcon />
                                                        </button>
                                                        <span className="result-word">
                                                            {item.a}
                                                        </span>
                                                        {aNav && (
                                                            <span
                                                                className="occurrence-count"
                                                                aria-label={`Occurrence ${aNav.occurrence} of ${aNav.total}`}
                                                            >
                                                                {aNav.occurrence}/{aNav.total}
                                                            </span>
                                                        )}
                                                        <span
                                                            className="pair-arrow"
                                                            aria-hidden="true"
                                                        >
                                                            <ArrowRightLeftIcon />
                                                        </span>
                                                        <span className="result-word">
                                                            {item.b}
                                                        </span>
                                                        {bNav && (
                                                            <span
                                                                className="occurrence-count"
                                                                aria-label={`Occurrence ${bNav.occurrence} of ${bNav.total}`}
                                                            >
                                                                {bNav.occurrence}/{bNav.total}
                                                            </span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="nav-btn"
                                                            onClick={() =>
                                                                handleNavigate(bKey, item.b)
                                                            }
                                                            title={`Find "${item.b}" in source`}
                                                            aria-label={`Find "${item.b}" in source`}
                                                        >
                                                            <TargetIcon />
                                                        </button>
                                                    </li>
                                                );
                                            })}

                                            {remaining > 0 && (
                                                <li className="load-more-row">
                                                    <button
                                                        type="button"
                                                        className="load-more"
                                                        onClick={() =>
                                                            setVisibleCount(
                                                                (count) => count + PAGE_SIZE,
                                                            )
                                                        }
                                                    >
                                                        Show {Math.min(PAGE_SIZE, remaining)} more
                                                        <span className="load-more-count">
                                                            {remaining} remaining
                                                        </span>
                                                    </button>
                                                </li>
                                            )}
                                        </ul>
                                    )}
                                </div>
                            </section>
                        </div>
                    </div>
                )}

                {loading && (
                    <div
                        className="loading-overlay"
                        role="status"
                        aria-live="polite"
                        aria-label={status || 'Loading analysis'}
                    >
                        <div className="loading-card">
                            <div className="spinner" aria-hidden="true"></div>
                            <p className="loading-text">{status || 'Working…'}</p>
                            <p className="loading-hint">
                                Analysis runs on the local server, so the window stays responsive.
                            </p>
                        </div>
                    </div>
                )}
            </main>

            {health !== 'ok' && health !== 'checking' && (
                <div
                    className="server-warning-overlay"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="server-warning-title"
                    aria-describedby="server-warning-desc"
                >
                    <div className="warning-box">
                        <span className="warning-icon" aria-hidden="true">
                            <ServerIcon />
                        </span>
                        <h1 id="server-warning-title">
                            {health === 'offline' ? 'Server Unavailable' : 'Server Update Required'}
                        </h1>
                        <p id="server-warning-desc">
                            {health === 'offline'
                                ? 'Could not reach the local API. Start the server and try again.'
                                : `The server reports version ${healthDetail?.version ?? 'unknown'}, but this client expects ${SERVER_VERSION}.`}
                        </p>
                        {health === 'offline' && healthDetail && (
                            <p className="warning-detail">{healthDetail}</p>
                        )}
                        <button type="button" className="btn primary" onClick={retryConnection}>
                            <RefreshIcon />
                            Retry connection
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
