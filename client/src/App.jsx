import { useState, useEffect, useMemo, useRef } from 'react';
import { findPalindromes } from './utils/palindrome';
import './App.css';

function App() {
    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [fileContent, setFileContent] = useState('');
    const [logContent, setLogContent] = useState('');
    const [executionTime, setExecutionTime] = useState(null);
    const [loading, setLoading] = useState(false);

    // Load files on mount
    useEffect(() => {
        fetch('/api/files')
            .then(res => res.json())
            .then(data => setFiles(data.files || []))
            .catch(err => console.error("Failed to load files:", err));
    }, []);

    const handleFileSelect = async (filename) => {
        setSelectedFile(filename);
        setLoading(true);
        setExecutionTime(null);
        setFileContent('');
        setLogContent('');

        try {
            // 1. Get File Content
            const fileRes = await fetch(`/api/file?path=${filename}`);
            const fileData = await fileRes.json();
            const content = fileData.content || '';
            setFileContent(content);

            // 2. Check for existing Log
            const logCheckRes = await fetch(`/api/log?source=${filename}`);
            const logCheckData = await logCheckRes.json();

            if (logCheckData.exists && logCheckData.content) {
                setLogContent(logCheckData.content);
                setExecutionTime('Cached');
            } else {
                // If no log exists, process automatically the first time
                await processPalindromes(filename, content);
            }

        } catch (err) {
            console.error("Error loading file:", err);
        } finally {
            setLoading(false);
        }
    };

    const processPalindromes = async (filename, content) => {
        const startTime = performance.now();
        const palindromes = findPalindromes(content);
        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(2);

        const logBody = palindromes.join('\n');

        // Save to Log
        await fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: filename, content: logBody })
        });

        setLogContent(logBody);
        setExecutionTime(duration);
    };

    const handleRefresh = async () => {
        if (!selectedFile || !fileContent) return;
        setLoading(true);
        try {
            await processPalindromes(selectedFile, fileContent);
        } catch (err) {
            console.error("Error refreshing palindromes:", err);
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

    const logWords = useMemo(() => {
        return logContent.split('\n').filter(Boolean);
    }, [logContent]);

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
                                    {executionTime && <span className="badge" style={{ borderColor: 'var(--accent-color)' }}>{executionTime === 'Cached' ? 'Cached' : `${executionTime}ms`}</span>}
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
                                <h3>Viewer (Logs)</h3>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <button className="refresh-btn" onClick={handleRefresh} title="Recalculate Palindromes">
                                        🔄 Refresh
                                    </button>
                                    <span className="badge">Found: {logWords.length}</span>
                                </div>
                            </header>
                            <div className="horizontal-scroll-view">
                                <div className="columns-container">
                                    {logWords.map((word, idx) => (
                                        <div key={idx} className="palindrome-item">
                                            <span>{word}</span>
                                            <button
                                                className="nav-btn"
                                                onClick={() => scrollToWord(word)}
                                                title={`Find "${word}" in source`}
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
