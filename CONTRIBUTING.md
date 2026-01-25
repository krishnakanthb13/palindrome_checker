# Contributing to Palindrome Checker

First off, thank you for considering contributing to this tool!

## How to Contribute

### 1. Reporting Bugs
- Use GitHub Issues to report bugs.
- Provide a clear description and the file size/type you were auditing when the issue occurred.

### 2. Feature Suggestions
- We welcome performance-oriented features (e.g., regex-based filters, multi-file batch scanning).

### 3. Development Workflow
1. **Fork** the repository.
2. **Setup Local Environment**:
   ```bash
   npm install
   cd client && npm install
   ```
3. **Launch the app**:
   ```bash
   npm start
   ```
4. **Create a branch** for your fix or feature.
5. **Submit a Pull Request**.

## Pre-submission Checklist
- [ ] Code follows performance-first principles (avoid excessive string splits/joins).
- [ ] UI changes maintain the Sleek Dark Glassmorphic aesthetic.
- [ ] No regression on 1MB+ file handling stability.
- [ ] All new features documented in `CODE_DOCUMENTATION.md`.

## Metadata
- **Main Maintainer**: [krishnakanthb13](https://github.com/krishnakanthb13)
- **Copyright**: © 2026 Krishna Kanth B
