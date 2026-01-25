# Palindrome Checker 🎯

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

![App Screenshot](./assets/palindrome_checker.png)

A high-performance, multilingual palindrome auditing suite designed for speed, precision, and real-time logging.

## Features
- **🚀 High Performance**: Specialized pointer-based engine for millisecond-fast audits.
- **🌐 Multilingual**: Supports Unicode characters for any language or number system.
- **🧭 Exact-Word Navigation**: Surgical precision jump to any palindrome in your source file using the [Range API](https://developer.mozilla.org/en-US/docs/Web/API/Range).
- **🛸 Levidrome Detection**: Identifies word pairs that form different words when reversed (e.g., "stop" <=> "pots").
- **💾 Unified Caching**: Palindromes and Levidromes are atomic-cached in a single JSON `.log` file per source with original execution timings preserved.
- **📅 Date Generator**: Dedicated tool to generate century-scale date permutations with palindrome logic.
- **📊 Real-time Monitoring**: Integrated health checks and execution timers to ensure audit integrity and speed visibility.
- **🌓 Sleek Dark UI**: Modern glassmorphic interface with tabbed views for switchable analysis.

## Quick Start
1. Ensure you have [Node.js](https://nodejs.org/) installed.
2. Clone the repo:
   ```bash
   git clone https://github.com/krishnakanthb13/palindrome_checker.git
   cd palindrome_checker
   ```
3. Run the launcher:
   **Windows**:
   ```bash
   ./run_app.bat
   ```
   **Unix/Linux**:
   ```bash
   sh run_app.sh
   ```

3. **Shutdown**:
   - Close the terminal window OR press `Ctrl+C`.
   - **Windows**: Run `./stop_app.bat` to force-kill both the server and client processes.

## Utility Tools
### 📅 Century Date Generator
Generates three formats of dates for the 20th and 21st centuries, specifically optimized for palindrome auditing (including unique timestamp palindromes).
- **Location**: `century_dates/generate_dates.py`
- **Output**: `data/century_dates.txt`
- **Run**:
  ```bash
  python century_dates/generate_dates.py
  ```

## Documentation
- [Code walkthrough](./CODE_DOCUMENTATION.md)
- [Design philosophy](./DESIGN_PHILOSOPHY.md)
- [Contributing guidelines](./CONTRIBUTING.md)

## License
Licensed under the [GNU GPL v3](./LICENSE).

Built with 🧠, ☕ and 🤖 by [krishnakanthb13](https://github.com/krishnakanthb13)
