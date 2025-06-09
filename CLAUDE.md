# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
Start the web server:
```bash
npm start
```

Run tests:
```bash
npm test
```

Run linting and type checking (if available):
```bash
npm run lint
npm run typecheck
```

### Environment Setup
Copy and configure environment variables:
```bash
cp .env.example .env
# Edit .env with secure tokens and appropriate settings
```

Start with Docker (セキュリティ強化版):
```bash
# 簡単起動（推奨）
npm run docker:start

# または手動起動
# 通常版（bind mount使用）
npm run docker:up

# 簡易版（named volume使用、ボリューム問題がある場合）
npm run docker:up-simple

# ログ確認
npm run docker:logs

# 動作テスト（HTTPとHTTPSアクセスの確認）
npm run docker:test

# SSL証明書権限問題の修正
npm run docker:fix-ssl

# セキュリティ監査
npm run docker:security-audit

# 停止
npm run docker:down  # または docker:down-simple
```

## Architecture

This is a high-performance, secure web-based TODO application built with Express.js and SQLite:

### Backend Components
- `server.js`: REST API server with comprehensive security middleware and performance optimizations
- `database.js`: SQLite database operations with optimized indexing and caching strategies
- `tasks.db`: SQLite database with performance indexes (auto-created)

### Frontend Components
- `public/index.html`: Single-page application with advanced JavaScript features
- `public/sw.js`: Service Worker with intelligent caching strategies
- `public/manifest.json`: PWA configuration for offline functionality

### API Endpoints
- **Authentication**: `/auth/register`, `/auth/login`, `/auth/me`
- **Tasks**: GET/POST `/tasks`, PUT/DELETE `/tasks/:id`, PATCH `/tasks/:id`, bulk operations
- **Categories**: GET `/categories`
- **Reordering**: POST `/tasks/reorder`

### Performance Features
- LRU caching system with TTL expiration
- Database query optimization with composite indexes
- Response compression (gzip)
- Memory usage monitoring and cleanup

The web server runs on port 3000 (HTTP) and 3443 (HTTPS), serving static files from the `public/` directory.

## Features

### Core Task Management
- Add new tasks with priority, due dates, and categories
- Edit existing tasks with inline editing
- Delete tasks (individual or bulk operations)
- Mark tasks as completed/incomplete with checkboxes
- Drag & drop reordering with visual feedback
- Search tasks by text content with debounced input
- Filter tasks by category and completion status
- Sort by priority, creation date, due date, or manual order

### User Experience
- User registration and login system
- Responsive design with mobile-first approach
- Dark mode with system preference detection
- PWA support with offline functionality
- Comprehensive keyboard shortcuts
- Toast notifications for user feedback
- Advanced accessibility features (WCAG 2.1)

### Technical Features
- Persistent SQLite storage with optimized indexing
- JWT + Bearer Token authentication
- LRU caching for improved performance
- Service Worker with intelligent caching strategies
- Memory monitoring and automatic cleanup
- Comprehensive error handling and logging
- Full test coverage

## Authentication

The application supports dual authentication methods:

### JWT Authentication (Recommended)
- User registration via web interface
- Secure token-based sessions with configurable expiration
- Password hashing with bcrypt

### Bearer Token (Backward Compatibility)
- Set the `BEARER_TOKEN` environment variable
- Default token: Use secure tokens from `.env.example`
- Frontend automatically includes tokens in requests

**Important**: Always use the secure tokens provided in `.env.example` for production deployments.

## Security Features

### Application Security
- JWT + Bearer token authentication with enhanced validation
- Password security with bcrypt hashing and configurable salt rounds
- Comprehensive input validation with detailed error messages
- SQL injection prevention with parameterized queries
- XSS protection through Content Security Policy and input sanitization

### Network Security
- CORS configuration with environment-based origin whitelisting
- Security headers using Helmet.js (CSP, HSTS, XSS protection, etc.)
- Rate limiting with graduated restrictions (API: 100/15min, Auth: 5/15min)
- HTTPS support with automatic SSL certificate generation
- Secure error responses without information leakage

### Infrastructure Security
- Docker security hardening with non-root user execution (UID 1001)
- Linux capabilities minimization with explicit capability management
- Resource limits (CPU/Memory) and health monitoring
- Structured security event logging with request tracking
- Comprehensive error handling and logging

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

## Performance Optimization

### Backend Optimizations
- **LRU Cache**: Intelligent memory management with configurable TTL
- **Database Indexing**: Composite indexes for commonly used query patterns
- **Response Compression**: gzip compression for all API responses
- **Memory Monitoring**: Automatic detection and cleanup of memory pressure

### Frontend Optimizations  
- **Service Worker**: Advanced caching strategies (Cache-First, Network-First, Stale-While-Revalidate)
- **GPU Acceleration**: CSS transforms for smooth animations
- **Lazy Loading**: Intersection Observer API for efficient rendering
- **Memory Management**: Automatic cleanup and garbage collection triggers

### Monitoring & Debugging
- **Performance Metrics**: Built-in timing measurements for page load and API calls
- **Error Tracking**: Comprehensive error logging with request IDs
- **Cache Statistics**: Monitor cache hit rates and memory usage

## Environment Variables

Key environment variables for development:

```bash
# Security (Required for production)
BEARER_TOKEN=your-secure-64-char-token
JWT_SECRET=your-secure-128-char-secret
JWT_EXPIRES_IN=24h

# Performance (Optional)
CACHE_TTL=300000              # 5 minutes
MAX_CACHE_SIZE=1000           # LRU cache size
ENABLE_COMPRESSION=true       # gzip compression

# Rate Limiting (Optional)
RATE_LIMIT_MAX_REQUESTS=1000  # Development: 1000, Production: 100
AUTH_RATE_LIMIT_MAX=10        # Development: 10, Production: 5
```

See `.env.example` for complete configuration options.