# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Start the web server:
```bash
npm start
```

## Architecture

This is a simple web-based TODO application built with Express.js:

- `server.js`: REST API server with endpoints for CRUD operations
- `public/index.html`: Single-page frontend with JavaScript
- API endpoints: GET/POST `/tasks`, DELETE `/tasks/:index`
- `tasks.txt`: Plain text file storing tasks (one per line, UTF-8 encoded)

The web server runs on port 3000 and serves static files from the `public/` directory.