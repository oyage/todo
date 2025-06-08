# TODO Application

A secure web-based TODO manager with comprehensive task management features. Built with Express.js and SQLite, featuring Bearer token authentication, HTTPS support, and Docker deployment.

## Features

- **Task Management**: Add, edit, delete tasks with priority levels, due dates, and categories
- **Bulk Operations**: Select and manage multiple tasks simultaneously
- **Advanced UI**: Search, filter by category, sort by priority or date
- **Checkboxes**: Individual and bulk task completion toggling
- **Persistent Storage**: SQLite database with automatic initialization
- **Security**: Bearer token authentication, CORS, rate limiting, HTTPS support
- **Docker Ready**: Production-ready containerization with security hardening

## Quick Start

### Node.js/Express

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

Server runs on <http://localhost:3000> by default. Set `PORT` environment variable for different port:
```bash
PORT=4000 npm start
```

### Docker (Recommended)

Start with enhanced security features:
```bash
npm run docker:start
```

Alternative Docker commands:
```bash
# Standard deployment
npm run docker:up

# Simple deployment (named volumes)
npm run docker:up-simple

# View logs
npm run docker:logs

# Test HTTP/HTTPS access
npm run docker:test

# Fix SSL permissions if needed
npm run docker:fix-ssl

# Security audit
npm run docker:security-audit

# Stop services
npm run docker:down
```

## Authentication

Bearer Token authentication is required for all API endpoints:

```bash
BEARER_TOKEN=your-secret-token npm start
```

Default token is `your-secret-token` if not specified. Frontend is pre-configured with this token.

## API Endpoints

- `GET/POST /tasks` - List/create tasks
- `PUT /tasks/:id` - Update task
- `DELETE /tasks/:id` - Delete task
- `PATCH /tasks/:id/toggle` - Toggle task completion
- `POST /tasks/bulk-delete` - Delete multiple tasks
- `POST /tasks/bulk-complete` - Complete multiple tasks

## Security Features

- **Authentication**: Bearer token validation
- **HTTPS**: SSL/TLS encryption with auto-generated certificates
- **CORS**: Cross-origin request protection with whitelisting
- **Rate Limiting**: API and authentication endpoint protection
- **Security Headers**: Helmet.js integration (CSP, HSTS, XSS protection)
- **Docker Security**: Non-root execution, capability restrictions, resource limits

## Testing

Run comprehensive test suite:
```bash
npm test
```

Tests create a temporary `test.db` file that's automatically cleaned up.

## Architecture

- `server.js` – Express REST API server with security middleware
- `database.js` – SQLite database operations module
- `public/index.html` – Single-page frontend with advanced task management
- `public/sw.js` – Service worker for offline functionality
- `test/server.test.js` – Complete API endpoint test coverage
- `tasks.db` – SQLite database (auto-created)
- `ssl/` – SSL certificates for HTTPS
- `docker-data/` – Docker persistent volumes

## Development

The application automatically creates `tasks.db` on first run. Frontend is served from `public/` directory with full task management capabilities including search, filtering, bulk operations, and responsive design.

See `CLAUDE.md` for detailed development guidelines and `SECURITY.md` for security documentation.
