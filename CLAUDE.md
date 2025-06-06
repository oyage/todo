# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Start the web server:
```bash
npm start
```

## Architecture

This is a simple TODO application with two implementations:

1. **Web-based version**: Express.js server with HTML frontend
   - `server.js`: REST API server with endpoints for CRUD operations
   - `public/index.html`: Single-page frontend with JavaScript
   - API endpoints: GET/POST `/tasks`, DELETE `/tasks/:index`

2. **CLI version**: Python command-line interface
   - `todo.py`: Interactive console application with menu-driven interface

Both implementations share the same data storage:
- `tasks.txt`: Plain text file storing tasks (one per line, UTF-8 encoded)
- Both Python and Node.js versions read/write this file with UTF-8 encoding

The web server runs on port 3000 and serves static files from the `public/` directory.