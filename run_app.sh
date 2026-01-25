#!/bin/bash

# --- Pre-flight Checks ---

# 1. Check for Node.js
if ! command -v node &> /dev/null
then
    echo "[ERROR] Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# 2. Check for dependencies (Unified Workspace node_modules)
if [ ! -d "node_modules" ]; then
    echo "[INFO] node_modules not found. Installing workspace dependencies..."
    npm install
fi

# --- Graceful Shutdown ---
trap "kill 0" EXIT

# --- Launch App ---
echo "=========================================="
echo "  Starting Palindrome Checker (Workspace)"
echo "  Server: Port 8088"
echo "  Client: Port 5173"
echo "=========================================="

npm run dev -s
