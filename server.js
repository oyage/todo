const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const compression = require('compression');
const { initializeDatabase, getAllTasks, addTask, deleteTask, updateTask, toggleTaskCompletion, reorderTasks, getAllCategories, createUser, getUserByEmail, getUserByUsername, getUserById } = require('./database');
const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Enhanced logging utility
class Logger {
  static ensureLogDir() {
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    return logDir;
  }
  
  static rotateLogFile(logPath, maxSize = 10 * 1024 * 1024) { // 10MB default
    try {
      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        if (stats.size > maxSize) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const rotatedPath = `${logPath}.${timestamp}`;
          fs.renameSync(logPath, rotatedPath);
          console.log(`Log file rotated: ${logPath} -> ${rotatedPath}`);
        }
      }
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }
  
  static cleanOldLogs(logDir, retentionDays = 30) {
    try {
      const files = fs.readdirSync(logDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      files.forEach(file => {
        const filePath = path.join(logDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          console.log(`Old log file deleted: ${file}`);
        }
      });
    } catch (error) {
      console.error('Failed to clean old logs:', error);
    }
  }
  
  static writeToFile(logDir, filename, content) {
    try {
      const logPath = path.join(logDir, filename);
      
      // Rotate log file if it's too large
      this.rotateLogFile(logPath);
      
      fs.appendFileSync(logPath, content + '\n');
      
      // Clean old logs periodically (once per day)
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() < 5) {
        this.cleanOldLogs(logDir);
      }
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }
  
  static log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...meta
    };
    
    const formattedLog = `[${timestamp}] ${level.toUpperCase()}: ${message}${
      Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : ''}`;
    
    // Console output
    console.log(formattedLog);
    
    // File output
    const logDir = this.ensureLogDir();
    const today = new Date().toISOString().split('T')[0];
    
    // Write to daily log file
    this.writeToFile(logDir, `app-${today}.log`, formattedLog);
    
    // Write to level-specific log files
    if (level === 'error') {
      this.writeToFile(logDir, `error-${today}.log`, formattedLog);
    }
  }
  
  static access(req, res, responseTime) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip || req.connection?.remoteAddress || '-',
      userAgent: req.get('User-Agent') || '-',
      requestId: req.requestId || '-',
      contentLength: res.get('Content-Length') || '-',
      referer: req.get('Referer') || '-'
    };
    
    const accessLog = `${timestamp} ${req.ip} "${req.method} ${req.originalUrl || req.url} HTTP/1.1" ${res.statusCode} ${res.get('Content-Length') || '-'} "${req.get('Referer') || '-'}" "${req.get('User-Agent') || '-'}" ${responseTime}ms [${req.requestId || '-'}]`;
    
    // Console output for access logs
    console.log(`ACCESS: ${accessLog}`);
    
    // File output
    const logDir = this.ensureLogDir();
    const today = new Date().toISOString().split('T')[0];
    this.writeToFile(logDir, `access-${today}.log`, accessLog);
  }
  
  static error(message, error = null, meta = {}) {
    this.log('error', message, { 
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : null,
      ...meta 
    });
  }
  
  static warn(message, meta = {}) {
    this.log('warn', message, meta);
  }
  
  static info(message, meta = {}) {
    this.log('info', message, meta);
  }
}

// Enhanced error response utility
class ErrorResponse {
  static badRequest(message, details = null) {
    return {
      error: {
        type: 'VALIDATION_ERROR',
        message,
        details,
        code: 400
      }
    };
  }
  
  static unauthorized(message = 'Unauthorized access') {
    return {
      error: {
        type: 'AUTHENTICATION_ERROR',
        message,
        code: 401
      }
    };
  }
  
  static notFound(resource = 'Resource') {
    return {
      error: {
        type: 'NOT_FOUND_ERROR',
        message: `${resource} not found`,
        code: 404
      }
    };
  }
  
  static serverError(message = 'Internal server error', requestId = null) {
    return {
      error: {
        type: 'SERVER_ERROR',
        message,
        code: 500,
        requestId
      }
    };
  }
}

// Security Configuration
const securityConfig = {
  // CORS設定
  cors: {
    origin: function (origin, callback) {
      // 許可されたオリジンのリスト
      const allowedOrigins = [
        'http://localhost:3000',
        'https://localhost:3000',
        'http://127.0.0.1:3000',
        'https://127.0.0.1:3000',
        'https://localhost:3443',
        'https://127.0.0.1:3443'
      ];
      
      // 開発環境ではより寛容な設定
      if (process.env.NODE_ENV === 'development') {
        allowedOrigins.push('http://localhost:*', 'https://localhost:*');
      }
      
      // 環境変数からの追加許可オリジン
      if (process.env.ALLOWED_ORIGINS) {
        allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(','));
      }
      
      // originがundefined（同一オリジン）または許可リストにある場合は許可
      if (!origin || allowedOrigins.includes(origin) || 
          (process.env.NODE_ENV === 'development' && origin && origin.startsWith('http://localhost')) ||
          (process.env.NODE_ENV === 'development' && origin && origin.startsWith('https://localhost'))) {
        callback(null, true);
      } else {
        Logger.warn('CORS blocked request', { origin, requestId: 'N/A' });
        callback(new Error('CORS policy violation'));
      }
    },
    credentials: true, // クッキーを含むリクエストを許可
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400 // プリフライトリクエストのキャッシュ時間（24時間）
  },
  
  // Rate Limiting設定
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15分
    max: process.env.NODE_ENV === 'production' ? 100 : 1000, // 本番環境では厳しく制限
    message: {
      error: {
        type: 'RATE_LIMIT_ERROR',
        message: 'リクエストが多すぎます。しばらく時間を置いてから再試行してください。',
        code: 429
      }
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      Logger.warn('Rate limit exceeded', { 
        ip: req.ip, 
        userAgent: req.get('User-Agent'),
        requestId: req.requestId || 'N/A'
      });
      res.status(429).json({
        error: {
          type: 'RATE_LIMIT_ERROR',
          message: 'リクエストが多すぎます。しばらく時間を置いてから再試行してください。',
          code: 429
        }
      });
    }
  },
  
  // Helmet設定（セキュリティヘッダー）
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com"],
        scriptSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", "data:"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false, // 互換性のため無効化
    hsts: {
      maxAge: 31536000, // 1年
      includeSubDomains: true,
      preload: true
    }
  }
};

// パフォーマンス最適化ミドルウェア
if (process.env.ENABLE_COMPRESSION !== 'false') {
  app.use(compression({
    level: 6, // 圧縮レベル（1-9、6が推奨）
    threshold: 1024, // 1KB以上のレスポンスを圧縮
    filter: (req, res) => {
      // compressible content-typeかつ、cache-controlがno-transformでない場合に圧縮
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    }
  }));
}

// セキュリティミドルウェアの適用
app.use(helmet(securityConfig.helmet));
app.use(cors(securityConfig.cors));

// Rate Limitingの適用
const limiter = rateLimit(securityConfig.rateLimit);
app.use('/api', limiter); // APIエンドポイントにのみ適用

// より厳しいRate Limitingを認証エンドポイントに適用
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 5, // 認証関連は厳しく制限
  message: {
    error: {
      type: 'AUTH_RATE_LIMIT_ERROR',
      message: '認証試行回数が多すぎます。15分後に再試行してください。',
      code: 429
    }
  }
});

// Access logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Request ID generation
  req.requestId = Math.random().toString(36).substr(2, 9);
  res.setHeader('X-Request-ID', req.requestId);
  
  // セキュリティ関連ヘッダーの追加
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    
    // Log access information
    Logger.access(req, res, responseTime);
    
    // Call original end method
    originalEnd.apply(res, args);
  };
  
  Logger.info(`${req.method} ${req.path}`, { 
    requestId: req.requestId,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    origin: req.get('Origin')
  });
  next();
});

// JSON解析のセキュリティ設定
app.use(express.json({ 
  limit: '10mb', // リクエストサイズ制限
  type: 'application/json'
}));

// 静的ファイル配信にキャッシュヘッダーを追加
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0', // 本番環境では1日キャッシュ
  etag: true,
  lastModified: true,
  setHeaders: (res, path, stat) => {
    // HTML ファイルはキャッシュしない（常に最新版を取得）
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    // CSS/JS ファイルは長期キャッシュ
    else if (path.endsWith('.css') || path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1年
    }
    // 画像ファイルも長期キャッシュ
    else if (path.match(/\.(png|jpg|jpeg|gif|svg|ico)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000'); // 30日
    }
  }
}));

const BEARER_TOKEN = process.env.BEARER_TOKEN || 'your-secret-token';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// パフォーマンス設定
const CACHE_TTL = parseInt(process.env.CACHE_TTL) || 5 * 60 * 1000; // デフォルト5分間キャッシュ
const MAX_CACHE_SIZE = parseInt(process.env.MAX_CACHE_SIZE) || 1000; // 最大キャッシュエントリ数

// LRU（Least Recently Used）キャッシュの実装
class LRUCache {
  constructor(maxSize = MAX_CACHE_SIZE) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }
  
  get(key) {
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      // アクセス時にエントリを削除して再追加（LRU順序の維持）
      this.cache.delete(key);
      this.cache.set(key, value);
      
      // TTL チェック
      if (Date.now() - value.timestamp > CACHE_TTL) {
        this.cache.delete(key);
        return null;
      }
      return value;
    }
    return null;
  }
  
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 最も古いエントリを削除
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, { ...value, timestamp: Date.now() });
  }
  
  delete(key) {
    return this.cache.delete(key);
  }
  
  clear() {
    this.cache.clear();
  }
  
  has(key) {
    const cached = this.get(key);
    return cached !== null;
  }
  
  size() {
    return this.cache.size;
  }
}

// メモリキャッシュの設定
const taskCache = new LRUCache();
const categoryCache = new LRUCache();

// キャッシュクリア関数
function clearTaskCache() {
  taskCache.clear();
  Logger.info('Task cache cleared');
}

function clearCategoryCache() {
  categoryCache.clear();
  Logger.info('Category cache cleared');
}

function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!authHeader) {
      Logger.warn('Authentication failed: No authorization header', { requestId: req.requestId });
      return res.status(401).json(ErrorResponse.unauthorized('No authorization header provided'));
    }
    
    if (!token) {
      Logger.warn('Authentication failed: No token in header', { requestId: req.requestId });
      return res.status(401).json(ErrorResponse.unauthorized('Invalid authorization header format'));
    }
    
    // JWT verification
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        Logger.warn('Authentication failed: Invalid JWT token', { requestId: req.requestId, error: err.message });
        return res.status(401).json(ErrorResponse.unauthorized('Invalid token'));
      }
      
      req.user = decoded; // Add user info to request
      Logger.info('Authentication successful', { requestId: req.requestId, userId: decoded.userId });
      next();
    });
  } catch (error) {
    Logger.error('Authentication error', error, { requestId: req.requestId });
    return res.status(500).json(ErrorResponse.serverError('Authentication service error', req.requestId));
  }
}

// Optional: Keep bearer token authentication for backward compatibility
function authenticateBearerToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!authHeader) {
      Logger.warn('Bearer authentication failed: No authorization header', { requestId: req.requestId });
      return res.status(401).json(ErrorResponse.unauthorized('No authorization header provided'));
    }
    
    if (!token) {
      Logger.warn('Bearer authentication failed: No token in header', { requestId: req.requestId });
      return res.status(401).json(ErrorResponse.unauthorized('Invalid authorization header format'));
    }
    
    if (token !== BEARER_TOKEN) {
      Logger.warn('Bearer authentication failed: Invalid token', { requestId: req.requestId, tokenLength: token.length });
      return res.status(401).json(ErrorResponse.unauthorized('Invalid token'));
    }
    
    Logger.info('Bearer authentication successful', { requestId: req.requestId });
    next();
  } catch (error) {
    Logger.error('Bearer authentication error', error, { requestId: req.requestId });
    return res.status(500).json(ErrorResponse.serverError('Authentication service error', req.requestId));
  }
}

// User authentication endpoints
app.post('/auth/register', authLimiter, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Validation
    const validationErrors = [];
    
    if (!username || typeof username !== 'string' || !username.trim()) {
      validationErrors.push('Username is required');
    } else if (username.trim().length < 3) {
      validationErrors.push('Username must be at least 3 characters long');
    } else if (username.trim().length > 30) {
      validationErrors.push('Username cannot exceed 30 characters');
    }
    
    if (!email || typeof email !== 'string' || !email.trim()) {
      validationErrors.push('Email is required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      validationErrors.push('Invalid email format');
    }
    
    if (!password || typeof password !== 'string') {
      validationErrors.push('Password is required');
    } else if (password.length < 6) {
      validationErrors.push('Password must be at least 6 characters long');
    }
    
    if (validationErrors.length > 0) {
      Logger.warn('User registration validation failed', { requestId: req.requestId, errors: validationErrors });
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', validationErrors));
    }
    
    // Check if user already exists
    const existingUserByEmail = await getUserByEmail(email.trim().toLowerCase());
    if (existingUserByEmail) {
      Logger.warn('Registration failed: Email already exists', { requestId: req.requestId, email: email.trim() });
      return res.status(409).json(ErrorResponse.badRequest('Email already registered'));
    }
    
    const existingUserByUsername = await getUserByUsername(username.trim());
    if (existingUserByUsername) {
      Logger.warn('Registration failed: Username already exists', { requestId: req.requestId, username: username.trim() });
      return res.status(409).json(ErrorResponse.badRequest('Username already taken'));
    }
    
    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    // Create user
    const userId = await createUser(username.trim(), email.trim().toLowerCase(), passwordHash);
    
    // Generate JWT token
    const token = jwt.sign(
      { userId, username: username.trim(), email: email.trim().toLowerCase() },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    Logger.info('User registered successfully', { requestId: req.requestId, userId, username: username.trim() });
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: userId,
        username: username.trim(),
        email: email.trim().toLowerCase()
      },
      token
    });
  } catch (err) {
    Logger.error('Error during user registration', err, { requestId: req.requestId, body: req.body });
    res.status(500).json(ErrorResponse.serverError('Failed to register user', req.requestId));
  }
});

app.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    const validationErrors = [];
    
    if (!email || typeof email !== 'string' || !email.trim()) {
      validationErrors.push('Email is required');
    }
    
    if (!password || typeof password !== 'string') {
      validationErrors.push('Password is required');
    }
    
    if (validationErrors.length > 0) {
      Logger.warn('User login validation failed', { requestId: req.requestId, errors: validationErrors });
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', validationErrors));
    }
    
    // Find user
    const user = await getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      Logger.warn('Login failed: User not found', { requestId: req.requestId, email: email.trim() });
      return res.status(401).json(ErrorResponse.unauthorized('Invalid credentials'));
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      Logger.warn('Login failed: Invalid password', { requestId: req.requestId, userId: user.id });
      return res.status(401).json(ErrorResponse.unauthorized('Invalid credentials'));
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    Logger.info('User logged in successfully', { requestId: req.requestId, userId: user.id, username: user.username });
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token
    });
  } catch (err) {
    Logger.error('Error during user login', err, { requestId: req.requestId, body: req.body });
    res.status(500).json(ErrorResponse.serverError('Failed to login', req.requestId));
  }
});

app.get('/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    if (!user) {
      Logger.warn('User not found for profile', { requestId: req.requestId, userId: req.user.userId });
      return res.status(404).json(ErrorResponse.notFound('User'));
    }
    
    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at
      }
    });
  } catch (err) {
    Logger.error('Error fetching user profile', err, { requestId: req.requestId, userId: req.user.userId });
    res.status(500).json(ErrorResponse.serverError('Failed to fetch user profile', req.requestId));
  }
});

app.get('/tasks', authenticateToken, async (req, res) => {
  try {
    const { search, category, sort } = req.query;
    
    // Validate query parameters
    if (search && typeof search !== 'string') {
      Logger.warn('Invalid search parameter', { requestId: req.requestId, search });
      return res.status(400).json(ErrorResponse.badRequest('Search parameter must be a string'));
    }
    
    if (category && typeof category !== 'string') {
      Logger.warn('Invalid category parameter', { requestId: req.requestId, category });
      return res.status(400).json(ErrorResponse.badRequest('Category parameter must be a string'));
    }
    
    if (sort && !['manual', 'priority', 'created'].includes(sort)) {
      Logger.warn('Invalid sort parameter', { requestId: req.requestId, sort });
      return res.status(400).json(ErrorResponse.badRequest('Sort parameter must be one of: manual, priority, created'));
    }
    
    // キャッシュキーの生成（ユーザーIDを含む）
    const cacheKey = `tasks:${req.user.userId}:${search || ''}:${category || ''}:${sort || 'priority'}`;
    
    // 簡易的なメモリキャッシュ（本番環境ではRedisなどを使用推奨）
    if (taskCache.has(cacheKey)) {
      const cached = taskCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        Logger.info('Serving cached tasks', { requestId: req.requestId, cacheKey, userId: req.user.userId });
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached.data);
      } else {
        taskCache.delete(cacheKey);
      }
    }
    
    Logger.info('Fetching tasks', { requestId: req.requestId, userId: req.user.userId, search, category, sort });
    const tasks = await getAllTasks(req.user.userId, search, category, sort);
    
    const formattedTasks = tasks.map(task => ({ 
      id: task.id,
      text: task.text, 
      priority: task.priority || 'medium',
      due_date: task.due_date,
      category: task.category,
      completed: Boolean(task.completed),
      sort_order: task.sort_order
    }));
    
    // キャッシュに保存
    taskCache.set(cacheKey, {
      data: formattedTasks,
      timestamp: Date.now()
    });
    
    Logger.info('Tasks fetched successfully', { requestId: req.requestId, count: formattedTasks.length });
    res.setHeader('X-Cache', 'MISS');
    res.json(formattedTasks);
  } catch (err) {
    Logger.error('Error fetching tasks', err, { requestId: req.requestId, query: req.query });
    res.status(500).json(ErrorResponse.serverError('Failed to fetch tasks', req.requestId));
  }
});

app.post('/tasks', authenticateToken, async (req, res) => {
  try {
    const { text, priority = 'medium', due_date, category } = req.body;
    
    // Comprehensive validation with detailed error messages
    const validationErrors = [];
    
    if (!text) {
      validationErrors.push('Task text is required');
    } else if (typeof text !== 'string') {
      validationErrors.push('Task text must be a string');
    } else if (!text.trim()) {
      validationErrors.push('Task text cannot be empty');
    } else if (text.trim().length > 200) {
      validationErrors.push('Task text cannot exceed 200 characters');
    }
    
    if (!['high', 'medium', 'low'].includes(priority)) {
      validationErrors.push('Priority must be one of: high, medium, low');
    }
    
    if (due_date) {
      if (typeof due_date !== 'string') {
        validationErrors.push('Due date must be a string');
      } else if (isNaN(Date.parse(due_date))) {
        validationErrors.push('Due date must be in valid date format (YYYY-MM-DD)');
      } else {
        const date = new Date(due_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (date < today) {
          Logger.warn('Due date in the past', { requestId: req.requestId, due_date, today: today.toISOString() });
        }
      }
    }
    
    if (category) {
      if (typeof category !== 'string') {
        validationErrors.push('Category must be a string');
      } else if (category.length > 50) {
        validationErrors.push('Category cannot exceed 50 characters');
      }
    }
    
    if (validationErrors.length > 0) {
      Logger.warn('Task creation validation failed', { requestId: req.requestId, errors: validationErrors, body: req.body });
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', validationErrors));
    }
    
    Logger.info('Creating new task', { requestId: req.requestId, userId: req.user.userId, text: text.trim(), priority, due_date, category });
    const taskId = await addTask(text.trim(), req.user.userId, priority, due_date, category?.trim() || null);
    
    Logger.info('Task created successfully', { requestId: req.requestId, taskId, text: text.trim() });
    
    // タスク追加時にキャッシュをクリア
    clearTaskCache();
    clearCategoryCache();
    
    res.status(201).json({ 
      id: taskId,
      text: text.trim(),
      priority,
      due_date: due_date || null,
      category: category?.trim() || null,
      completed: false
    });
  } catch (err) {
    Logger.error('Error creating task', err, { requestId: req.requestId, body: req.body });
    res.status(500).json(ErrorResponse.serverError('Failed to create task', req.requestId));
  }
});

// New RESTful API endpoints (ID-based routes must be handled more precisely)

// Helper function to check if a string represents a valid positive integer
function isValidTaskId(str) {
  const num = parseInt(str, 10);
  return Number.isInteger(num) && num > 0 && str === num.toString();
}

app.delete('/tasks/:id', authenticateToken, async (req, res, next) => {
  // Only handle if it's a valid positive integer ID
  Logger.info('DELETE /tasks/:id middleware check', { requestId: req.requestId, id: req.params.id, isValid: isValidTaskId(req.params.id) });
  if (!isValidTaskId(req.params.id)) {
    Logger.info('Passing to next route (index-based)', { requestId: req.requestId, id: req.params.id });
    return next(); // Pass to index-based route
  }
  try {
    Logger.info('DELETE /tasks/:id called', { requestId: req.requestId, id: req.params.id });
    const taskId = parseInt(req.params.id, 10);
    
    if (isNaN(taskId) || taskId <= 0) {
      Logger.warn('Invalid task ID parameter', { requestId: req.requestId, id: req.params.id });
      return res.status(400).json(ErrorResponse.badRequest('Task ID must be a valid positive number'));
    }
    
    Logger.info('Deleting task', { requestId: req.requestId, userId: req.user.userId, taskId });
    const deleted = await deleteTask(taskId, req.user.userId);
    
    if (!deleted) {
      Logger.warn('Task not found for deletion', { requestId: req.requestId, taskId });
      return res.status(404).json(ErrorResponse.notFound('Task'));
    }
    
    Logger.info('Task deleted successfully', { requestId: req.requestId, taskId });
    
    // タスク削除時にキャッシュをクリア
    clearTaskCache();
    clearCategoryCache();
    
    res.status(204).send();
  } catch (err) {
    Logger.error('Error deleting task', err, { requestId: req.requestId, id: req.params.id });
    res.status(500).json(ErrorResponse.serverError('Failed to delete task', req.requestId));
  }
});

app.put('/tasks/:id', authenticateToken, async (req, res, next) => {
  // Only handle if it's a valid positive integer ID
  if (!isValidTaskId(req.params.id)) {
    return next(); // Pass to index-based route
  }
  try {
    const taskId = parseInt(req.params.id, 10);
    
    if (isNaN(taskId) || taskId <= 0) {
      Logger.warn('Invalid task ID for update', { requestId: req.requestId, id: req.params.id });
      return res.status(400).json(ErrorResponse.badRequest('Task ID must be a valid positive number'));
    }
    const { text, task, priority, due_date, category, completed } = req.body;
    
    // Support both 'text' (preferred) and 'task' (backward compatibility) fields
    const taskText = text || task;
    
    const validationErrors = [];
    
    if (!taskText) {
      validationErrors.push('Task text is required');
    } else if (typeof taskText !== 'string') {
      validationErrors.push('Task text must be a string');
    } else if (!taskText.trim()) {
      validationErrors.push('Task text cannot be empty');
    } else if (taskText.trim().length > 200) {
      validationErrors.push('Task text cannot exceed 200 characters');
    }
    
    if (priority !== undefined && !['high', 'medium', 'low'].includes(priority)) {
      validationErrors.push('Priority must be one of: high, medium, low');
    }
    
    if (due_date !== undefined && due_date !== null) {
      if (typeof due_date !== 'string') {
        validationErrors.push('Due date must be a string');
      } else if (isNaN(Date.parse(due_date))) {
        validationErrors.push('Due date must be in valid date format (YYYY-MM-DD)');
      }
    }
    
    if (category !== undefined && category !== null) {
      if (typeof category !== 'string') {
        validationErrors.push('Category must be a string');
      } else if (category.length > 50) {
        validationErrors.push('Category cannot exceed 50 characters');
      }
    }
    
    if (completed !== undefined && typeof completed !== 'boolean') {
      validationErrors.push('Completed status must be a boolean');
    }
    
    if (validationErrors.length > 0) {
      Logger.warn('Task update validation failed', { requestId: req.requestId, errors: validationErrors, body: req.body });
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', validationErrors));
    }
    
    Logger.info('Updating task', { requestId: req.requestId, userId: req.user.userId, taskId, newText: taskText.trim() });
    
    const updated = await updateTask(taskId, req.user.userId, taskText.trim(), priority, due_date, category?.trim() || null, completed);
    
    if (!updated) {
      Logger.warn('Task not found for update', { requestId: req.requestId, taskId });
      return res.status(404).json(ErrorResponse.notFound('Task'));
    }
    
    Logger.info('Task updated successfully', { requestId: req.requestId, taskId, newText: taskText.trim() });
    
    // タスク更新時にキャッシュをクリア
    clearTaskCache();
    clearCategoryCache();
    
    res.json({ 
      id: taskId,
      text: taskText.trim(),
      priority: priority || 'medium',
      due_date: due_date || null,
      category: category?.trim() || null,
      completed: completed || false
    });
  } catch (err) {
    Logger.error('Error updating task', err, { requestId: req.requestId, id: req.params.id, body: req.body });
    res.status(500).json(ErrorResponse.serverError('Failed to update task', req.requestId));
  }
});

app.patch('/tasks/:id', authenticateToken, async (req, res, next) => {
  // Only handle if it's a valid positive integer ID
  if (!isValidTaskId(req.params.id)) {
    return next(); // Pass to index-based route
  }
  try {
    const taskId = parseInt(req.params.id, 10);
    
    if (isNaN(taskId) || taskId <= 0) {
      Logger.warn('Invalid task ID for patch', { requestId: req.requestId, id: req.params.id });
      return res.status(400).json(ErrorResponse.badRequest('Task ID must be a valid positive number'));
    }
    const { completed } = req.body || {};
    
    if (completed !== undefined && typeof completed !== 'boolean') {
      Logger.warn('Invalid completed value for patch', { requestId: req.requestId, completed });
      return res.status(400).json(ErrorResponse.badRequest('Completed status must be a boolean'));
    }
    
    Logger.info('Patching task', { requestId: req.requestId, taskId, completed });
    
    let updated;
    if (completed !== undefined) {
      const tasks = await getAllTasks(req.user.userId);
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        Logger.warn('Task not found for patch', { requestId: req.requestId, taskId });
        return res.status(404).json(ErrorResponse.notFound('Task'));
      }
      updated = await updateTask(taskId, req.user.userId, task.text, task.priority, task.due_date, task.category, completed);
    } else {
      updated = await toggleTaskCompletion(taskId, req.user.userId);
    }
    
    if (!updated) {
      Logger.warn('Task not found for patch', { requestId: req.requestId, taskId });
      return res.status(404).json(ErrorResponse.notFound('Task'));
    }
    
    Logger.info('Task patched successfully', { requestId: req.requestId, taskId });
    
    // タスク更新時にキャッシュをクリア
    clearTaskCache();
    
    res.status(204).send();
  } catch (err) {
    Logger.error('Error patching task', err, { requestId: req.requestId, id: req.params.id });
    res.status(500).json(ErrorResponse.serverError('Failed to patch task', req.requestId));
  }
});

// Backward compatibility endpoints (deprecated) - must be before new API endpoints

app.put('/tasks/:index', authenticateToken, async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    const { task, text, priority, due_date, category, completed } = req.body;
    
    if (isNaN(idx) || idx < 0) {
      return res.status(400).json(ErrorResponse.badRequest('Index must be a valid non-negative number'));
    }
    
    const tasks = await getAllTasks(req.user.userId);
    if (idx >= tasks.length) {
      return res.status(400).json(ErrorResponse.badRequest(`Index ${idx} is out of range`));
    }
    
    // Support both 'task' (old API) and 'text' (new API) fields
    const taskText = text || task;
    
    const validationErrors = [];
    
    if (!taskText) {
      validationErrors.push('Task text is required');
    } else if (typeof taskText !== 'string') {
      validationErrors.push('Task text must be a string');
    } else if (!taskText.trim()) {
      validationErrors.push('Task text cannot be empty');
    } else if (taskText.trim().length > 200) {
      validationErrors.push('Task text cannot exceed 200 characters');
    }
    
    if (priority !== undefined && !['high', 'medium', 'low'].includes(priority)) {
      validationErrors.push('Priority must be one of: high, medium, low');
    }
    
    if (due_date !== undefined && due_date !== null) {
      if (typeof due_date !== 'string') {
        validationErrors.push('Due date must be a string');
      } else if (isNaN(Date.parse(due_date))) {
        validationErrors.push('Due date must be in valid date format (YYYY-MM-DD)');
      }
    }
    
    if (category !== undefined && category !== null) {
      if (typeof category !== 'string') {
        validationErrors.push('Category must be a string');
      } else if (category.length > 50) {
        validationErrors.push('Category cannot exceed 50 characters');
      }
    }
    
    if (completed !== undefined && typeof completed !== 'boolean') {
      validationErrors.push('Completed status must be a boolean');
    }
    
    if (validationErrors.length > 0) {
      Logger.warn('Task update validation failed', { requestId: req.requestId, errors: validationErrors, body: req.body });
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', validationErrors));
    }
    
    const taskId = tasks[idx].id;
    const updated = await updateTask(taskId, req.user.userId, taskText.trim(), priority, due_date, category?.trim() || null, completed);
    
    if (!updated) {
      return res.status(404).json(ErrorResponse.notFound('Task'));
    }
    
    clearTaskCache();
    clearCategoryCache();
    
    res.json({ message: 'Task updated successfully', task: taskText.trim() });
  } catch (err) {
    Logger.error('Error in deprecated update endpoint', err, { requestId: req.requestId });
    res.status(500).json(ErrorResponse.serverError('Failed to update task', req.requestId));
  }
});

app.patch('/tasks/:index/toggle', authenticateToken, async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    
    if (isNaN(idx) || idx < 0) {
      return res.status(400).json(ErrorResponse.badRequest('Index must be a valid non-negative number'));
    }
    
    const tasks = await getAllTasks(req.user.userId);
    if (idx >= tasks.length) {
      return res.status(400).json(ErrorResponse.badRequest(`Index ${idx} is out of range`));
    }
    
    const taskId = tasks[idx].id;
    Logger.info('Toggle task completion', { requestId: req.requestId, taskId, index: idx, currentCompleted: tasks[idx].completed });
    
    const updated = await toggleTaskCompletion(taskId, req.user.userId);
    
    if (!updated) {
      return res.status(404).json(ErrorResponse.notFound('Task'));
    }
    
    // Clear cache after toggling
    clearTaskCache();
    
    res.json({ message: 'Task completion toggled successfully' });
  } catch (err) {
    Logger.error('Error in deprecated toggle endpoint', err, { requestId: req.requestId });
    res.status(500).json(ErrorResponse.serverError('Failed to toggle task', req.requestId));
  }
});

app.delete('/tasks/:index', authenticateToken, async (req, res) => {
  try {
    Logger.info('DELETE /tasks/:index called', { requestId: req.requestId, index: req.params.index });
    const idx = parseInt(req.params.index, 10);
    
    if (isNaN(idx) || idx < 0) {
      return res.status(400).json(ErrorResponse.badRequest('Index must be a valid non-negative number'));
    }
    
    const tasks = await getAllTasks(req.user.userId);
    if (idx >= tasks.length) {
      return res.status(400).json(ErrorResponse.badRequest(`Index ${idx} is out of range`));
    }
    
    const taskId = tasks[idx].id;
    const deleted = await deleteTask(taskId, req.user.userId);
    
    if (!deleted) {
      return res.status(404).json(ErrorResponse.notFound('Task'));
    }
    
    clearTaskCache();
    clearCategoryCache();
    
    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (err) {
    Logger.error('Error in deprecated delete endpoint', err, { requestId: req.requestId });
    res.status(500).json(ErrorResponse.serverError('Failed to delete task', req.requestId));
  }
});

app.post('/tasks/bulk-delete', authenticateToken, async (req, res) => {
  try {
    const { indices } = req.body;
    
    const validationErrors = [];
    
    if (!Array.isArray(indices)) {
      validationErrors.push('Indices must be an array');
    } else if (indices.length === 0) {
      validationErrors.push('At least one index must be provided');
    }
    
    if (validationErrors.length > 0) {
      Logger.warn('Bulk delete validation failed', { requestId: req.requestId, errors: validationErrors });
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', validationErrors));
    }
    
    const tasks = await getAllTasks(req.user.userId);
    const validIndices = indices.filter(idx => 
      Number.isInteger(idx) && idx >= 0 && idx < tasks.length
    );
    
    if (validIndices.length === 0) {
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', ['No valid indices provided']));
    }
    
    let deletedCount = 0;
    for (const idx of validIndices.sort((a, b) => b - a)) {
      const deleted = await deleteTask(tasks[idx].id, req.user.userId);
      if (deleted) deletedCount++;
    }
    
    clearTaskCache();
    clearCategoryCache();
    
    res.json({ message: `${deletedCount} tasks deleted` });
  } catch (err) {
    Logger.error('Error in deprecated bulk delete endpoint', err, { requestId: req.requestId });
    res.status(500).json(ErrorResponse.serverError('Failed to bulk delete tasks', req.requestId));
  }
});

app.post('/tasks/bulk-complete', authenticateToken, async (req, res) => {
  try {
    const { indices, completed } = req.body;
    
    const validationErrors = [];
    
    if (!Array.isArray(indices)) {
      validationErrors.push('Indices must be an array');
    } else if (indices.length === 0) {
      validationErrors.push('At least one index must be provided');
    }
    
    if (typeof completed !== 'boolean') {
      validationErrors.push('Completed status must be a boolean');
    }
    
    if (validationErrors.length > 0) {
      Logger.warn('Bulk complete validation failed', { requestId: req.requestId, errors: validationErrors });
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', validationErrors));
    }
    
    const tasks = await getAllTasks(req.user.userId);
    const validIndices = indices.filter(idx => 
      Number.isInteger(idx) && idx >= 0 && idx < tasks.length
    );
    
    if (validIndices.length === 0) {
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', ['No valid indices provided']));
    }
    
    let updatedCount = 0;
    for (const idx of validIndices) {
      const task = tasks[idx];
      const updated = await updateTask(task.id, req.user.userId, task.text, task.priority, task.due_date, task.category, completed);
      if (updated) updatedCount++;
    }
    
    clearTaskCache();
    
    res.json({ message: `${updatedCount} tasks updated` });
  } catch (err) {
    Logger.error('Error in deprecated bulk complete endpoint', err, { requestId: req.requestId });
    res.status(500).json(ErrorResponse.serverError('Failed to bulk complete tasks', req.requestId));
  }
});

app.delete('/tasks', authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body;
    
    const validationErrors = [];
    
    if (!Array.isArray(ids)) {
      validationErrors.push('IDs must be an array');
    } else if (ids.length === 0) {
      validationErrors.push('At least one task ID must be provided');
    }
    
    if (validationErrors.length > 0) {
      Logger.warn('Bulk delete validation failed', { requestId: req.requestId, errors: validationErrors });
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', validationErrors));
    }
    
    const validIds = ids.filter(id => Number.isInteger(id) && id > 0);
    
    if (validIds.length === 0) {
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', ['No valid task IDs provided']));
    }
    
    let deletedCount = 0;
    
    for (const taskId of validIds) {
      const deleted = await deleteTask(taskId, req.user.userId);
      if (deleted) deletedCount++;
    }
    
    Logger.info('Bulk delete completed', { requestId: req.requestId, deletedCount, requestedCount: validIds.length });
    
    // 一括削除時にキャッシュをクリア
    clearTaskCache();
    clearCategoryCache();
    
    res.json({ deleted: deletedCount });
  } catch (err) {
    Logger.error('Error in bulk delete operation', err, { requestId: req.requestId });
    res.status(500).json(ErrorResponse.serverError('Failed to bulk delete tasks', req.requestId));
  }
});

app.patch('/tasks', authenticateToken, async (req, res) => {
  try {
    const { ids, completed } = req.body;
    
    const validationErrors = [];
    
    if (!Array.isArray(ids)) {
      validationErrors.push('IDs must be an array');
    } else if (ids.length === 0) {
      validationErrors.push('At least one task ID must be provided');
    }
    
    if (typeof completed !== 'boolean') {
      validationErrors.push('Completed status must be a boolean');
    }
    
    if (validationErrors.length > 0) {
      Logger.warn('Bulk patch validation failed', { requestId: req.requestId, errors: validationErrors });
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', validationErrors));
    }
    
    const validIds = ids.filter(id => Number.isInteger(id) && id > 0);
    
    if (validIds.length === 0) {
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', ['No valid task IDs provided']));
    }
    
    const tasks = await getAllTasks(req.user.userId);
    let updatedCount = 0;
    
    for (const taskId of validIds) {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        const updated = await updateTask(taskId, req.user.userId, task.text, task.priority, task.due_date, task.category, completed);
        if (updated) updatedCount++;
      }
    }
    
    Logger.info('Bulk patch completed', { requestId: req.requestId, updatedCount, requestedCount: validIds.length });
    
    // 一括更新時にキャッシュをクリア
    clearTaskCache();
    
    res.json({ updated: updatedCount });
  } catch (err) {
    Logger.error('Error in bulk patch operation', err, { requestId: req.requestId });
    res.status(500).json(ErrorResponse.serverError('Failed to bulk patch tasks', req.requestId));
  }
});

app.post('/tasks/reorder', authenticateToken, async (req, res) => {
  try {
    const { taskOrders } = req.body;
    if (!Array.isArray(taskOrders) || taskOrders.length === 0) {
      return res.status(400).json({ error: 'invalid taskOrders array' });
    }
    
    // Validate each task order object
    for (const item of taskOrders) {
      if (!Number.isInteger(item.id) || !Number.isInteger(item.sort_order)) {
        return res.status(400).json({ error: 'invalid task order format' });
      }
    }
    
    const updated = await reorderTasks(taskOrders);
    if (!updated) {
      return res.status(500).json({ error: 'failed to reorder tasks' });
    }
    
    // タスク並び替え時にキャッシュをクリア
    clearTaskCache();
    
    Logger.info('Task reorder completed', { requestId: req.requestId, taskCount: taskOrders.length });
    res.json({ message: 'tasks reordered successfully' });
  } catch (err) {
    console.error('Error in POST /tasks/reorder:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/categories', authenticateToken, async (req, res) => {
  try {
    const cacheKey = `categories:${req.user.userId}`;
    
    // カテゴリキャッシュチェック
    if (categoryCache.has(cacheKey)) {
      const cached = categoryCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        Logger.info('Serving cached categories', { requestId: req.requestId, userId: req.user.userId });
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached.data);
      } else {
        categoryCache.delete(cacheKey);
      }
    }
    
    Logger.info('Fetching categories', { requestId: req.requestId, userId: req.user.userId });
    const categories = await getAllCategories(req.user.userId);
    
    // カテゴリキャッシュに保存
    categoryCache.set(cacheKey, {
      data: categories,
      timestamp: Date.now()
    });
    
    Logger.info('Categories fetched successfully', { requestId: req.requestId, userId: req.user.userId, count: categories.length });
    res.setHeader('X-Cache', 'MISS');
    res.json(categories);
  } catch (err) {
    Logger.error('Error fetching categories', err, { requestId: req.requestId, userId: req.user.userId });
    res.status(500).json(ErrorResponse.serverError('Failed to fetch categories', req.requestId));
  }
});

// Enhanced global error handler middleware
app.use((err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  const errorId = Math.random().toString(36).substr(2, 9);
  
  // Detailed error logging
  const errorDetails = {
    errorId,
    requestId,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
    body: req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' ? req.body : undefined,
    query: req.query,
    params: req.params,
    headers: {
      'content-type': req.get('Content-Type'),
      'authorization': req.get('Authorization') ? '[PRESENT]' : '[ABSENT]',
      'origin': req.get('Origin')
    }
  };
  
  Logger.error('Unhandled application error', err, errorDetails);
  
  // Handle specific error types
  if (err.type === 'entity.parse.failed') {
    Logger.warn('JSON parse error', { errorId, requestId, contentType: req.get('Content-Type') });
    return res.status(400).json(ErrorResponse.badRequest('Invalid JSON in request body'));
  }
  
  if (err.type === 'entity.too.large') {
    Logger.warn('Request entity too large', { errorId, requestId, contentLength: req.get('Content-Length') });
    return res.status(413).json(ErrorResponse.badRequest('Request body too large'));
  }
  
  if (err.code === 'EBADCSRFTOKEN') {
    Logger.warn('CSRF token error', { errorId, requestId });
    return res.status(403).json(ErrorResponse.unauthorized('Invalid CSRF token'));
  }
  
  if (err.status === 404) {
    Logger.warn('Route not found error', { errorId, requestId, originalUrl: req.originalUrl });
    return res.status(404).json(ErrorResponse.notFound('Endpoint'));
  }
  
  // Rate limiting errors
  if (err.statusCode === 429) {
    Logger.warn('Rate limit error handled', { errorId, requestId });
    return res.status(429).json(ErrorResponse.badRequest('Too many requests'));
  }
  
  // Database errors
  if (err.code && err.code.startsWith('SQLITE_')) {
    Logger.error('Database error', err, { errorId, requestId, sqliteCode: err.code });
    return res.status(500).json(ErrorResponse.serverError('Database operation failed', requestId));
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    Logger.warn('JWT authentication error', { errorId, requestId, errorName: err.name });
    return res.status(401).json(ErrorResponse.unauthorized('Invalid or expired token'));
  }
  
  // Default server error
  Logger.error('Unhandled server error', err, { errorId, requestId });
  res.status(500).json(ErrorResponse.serverError('An unexpected error occurred', requestId));
});


// 404 handler for undefined routes
app.use((req, res) => {
  Logger.warn('Route not found', { requestId: req.requestId, path: req.path, method: req.method });
  res.status(404).json(ErrorResponse.notFound('Endpoint'));
});

// グローバルエラーハンドラー
process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Promise Rejection', reason, { promise });
});

process.on('uncaughtException', (error) => {
  Logger.error('Uncaught Exception', error);
  process.exit(1);
});

// HTTPS設定とサーバー起動
function createHTTPSOptions() {
  try {
    // 環境変数またはデフォルトパス
    const sslPath = process.env.SSL_PATH || path.join(__dirname, 'ssl');
    const keyPath = process.env.SSL_KEY_PATH || path.join(sslPath, 'private.key');
    const certPath = process.env.SSL_CERT_PATH || path.join(sslPath, 'cert.pem');
    
    Logger.info('Checking SSL certificates', { keyPath, certPath });
    
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      Logger.info('SSL certificates found, creating HTTPS server');
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
    } else {
      Logger.warn('SSL certificates not found. HTTPS server will not start.', {
        keyPath,
        certPath,
        keyExists: fs.existsSync(keyPath),
        certExists: fs.existsSync(certPath)
      });
      return null;
    }
  } catch (error) {
    Logger.error('Failed to load SSL certificates', error);
    return null;
  }
}

// HTTPからHTTPSへのリダイレクト機能
function createRedirectToHTTPS() {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_HTTPS_REDIRECT === 'true') {
    return (req, res, next) => {
      if (req.header('x-forwarded-proto') !== 'https') {
        Logger.info('Redirecting to HTTPS', { originalUrl: req.originalUrl, ip: req.ip });
        res.redirect(`https://${req.header('host')}${req.url}`);
      } else {
        next();
      }
    };
  }
  return (req, res, next) => next();
}

// HTTPSリダイレクトミドルウェアの適用
app.use(createRedirectToHTTPS());

// Initialize logging on startup
function initializeLogging() {
  try {
    const logDir = Logger.ensureLogDir();
    Logger.info('Logging system initialized', { logDir });
    
    // Clean old logs on startup
    Logger.cleanOldLogs(logDir);
    
    // Set up periodic log cleanup (every 24 hours)
    setInterval(() => {
      Logger.cleanOldLogs(logDir);
    }, 24 * 60 * 60 * 1000);
    
  } catch (error) {
    console.error('Failed to initialize logging:', error);
  }
}

if (require.main === module) {
  // Initialize logging first
  initializeLogging();
  
  initializeDatabase().then(() => {
    // HTTPサーバーの起動
    const httpServer = app.listen(PORT, () => {
      Logger.info(`HTTP Server started successfully`, { 
        port: PORT, 
        url: `http://localhost:${PORT}`,
        env: process.env.NODE_ENV || 'development'
      });
    });
    
    httpServer.on('error', (error) => {
      Logger.error('HTTP Server error', error);
      process.exit(1);
    });
    
    // HTTPSサーバーの起動（SSL証明書が利用可能な場合）
    const httpsOptions = createHTTPSOptions();
    let httpsServer = null;
    if (httpsOptions) {
      httpsServer = https.createServer(httpsOptions, app);
      
      httpsServer.listen(HTTPS_PORT, () => {
        Logger.info(`HTTPS Server started successfully`, { 
          port: HTTPS_PORT, 
          url: `https://localhost:${HTTPS_PORT}`,
          env: process.env.NODE_ENV || 'development'
        });
      });
      
      httpsServer.on('error', (error) => {
        Logger.error('HTTPS Server error', error);
        // HTTPSサーバーのエラーでアプリ全体を停止しない
      });
    } else {
      Logger.info('HTTPS server not started - SSL certificates not available');
      if (process.env.NODE_ENV === 'development') {
        Logger.info('To enable HTTPS in development, run: npm run generate-ssl-cert');
      }
    }
    
    // Graceful shutdown handling
    const shutdown = (signal) => {
      Logger.info(`Received ${signal} signal, shutting down gracefully`);
      
      httpServer.close((err) => {
        if (err) {
          Logger.error('Error during HTTP server shutdown', err);
        } else {
          Logger.info('HTTP server closed');
        }
        
        if (httpsServer) {
          httpsServer.close((httpsErr) => {
            if (httpsErr) {
              Logger.error('Error during HTTPS server shutdown', httpsErr);
            } else {
              Logger.info('HTTPS server closed');
            }
            process.exit(0);
          });
        } else {
          process.exit(0);
        }
      });
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  }).catch(err => {
    Logger.error('Failed to initialize database', err);
    process.exit(1);
  });
}

module.exports = app;
