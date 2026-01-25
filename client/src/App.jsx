import { useState, useEffect, useMemo, useRef } from 'react';
import { findPalindromes } from './utils/palindrome';
import { findLevidromes } from './utils/levidrome';
import './App.css';

function App() {
    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileContent, setFileContent] = useState('');
    const [levContent, setLevContent] = useState('');
    const [viewMode, setViewMode] = useState('palindrome'); // 'palindrome' | 'levidrome'
    const [levidromeToggleMap, setLevidromeToggleMap] = useState({});
    const [executionTime, setExecutionTime] = useState({});
    const [logContent, setLogContent] = useState('');
    const [loading, setLoading] = useState(false);

    const [serverStatus, setServerStatus] = useState('checking'); // 'ok', 'outdated'

    // Load files on mount
    useEffect(() => {
        // Check Server Version
        fetch('/api/health')
            .then(res => {
                if (res.ok) return res.json();
                throw new Error("Old Server");
            })
            .then(data => {
                if (data.version === '2.0-json-logs') setServerStatus('ok');
                else setServerStatus('outdated');
            })
            .catch(() => setServerStatus('outdated'));

        fetch('/api/files')
            .then(res => res.json())
            .then(data => setFiles(data.files || []))
            .catch(err => console.error("Failed to load files:", err));
    }, []);

    const activeFileRef = useRef(null);

    const handleFileSelect = async (filename) => {
        if (activeFileRef.current === filename && !loading) return; // Prevent double click re-load on same file

        activeFileRef.current = filename;
        setSelectedFile(filename);
        setLoading(true);
        setExecutionTime({});
        setFileContent('');
        setLogContent('');
        setLevContent('');

        try {
            // 1. Get File Content
            const fileRes = await fetch(`/api/file?path=${filename}`);
            const fileData = await fileRes.json();
            const content = fileData.content || '';
            setFileContent(content);

            // 2. Check for existing Logs
            const [palLogRes, levLogRes] = await Promise.all([
                fetch(`/api/log?source=${filename}`),
                fetch(`/api/log?source=${filename}&type=levidrome`)
            ]);

            const palLogData = await palLogRes.json();
            const levLogData = await levLogRes.json();

            let newExecutionTime = {};

            if (palLogData.exists && palLogData.content) {
                setLogContent(palLogData.content);
                newExecutionTime.palindrome = palLogData.timing
                    ? `Cached: ${palLogData.timing}ms`
                    : 'Cached';
            } else {
                // Will be processed below if not cached
            }

            if (levLogData.exists && levLogData.content) {
                setLevContent(levLogData.content);
                newExecutionTime.levidrome = levLogData.timing
                    ? `Cached: ${levLogData.timing}ms`
                    : 'Cached';
            }

            setExecutionTime(newExecutionTime);

            if (activeFileRef.current !== filename) return;

            // Trigger processing if any log is missing
            // We pass the explicit 'filename' to ensure consistency
            if (!palLogData.exists || !levLogData.exists) {
                await processAnalysis(filename, content, !palLogData.exists, !levLogData.exists);
            }

        } catch (err) {
            console.error("Error loading file:", err);
        } finally {
            if (activeFileRef.current === filename) {
                setLoading(false);
            }
        }
    };

    // Helper to allow UI to render (show spinner)
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 50));

    const processAnalysis = async (filename, content, doPalindrome = true, doLevidrome = true) => {
        // Wait for spinner to appear
        await yieldToMain();

        if (activeFileRef.current !== filename) return;

        let times = { ...executionTime };

        if (doPalindrome) {
            const start = performance.now();
            const palindromes = findPalindromes(content);
            const duration = (performance.now() - start).toFixed(2);

            // Re-check race condition
            if (activeFileRef.current !== filename) return;

            const body = palindromes.join('\n');
            setLogContent(body);

            times.palindrome = duration;
            // Update time immediately so user sees progress
            setExecutionTime(prev => {
                const newTimes = { ...prev, palindrome: duration };
                times = newTimes; // Sync local var for next step (though redundant if we use functional updates below too)
                return newTimes;
            });

            // Save in bg
            fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: filename, content: body, timing: duration })
            }).catch(console.error);

            // Yield again between heavy tasks
            await yieldToMain();
        }

        if (doLevidrome) {
            if (activeFileRef.current !== filename) return;

            const start = performance.now();
            const levidromes = findLevidromes(content);
            const duration = (performance.now() - start).toFixed(2);

            if (activeFileRef.current !== filename) return;

            const body = levidromes.join('\n');
            setLevContent(body);

            setExecutionTime(prev => ({ ...prev, levidrome: duration }));

            fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: filename, content: body, type: 'levidrome', timing: duration })
            }).catch(console.error);
        }
    };

    const handleRefresh = async () => {
        if (!selectedFile || !fileContent) return;
        setLoading(true);
        try {
            // Refresh BOTH palindromes and levidromes
            await processAnalysis(selectedFile, fileContent, true, true);
        } catch (err) {
            console.error("Error refreshing analysis:", err);
        } finally {
            setLoading(false);
        }
    };

    const scrollToWord = (word) => {
        if (!processorRef.current || !fileContent) return;

        const pre = processorRef.current.querySelector('pre');
        if (!pre || !pre.firstChild) return;

        // Find the index of the word strictly as an exact token (whitespace or comma delimited)
        const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?<=^|[\\s\\r\\n,])${escapeRegex(word)}(?=$|[\\s\\r\\n,])`, 'g');
        const match = regex.exec(fileContent);
        const charIndex = match ? match.index : -1;

        if (charIndex !== -1) {
            const textNode = pre.firstChild;
            const range = document.createRange();

            try {
                range.setStart(textNode, charIndex);
                range.setEnd(textNode, charIndex + word.length);

                // 2. Select the word
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);

                // 3. Instant Jump
                // For large files, 'smooth' behavior causes blanking and lag.
                // 'auto' is instant and prevents the screen-flicker you're seeing.
                const rect = range.getBoundingClientRect();
                const containerRect = processorRef.current.getBoundingClientRect();

                processorRef.current.scrollTo({
                    top: processorRef.current.scrollTop + (rect.top - containerRect.top) - (containerRect.height / 2),
                    left: processorRef.current.scrollLeft + (rect.left - containerRect.left) - (containerRect.width / 2),
                    behavior: 'auto'
                });
            } catch (e) {
                console.error("Scroll error:", e);
            }
        }
    };

    const currentList = useMemo(() => {
        const content = viewMode === 'palindrome' ? logContent : levContent;
        return content.split('\n').filter(Boolean);
    }, [logContent, levContent, viewMode]);

    const processorRef = useRef(null);
    const mirrorRef = useRef(null);
    const [scrollHeight, setScrollHeight] = useState(0);

    // Sync mirror height to content height whenever content changes
    useEffect(() => {
        if (processorRef.current) {
            setScrollHeight(processorRef.current.scrollHeight);
        }
    }, [fileContent]);

    const handleProcessorScroll = (e) => {
        if (mirrorRef.current && Math.abs(mirrorRef.current.scrollTop - e.target.scrollTop) > 1) {
            mirrorRef.current.scrollTop = e.target.scrollTop;
        }
    };

    const handleMirrorScroll = (e) => {
        if (processorRef.current && Math.abs(processorRef.current.scrollTop - e.target.scrollTop) > 1) {
            processorRef.current.scrollTop = e.target.scrollTop;
        }
    };

    return (
        <div className="app-container">
            {/* Sidebar: File Selector */}
            <aside className="sidebar">
                <div className="sidebar-header">
                    <h2>Explorer</h2>
                </div>
                <ul className="file-list">
                    {files.map(file => (
                        <li
                            key={file.name || file}
                            className={selectedFile === (file.name || file) ? 'active' : ''}
                            onClick={() => handleFileSelect(file.name || file)}
                        >
                            <span className="file-icon">📄</span>
                            <div className="file-info">
                                <span className="file-name">{file.name || file}</span>
                                <span className="file-size">{file.size || ''}</span>
                            </div>
                        </li>
                    ))}
                </ul>
                <div className="sidebar-footer">
                    <p>Palindrome Checker</p>
                    <small>Created with 🧠, ☕ & 🤖</small>
                    <small>by krishnakanthb</small>
                </div>
            </aside>

            {/* Main Content: Split View */}
            <main className="main-content">
                {!selectedFile ? (
                    <div className="empty-state">
                        <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>🤖</div>
                        <h1>Palindrome Checker</h1>
                        <p>Select a file from the explorer to start auditing for linguistic symmetry.</p>
                    </div>
                ) : (
                    <div className="split-view">
                        {/* Processor View: Raw File Content */}
                        <section className="panel processor-panel">
                            <header>
                                <h3>Processor</h3>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <span className="badge">Source: {selectedFile}</span>
                                    {executionTime[viewMode] && (
                                        <span className="badge" style={{ borderColor: 'var(--accent-color)' }}>
                                            {executionTime[viewMode].toString().startsWith('Cached')
                                                ? executionTime[viewMode]
                                                : `${executionTime[viewMode]}ms`}
                                        </span>
                                    )}
                                </div>
                            </header>
                            <div className="dual-scrollbar-layout">
                                <div
                                    className="scrollbar-mirror"
                                    ref={mirrorRef}
                                    onScroll={handleMirrorScroll}
                                >
                                    <div style={{ height: scrollHeight + 'px', width: '1px' }}></div>
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

                        {/* Viewer View: Log / Palindromes */}
                        <section className="panel viewer-panel">
                            <header>
                                <h3>Viewer</h3>
                                <div className="tabs">
                                    <button
                                        className={`tab-btn ${viewMode === 'palindrome' ? 'active' : ''}`}
                                        onClick={() => setViewMode('palindrome')}
                                    >
                                        Palindromes
                                    </button>
                                    <button
                                        className={`tab-btn ${viewMode === 'levidrome' ? 'active' : ''}`}
                                        onClick={() => setViewMode('levidrome')}
                                    >
                                        Levidromes
                                    </button>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <button className="refresh-btn" onClick={handleRefresh} title={`Recalculate ${viewMode}s`}>
                                        🔄 Refresh
                                    </button>
                                    <span className="badge">Found: {currentList.length}</span>
                                </div>
                            </header>
                            <div className="horizontal-scroll-view">
                                <div className="columns-container">
                                    {currentList.map((item, idx) => (
                                        <div key={idx} className="palindrome-item">
                                            <span>{item}</span>
                                            <button
                                                className="nav-btn"
                                                onClick={() => {
                                                    if (viewMode === 'levidrome' && item.includes('<=>')) {
                                                        const parts = item.split('<=>').map(s => s.trim());
                                                        const currentToggle = levidromeToggleMap[item] || 0;
                                                        
                                                        const wordToSearch = parts[currentToggle];
                                                        scrollToWord(wordToSearch);
                                                        
                                                        setLevidromeToggleMap(prev => ({
                                                            ...prev,
                                                            [item]: currentToggle === 0 ? 1 : 0
                                                        }));
                                                    } else {
                                                        const wordToSearch = item.includes('<=>') ? item.split('<=>')[0].trim() : item;
                                                        scrollToWord(wordToSearch);
                                                    }
                                                }}
                                                title={
                                                    viewMode === 'levidrome' && item.includes('<=>')
                                                        ? `Find "${(item.split('<=>')[(levidromeToggleMap[item] || 0)]).trim()}" in source`
                                                        : `Find "${item.split('<=>')[0].trim()}" in source`
                                                }
                                            >
                                                🎯
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>
                )}
            </main>

            {loading && <div className="loading-overlay"><div className="spinner"></div></div>}


        </div>
    );
}

export default App;
