# TODO Application

A secure, high-performance web-based TODO manager with comprehensive task management features. Built with Express.js and SQLite, featuring JWT authentication, advanced caching, HTTPS support, and production-ready Docker deployment.

## Features

### Core Functionality
- **Task Management**: Add, edit, delete tasks with priority levels, due dates, and categories
- **User Authentication**: Complete user registration and login system with JWT tokens
- **Bulk Operations**: Select and manage multiple tasks simultaneously
- **Advanced UI**: Search, filter by category, sort by priority/date/manual ordering
- **Drag & Drop**: Intuitive task reordering with visual feedback
- **Persistent Storage**: SQLite database with optimized indexing

### User Experience
- **Responsive Design**: Mobile-first approach with touch optimization
- **Dark Mode**: System preference detection + manual toggle
- **PWA Support**: Offline functionality with Service Worker
- **Keyboard Shortcuts**: Comprehensive keyboard navigation
- **Accessibility**: WCAG 2.1 compliant with screen reader support

### Performance & Security
- **High Performance**: LRU caching, database optimization, response compression
- **Security**: JWT + Bearer token authentication, CORS, rate limiting, HTTPS
- **Docker Ready**: Production-ready containerization with security hardening
- **Monitoring**: Performance metrics, memory usage tracking

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

The application supports both JWT and Bearer Token authentication:

### Environment Setup
```bash
# Copy example environment file
cp .env.example .env

# Edit .env with secure tokens
BEARER_TOKEN=your-secure-64-char-token
JWT_SECRET=your-secure-128-char-secret
JWT_EXPIRES_IN=24h
```

### User Registration & Login
- Users can create accounts via the web interface
- JWT tokens are used for session management
- Bearer tokens provide backward compatibility

**Security Note**: Always use strong, randomly generated tokens in production. The `.env.example` file includes secure example tokens.

## API Endpoints

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/me` - Get user profile

### Tasks
- `GET /tasks` - List tasks (with search, filter, sort)
- `POST /tasks` - Create new task
- `PUT /tasks/:id` - Update task (ID-based)
- `DELETE /tasks/:id` - Delete task (ID-based)
- `PATCH /tasks/:id` - Toggle task completion
- `DELETE /tasks` - Bulk delete tasks
- `PATCH /tasks` - Bulk update task completion
- `POST /tasks/reorder` - Reorder tasks manually

### Categories
- `GET /categories` - Get all categories

All endpoints require JWT or Bearer token authentication.

## Security Features

### Authentication & Authorization
- **JWT Authentication**: Secure token-based user sessions
- **Bearer Token**: Backward compatibility support
- **Password Security**: bcrypt hashing with configurable salt rounds
- **Session Management**: Configurable token expiration

### Network Security
- **HTTPS**: SSL/TLS encryption with auto-generated certificates
- **CORS**: Cross-origin request protection with environment-based whitelisting
- **Rate Limiting**: Graduated limits (API: 100/15min, Auth: 5/15min)
- **Security Headers**: Comprehensive Helmet.js integration

### Application Security
- **Input Validation**: Comprehensive request validation with detailed error messages
- **SQL Injection Prevention**: Parameterized queries throughout
- **XSS Protection**: Content Security Policy and input sanitization
- **Error Handling**: Secure error responses without information leakage

### Infrastructure Security
- **Docker Security**: Non-root execution, Linux capabilities restrictions
- **Resource Limits**: CPU/Memory constraints and health monitoring
- **Logging**: Structured security event logging with request tracking

## Testing

Run comprehensive test suite:
```bash
npm test
```

Tests create a temporary `test.db` file that's automatically cleaned up.

## Architecture

### Backend (Node.js/Express)
- `server.js` – Express REST API server with advanced security middleware
- `database.js` – SQLite operations with optimized indexing and caching
- `tasks.db` – SQLite database with performance optimizations (auto-created)

### Frontend (Vanilla JS + PWA)
- `public/index.html` – Single-page application with comprehensive UI
- `public/sw.js` – Advanced Service Worker with intelligent caching strategies
- `public/manifest.json` – PWA configuration for app-like experience

### Configuration & Deployment
- `.env.example` – Environment configuration template with secure defaults
- `Dockerfile` – Multi-stage build with security hardening
- `docker-compose.yml` – Production-ready orchestration with monitoring
- `ssl/` – SSL certificates for HTTPS (auto-generated)

### Testing & Documentation
- `test/server.test.js` – Complete API endpoint test coverage
- `SECURITY.md` – Comprehensive security documentation
- `CLAUDE.md` – Development guidelines and commands

## Performance Features

### Backend Optimizations
- **LRU Caching**: Intelligent memory management with TTL expiration
- **Database Indexing**: Optimized queries with composite indexes
- **Response Compression**: gzip compression for all responses
- **Request Optimization**: Debounced search, efficient pagination

### Frontend Optimizations
- **Service Worker**: Multi-strategy caching (Cache-First, Network-First, Stale-While-Revalidate)
- **Memory Management**: Automatic cleanup and garbage collection triggers
- **GPU Acceleration**: CSS transforms for smooth animations
- **Lazy Loading**: Intersection Observer API for efficient rendering

### Monitoring
- **Performance Metrics**: Built-in timing measurements
- **Memory Monitoring**: Automatic detection and cleanup of memory pressure
- **Error Tracking**: Comprehensive error logging and user feedback

## Development

The application automatically creates `tasks.db` on first run with optimized indexes. Frontend features include:

- **Advanced UI**: Search, filtering, sorting, bulk operations
- **Responsive Design**: Mobile-first with touch optimization
- **Accessibility**: WCAG 2.1 compliant with comprehensive keyboard navigation
- **Performance**: Optimized rendering with virtual scrolling support

See `CLAUDE.md` for detailed development guidelines and `SECURITY.md` for security documentation.
