const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');

const app = express();
const PORT = 8088;

app.use(cors());
app.use(express.json());

// Root directory to serve files from (Data folder)
const ROOT_DIR = path.resolve(__dirname, '../data');

// Health Check / Version Endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '2.0-json-logs' });
});

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
                return stat.isFile() && !file.startsWith('.') && !file.endsWith('.log');
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

        // Read file as Buffer to detect encoding
        const buffer = fs.readFileSync(filePath);
        const { encoding } = jschardet.detect(buffer);

        // Decode based on detected encoding, fallback to utf-8
        const content = iconv.decode(buffer, encoding || 'utf-8');
        res.json({ content });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/log - Read existing log file (combined JSON format)
app.get('/api/log', (req, res) => {
    try {
        const sourceFile = req.query.source;
        if (!sourceFile) return res.status(400).json({ error: "No source provided" });

        const type = req.query.type || 'palindrome'; // default to palindrome
        const baseName = path.parse(sourceFile).name;
        const logFilename = `${baseName}.log`;
        const logPath = safePath(logFilename);

        console.log(`[GET LOG] File: "${logFilename}", Type: "${type}"`);

        if (fs.existsSync(logPath)) {
            const buffer = fs.readFileSync(logPath);
            const { encoding } = jschardet.detect(buffer);
            const rawContent = iconv.decode(buffer, encoding || 'utf-8');

            try {
                const data = JSON.parse(rawContent);
                const content = (type === 'levidrome')
                    ? (data.levidromes || []).join('\n')
                    : (data.palindromes || []).join('\n');

                // Get timing for this type
                const timing = data.timing || {};
                const cachedTime = (type === 'levidrome') ? timing.levidrome : timing.palindrome;

                res.json({ content, exists: content.length > 0, timing: cachedTime });
            } catch (parseErr) {
                console.log('[GET LOG] Could not parse JSON, treating as empty');
                res.json({ content: "", exists: false });
            }
        } else {
            res.json({ content: "", exists: false });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/log - Write to combined log file (JSON format)
app.post('/api/log', (req, res) => {
    try {
        const { source, content, timing } = req.body;
        if (!source) return res.status(400).json({ error: "No source provided" });

        const type = req.query.type || req.body.type || 'palindrome';
        const baseName = path.parse(source).name;
        const logFilename = `${baseName}.log`;
        const logPath = safePath(logFilename);

        console.log(`[POST LOG] File: "${logFilename}", Type: "${type}", Timing: ${timing}ms`);

        // Read existing data if file exists
        let data = { palindromes: [], levidromes: [], timing: {} };
        if (fs.existsSync(logPath)) {
            try {
                const buffer = fs.readFileSync(logPath);
                const { encoding } = jschardet.detect(buffer);
                const rawContent = iconv.decode(buffer, encoding || 'utf-8');
                data = JSON.parse(rawContent);
                if (!data.timing) data.timing = {};
            } catch (parseErr) {
                console.log('[POST LOG] Could not parse existing, starting fresh');
            }
        }

        // Update the appropriate section
        const items = content ? content.split('\n').filter(Boolean) : [];
        if (type === 'levidrome') {
            data.levidromes = items;
            if (timing) data.timing.levidrome = timing;
        } else {
            data.palindromes = items;
            if (timing) data.timing.palindrome = timing;
        }

        // Write back as JSON
        fs.writeFileSync(logPath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`[POST LOG] Saved ${items.length} ${type}s to "${logFilename}"`);

        res.json({ success: true, path: logFilename });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`SERVER STARTED AT: ${new Date().toISOString()}`);
    console.log(`LOG FORMAT: filename.log (NO .txt)`);
    console.log(`========================================`);
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Serving files from: ${ROOT_DIR}`);
});
