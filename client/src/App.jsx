import { useState, useEffect } from 'react';
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
        try {
            // 1. Get File Content
            const fileRes = await fetch(`/api/file?path=${filename}`);
            const fileData = await fileRes.json();
            const content = fileData.content || '';
            setFileContent(content);

            // 2. Process Palindromes (with timing)
            const startTime = performance.now();
            const palindromes = findPalindromes(content);
            const endTime = performance.now();
            const duration = (endTime - startTime).toFixed(2);
            setExecutionTime(duration);

            const logBody = palindromes.join('\n'); // Store separate by newline

            // 3. Write to Log (Overwrite/Create)
            await fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: filename, content: logBody })
            });

            // 4. Update Log State (Viewer)
            setLogContent(logBody);

        } catch (err) {
            console.error("Error processing file:", err);
            // alert("Error processing file check console");
        } finally {
            setLoading(false);
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
                        <h1>Palindrome Checker</h1>
                        <p>Select a file to begin auditing.</p>
                    </div>
                ) : (
                    <div className="split-view">
                        {/* Processor View: Raw File Content */}
                        <section className="panel processor-panel">
                            <header>
                                <h3>Processor</h3>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <span className="badge">Source: {selectedFile}</span>
                                    {executionTime && <span className="badge" style={{ borderColor: 'var(--accent-color)' }}>{executionTime}ms</span>}
                                </div>
                            </header>
                            <div className="horizontal-scroll-view">
                                <div className="columns-container">
                                    {fileContent.split(/\r?\n/).filter(Boolean).map((line, idx) => (
                                        <div key={idx} className="palindrome-item" style={{ color: 'var(--text-secondary)' }}>
                                            {line}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        {/* Viewer View: Log / Palindromes */}
                        <section className="panel viewer-panel">
                            <header>
                                <h3>Viewer (Logs)</h3>
                                <span className="badge">Found: {logContent ? logContent.split('\n').length : 0}</span>
                            </header>
                            <div className="horizontal-scroll-view">
                                {/* Horizontal Column Layout */}
                                <div className="columns-container">
                                    {logContent.split('\n').filter(Boolean).map((word, idx) => (
                                        <div key={idx} className="palindrome-item">
                                            {word}
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
