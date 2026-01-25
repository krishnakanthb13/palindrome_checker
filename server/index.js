const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 8088;

app.use(cors());
app.use(express.json());

// Root directory to serve files from (Data folder)
const ROOT_DIR = path.resolve(__dirname, '../data');

// Ensure data directory exists
if (!fs.existsSync(ROOT_DIR)) {
    fs.mkdirSync(ROOT_DIR);
}

// Middleware to ensure we don't access files outside ROOT_DIR
const safePath = (requestedPath) => {
    const resolvedPath = path.resolve(ROOT_DIR, requestedPath.replace(/^[/\\]/, "")); // Remove leading slash
    if (!resolvedPath.startsWith(ROOT_DIR)) {
        throw new Error("Access Denied");
    }
    return resolvedPath;
};

// GET /api/files - List all text files in the data directory
app.get('/api/files', (req, res) => {
    try {
        const files = fs.readdirSync(ROOT_DIR);
        const fileList = files
            .filter(file => {
                const stat = fs.statSync(path.join(ROOT_DIR, file));
                return stat.isFile() && !file.startsWith('.');
            })
            .map(file => {
                const stat = fs.statSync(path.join(ROOT_DIR, file));
                let size = stat.size;
                let sizeStr = '';
                if (size < 1024) sizeStr = size + ' B';
                else if (size < 1024 * 1024) sizeStr = (size / 1024).toFixed(1) + ' KB';
                else sizeStr = (size / (1024 * 1024)).toFixed(1) + ' MB';

                return { name: file, size: sizeStr };
            });
        res.json({ files: fileList });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/file - Read file content
app.get('/api/file', (req, res) => {
    try {
        const filename = req.query.path;
        if (!filename) return res.status(400).json({ error: "No path provided" });

        const filePath = safePath(filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });

        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/log - Read existing log file
app.get('/api/log', (req, res) => {
    try {
        const sourceFile = req.query.source;
        if (!sourceFile) return res.status(400).json({ error: "No source provided" });

        const logFilename = `${sourceFile}.log`;
        const logPath = safePath(logFilename);

        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf-8');
            res.json({ content, exists: true });
        } else {
            res.json({ content: "", exists: false });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/log - Write/Append to log
app.post('/api/log', (req, res) => {
    try {
        const { source, content, overwrite } = req.body;
        if (!source) return res.status(400).json({ error: "No source provided" });

        const logFilename = `${source}.log`;
        const logPath = safePath(logFilename);

        // If overwrite is true, replace file. If false/undefined, append?
        // Requirements say "create or use the existing log file". 
        // We probably want to overwrite the log with the NEW findings or Append?
        // Usually, a "checker" refreshes the log. Let's Overwrite for this session's findings,
        // or we can implement an append logic.
        // For simplicity: Overwrite with current findings is cleaner for a "Checker" tool.
        // But user said "Create a Log file... Using the same framework... keep separate from working files".
        // Let's stick to simple write.

        fs.writeFileSync(logPath, content, 'utf-8');
        res.json({ success: true, path: logFilename });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Serving files from: ${ROOT_DIR}`);
});
