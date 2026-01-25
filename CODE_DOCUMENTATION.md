# Palindrome Checker - Code Documentation

## Project Structure
```text
/client
  /src
    /utils
      palindrome.js     # Core logic for palindrome detection
    App.jsx             # Main UI component and application state
    App.css             # Styles for the glassmorphic dark-mode UI
/server
  index.js              # Express server with API for file and log management
/data                   # Storage for generated palindrome logs
/century_dates          # Date generation utilities
  generate_dates.py     # Script to create century-scale date datasets
run_app.bat             # Windows launcher script
run_app.sh              # Unix/Linux launcher script
```

## High-Level Architecture
The application follows a standard **Client-Server** model with a **Mono-repo** structure.
- **Frontend**: Built with React (Vite). It handles file browsing, user interactions (scrolling, jumping), and real-time UI updates.
- **Backend**: Built with Node.js and Express. It provides a simple API to read files from the workspace and manage the local `data/` cache for logs.
- **Persistence**: Palindromes found in a file are cached as `.log` files in the `/data` directory to avoid redundant high-compute scans.

## Core Modules & Functions
| Module | Function | Description |
| :--- | :--- | :--- |
| `palindrome.js` | `findPalindromes(text)` | High-performance, pointer-based palindrome detection with custom delimiter support. |
| `App.jsx` | `scrollToWord(word)` | Precise navigation system using the Browser Range API to jump to exact word instances. |
| `server/index.js` | `/api/files` | Scans the root directory (excluding system folders) for audit-ready text files. |
| `generate_dates.py`| `generate_dates()` | Generates `YYMMDD`, `YYYYMMDD`, and palindrome $HHMMSS$ combinations for 19xx-20xx. |

## Execution Flow
1. **Launch**: `run_app.bat` starts both the client (Vite) and server (Express).
2. **Detection**: Upon selecting a file, the system checks the `/data` folder for a cached scan.
3. **Scan**: If no cache exists, the file is scanned using the pointer-based algorithm in `palindrome.js`.
4. **Display**: Results are displayed in a dual-panel layout (Source vs. Logs).
5. **Navigate**: User clicks the 🎯 icon in Logs; the system uses the Range API to jump the Source view to that exact word.

## External Data Sources
The dictionary dataset files used for auditing within this project were sourced and compiled from the following repositories and providers:

- **[dwyl/english-words](https://github.com/dwyl/english-words)**: A comprehensive list of over 466k English words.
- **[sujithps/Dictionary](https://github.com/sujithps/Dictionary)**: JSON and text-based English dictionary resources.
- **[Kaggle: OPTED Dictionary](https://www.kaggle.com/datasets/dfydata/the-online-plain-text-english-dictionary-opted)**: The Online Plain Text English Dictionary (OPTED) in a structured format.
- **[G. Wicks Dictionaries](http://www.gwicks.net/dictionaries.htm)**: A curated collection of large-scale word lists for various languages.