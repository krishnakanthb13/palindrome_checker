import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SERVER_VERSION } from '../../shared/version.mjs';
import { computeAnalysis, getAnalysis, getFile, getHealth, listFiles } from './api';
import { findOccurrence } from './utils/search';
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

function App() {
    const [files, setFiles] = useState([]);
    const [filesState, setFilesState] = useState('loading');
    const [filesError, setFilesError] = useState(null);

    const [selectedFile, setSelectedFile] = useState(null);
    const [fileContent, setFileContent] = useState('');
    const [fileMeta, setFileMeta] = useState(null);
    const [results, setResults] = useState({ palindromes: [], levidromes: [] });
    const [timings, setTimings] = useState({});
    const [viewMode, setViewMode] = useState('palindrome');
    const [encoding, setEncoding] = useState('auto');
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [navState, setNavState] = useState({});

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
    }, [selectedFile, viewMode, results]);

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

    const visibleItems = currentList.slice(0, visibleCount);
    const remaining = currentList.length - visibleItems.length;
    const currentTiming = timings[viewMode];
    const timing = timingLabel(currentTiming, status === 'Cached');

    return (
        <div className="app-container">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <h2>Explorer</h2>
                    <button
                        type="button"
                        className="icon-btn"
                        onClick={loadFiles}
                        disabled={filesState === 'loading'}
                        aria-label="Refresh file list"
                        title="Refresh file list"
                    >
                        ⟳
                    </button>
                </div>

                {filesState === 'loading' && <p className="sidebar-note">Loading files…</p>}

                {filesState === 'error' && (
                    <div className="sidebar-note error" role="alert">
                        <span>Could not load files: {filesError}</span>
                        <button type="button" className="link-btn" onClick={loadFiles}>
                            Retry
                        </button>
                    </div>
                )}

                <ul className="file-list">
                    {files.map((file) => (
                        <li key={file.name}>
                            <button
                                type="button"
                                className={`file-row ${selectedFile === file.name ? 'active' : ''}`}
                                onClick={() => handleFileSelect(file.name)}
                            >
                                <span className="file-icon" aria-hidden="true">
                                    📄
                                </span>
                                <span className="file-info">
                                    <span className="file-name">{file.name}</span>
                                    <span className="file-size">{file.size}</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>

                <div className="sidebar-footer">
                    <p>Palindrome Checker</p>
                    <small>Created with 🧠, ☕ &amp; 🤖</small>
                    <small>by krishnakanthb</small>
                </div>
            </aside>

            <main className="main-content" aria-busy={loading}>
                {error && (
                    <div className="error-banner" role="alert">
                        <span>{error}</span>
                        <button
                            type="button"
                            className="link-btn"
                            onClick={handleRetry}
                            disabled={!selectedFile || loading}
                        >
                            Retry
                        </button>
                        <button
                            type="button"
                            className="dismiss-btn"
                            onClick={() => setError(null)}
                            aria-label="Dismiss error"
                        >
                            ×
                        </button>
                    </div>
                )}

                {!selectedFile ? (
                    <div className="empty-state">
                        <div className="empty-emoji" aria-hidden="true">
                            🤖
                        </div>
                        <h1>Palindrome Checker</h1>
                        <p>Select a file from the explorer to start auditing for linguistic symmetry.</p>
                    </div>
                ) : (
                    <div className="split-view">
                        <section className="panel processor-panel">
                            <header>
                                <h3>Processor</h3>
                                <div className="header-controls">
                                    <span className="badge">Source: {selectedFile}</span>
                                    {fileMeta && (
                                        <span className="badge" title="Detected source encoding">
                                            {fileMeta.encoding}
                                        </span>
                                    )}
                                    <label className="encoding-select">
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
                                    {timing && (
                                        <span className="badge accent-badge">{timing}</span>
                                    )}
                                    {status && (
                                        <span className="badge status-badge" aria-live="polite">
                                            {status}
                                        </span>
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
                                    <div style={{ height: `${scrollHeight}px`, width: '1px' }}></div>
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
                            <header>
                                <h3>Viewer</h3>

                                <div className="tabs" role="tablist" aria-label="Analysis view">
                                    <button
                                        type="button"
                                        role="tab"
                                        id="tab-palindrome"
                                        aria-selected={viewMode === 'palindrome'}
                                        aria-controls="viewer-panel"
                                        className={`tab-btn ${viewMode === 'palindrome' ? 'active' : ''}`}
                                        onClick={() => setViewMode('palindrome')}
                                    >
                                        Palindromes
                                    </button>
                                    <button
                                        type="button"
                                        role="tab"
                                        id="tab-levidrome"
                                        aria-selected={viewMode === 'levidrome'}
                                        aria-controls="viewer-panel"
                                        className={`tab-btn ${viewMode === 'levidrome' ? 'active' : ''}`}
                                        onClick={() => setViewMode('levidrome')}
                                    >
                                        Levidromes
                                    </button>
                                </div>

                                <div className="header-controls">
                                    <button
                                        type="button"
                                        className="refresh-btn"
                                        onClick={handleRefresh}
                                        disabled={loading}
                                        title="Re-read the source and recalculate both analyses"
                                    >
                                        🔄 Refresh
                                    </button>
                                    <span className="badge">Found: {currentList.length}</span>
                                </div>
                            </header>

                            <div className="horizontal-scroll-view">
                                <div className="columns-container">
                                    {visibleItems.map((item) => {
                                        if (viewMode === 'palindrome') {
                                            const key = `p:${item.word}`;
                                            const nav = navState[key];

                                            return (
                                                <div key={key} className="palindrome-item">
                                                    <span className="result-word">{item.word}</span>
                                                    {item.count > 1 && (
                                                        <span
                                                            className="count-badge"
                                                            title={`${item.count} occurrences`}
                                                        >
                                                            ×{item.count}
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className="nav-btn"
                                                        onClick={() => handleNavigate(key, item.word)}
                                                        title={`Find "${item.word}" in source`}
                                                        aria-label={`Find "${item.word}" in source`}
                                                    >
                                                        🎯
                                                    </button>
                                                    {nav && (
                                                        <span className="occurrence-count">
                                                            {nav.occurrence}/{nav.total}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        }

                                        const key = `l:${JSON.stringify([item.a, item.b])}`;
                                        const aKey = `${key}:a`;
                                        const bKey = `${key}:b`;
                                        const aNav = navState[aKey];
                                        const bNav = navState[bKey];

                                        return (
                                            <div key={key} className="palindrome-item levidrome-item">
                                                <span className="result-pair">
                                                    <button
                                                        type="button"
                                                        className="nav-btn"
                                                        onClick={() => handleNavigate(aKey, item.a)}
                                                        title={`Find "${item.a}" in source`}
                                                        aria-label={`Find "${item.a}" in source`}
                                                    >
                                                        🎯
                                                    </button>
                                                    <span>{item.a}</span>
                                                    {aNav && (
                                                        <span className="occurrence-count">
                                                            {aNav.occurrence}/{aNav.total}
                                                        </span>
                                                    )}
                                                    <span className="pair-arrow" aria-hidden="true">
                                                        ⇄
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="nav-btn"
                                                        onClick={() => handleNavigate(bKey, item.b)}
                                                        title={`Find "${item.b}" in source`}
                                                        aria-label={`Find "${item.b}" in source`}
                                                    >
                                                        🎯
                                                    </button>
                                                    <span>{item.b}</span>
                                                    {bNav && (
                                                        <span className="occurrence-count">
                                                            {bNav.occurrence}/{bNav.total}
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        );
                                    })}

                                    {!loading && currentList.length === 0 && (
                                        <p className="viewer-empty">
                                            No {viewMode}s found in this file.
                                        </p>
                                    )}

                                    {remaining > 0 && (
                                        <button
                                            type="button"
                                            className="load-more"
                                            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                                        >
                                            Show {Math.min(PAGE_SIZE, remaining)} more ({remaining}{' '}
                                            remaining)
                                        </button>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                )}
            </main>

            {loading && (
                <div className="loading-overlay" role="status" aria-live="polite">
                    <div className="spinner" aria-hidden="true"></div>
                    <span className="sr-only">{status || 'Loading analysis'}</span>
                </div>
            )}

            {health !== 'ok' && health !== 'checking' && (
                <div className="server-warning-overlay" role="alert">
                    <div className="warning-box">
                        <h1>{health === 'offline' ? 'Server Unavailable' : 'Server Update Required'}</h1>
                        <p>
                            {health === 'offline'
                                ? 'Could not reach the local API. Start the server and try again.'
                                : `The server reports version ${healthDetail?.version ?? 'unknown'}, but this client expects ${SERVER_VERSION}.`}
                        </p>
                        {health === 'offline' && healthDetail && (
                            <p className="warning-detail">{healthDetail}</p>
                        )}
                        <button type="button" className="refresh-btn" onClick={retryConnection}>
                            Retry
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
