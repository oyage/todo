# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Start the web server:
```bash
npm start
```

Run tests:
```bash
npm test
```

Start with Docker:
```bash
docker-compose up
```

## Architecture

This is a simple web-based TODO application built with Express.js and SQLite:

- `server.js`: REST API server with endpoints for CRUD operations
- `database.js`: SQLite database operations module
- `public/index.html`: Single-page frontend with JavaScript
- API endpoints: GET/POST `/tasks`, PUT `/tasks/:id`, DELETE `/tasks/:id`
- `tasks.db`: SQLite database storing tasks
- `test/server.test.js`: API endpoint tests

The web server runs on port 3000 and serves static files from the `public/` directory.

## Features

- Add new tasks
- Edit existing tasks  
- Delete tasks
- Persistent SQLite storage
- Bearer Token authentication
- Full test coverage

## Authentication

All API endpoints require Bearer Token authentication. Set the `BEARER_TOKEN` environment variable or use the default `your-secret-token`. The frontend includes the token in all requests.