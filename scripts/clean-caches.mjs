import fs from 'node:fs';
import path from 'node:path';

const cacheDir = path.resolve('data/.cache');

if (!process.argv.includes('--yes')) {
    console.log(`This will remove ${cacheDir}`);
    console.log('Re-run with --yes to confirm.');
    process.exit(0);
}

fs.rmSync(cacheDir, { recursive: true, force: true });
console.log(`Removed ${cacheDir}`);
