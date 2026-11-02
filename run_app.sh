#!/bin/bash
set -e

cd "$(dirname "$0")"

export SERVER_PORT="${SERVER_PORT:-8088}"
export CLIENT_PORT="${CLIENT_PORT:-8089}"

if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed or not in PATH."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "[INFO] node_modules not found. Installing workspace dependencies..."
    npm install
fi

echo "=========================================="
echo "  Starting Palindrome Checker"
echo "  Server: http://127.0.0.1:$SERVER_PORT"
echo "  Client: http://127.0.0.1:$CLIENT_PORT"
echo "=========================================="
echo
echo "Press Ctrl+C to stop both processes."

# Run in the foreground and let concurrently forward Ctrl+C to both children.
# Do not kill the whole process group; that can terminate the invoking shell.
npm run dev
