#!/bin/bash

# --- Config ---
SERVER_PORT=8088
CLIENT_PORT=8089

echo "=========================================="
echo "  Starting Palindrome Checker"
echo "  Server: http://localhost:$SERVER_PORT"
echo "  Client: http://localhost:$CLIENT_PORT"
echo "=========================================="

# Graceful shutdown of subprocesses
trap 'kill 0' SIGINT SIGTERM EXIT

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "[INFO] node_modules not found. Installing..."
    npm install
fi

# Run processes
npm run dev
