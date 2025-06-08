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

Start with Docker (セキュリティ強化版):
```bash
# セットアップ（初回のみ）
npm run docker:setup

# アプリケーション起動
npm run docker:up

# ログ確認
npm run docker:logs

# セキュリティ監査
npm run docker:security-audit

# 停止
npm run docker:down
```

## Architecture

This is a simple web-based TODO application built with Express.js and SQLite:

- `server.js`: REST API server with endpoints for CRUD operations
- `database.js`: SQLite database operations module
- `public/index.html`: Single-page frontend with JavaScript
- API endpoints: GET/POST `/tasks`, PUT `/tasks/:id`, DELETE `/tasks/:id`, PATCH `/tasks/:id/toggle`, POST `/tasks/bulk-delete`, POST `/tasks/bulk-complete`
- `tasks.db`: SQLite database storing tasks
- `test/server.test.js`: API endpoint tests

The web server runs on port 3000 and serves static files from the `public/` directory.

## Features

- Add new tasks with priority, due dates, and categories
- Edit existing tasks  
- Delete tasks (individual or bulk)
- Mark tasks as completed/incomplete with checkboxes (individual or bulk)
- Select multiple tasks with checkboxes
- Bulk operations: delete multiple tasks, mark multiple as complete/incomplete
- Search tasks by text content
- Filter tasks by category
- Sort by priority or creation date
- Persistent SQLite storage
- Bearer Token authentication
- Full test coverage

## Authentication

All API endpoints require Bearer Token authentication. Set the `BEARER_TOKEN` environment variable or use the default `your-secret-token`. The frontend includes the token in all requests.

## Security Features

- CORS (Cross-Origin Resource Sharing) configuration with origin whitelisting
- Security headers using Helmet.js (CSP, HSTS, XSS protection, etc.)
- Rate limiting for API and authentication endpoints
- HTTPS support with automatic SSL certificate generation
- Bearer token authentication with enhanced validation
- Comprehensive error handling and logging
- Docker security hardening with non-root user execution
- Linux capabilities minimization
- Resource limits and health checks

## Docker Security

The Docker environment includes multiple security enhancements:

- Non-root user execution (UID 1001)
- Minimal Linux capabilities
- Resource limits (CPU/Memory)
- Secure networking with isolated bridge
- Health checks and monitoring
- Secure volume mounting
- Log rotation and management

See `SECURITY.md` for detailed security documentation.