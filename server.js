const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initializeDatabase, getAllTasks, addTask, deleteTask, updateTask, toggleTaskCompletion, reorderTasks, getAllCategories } = require('./database');
const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Enhanced logging utility
class Logger {
  static log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...meta
    };
    
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, 
      Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '');
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

// Request ID middleware for tracking
app.use((req, res, next) => {
  req.requestId = Math.random().toString(36).substr(2, 9);
  res.setHeader('X-Request-ID', req.requestId);
  
  // セキュリティ関連ヘッダーの追加
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
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

// メモリキャッシュの設定
const taskCache = new Map();
const categoryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分間キャッシュ

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
    
    if (token !== BEARER_TOKEN) {
      Logger.warn('Authentication failed: Invalid token', { requestId: req.requestId, tokenLength: token.length });
      return res.status(401).json(ErrorResponse.unauthorized('Invalid token'));
    }
    
    Logger.info('Authentication successful', { requestId: req.requestId });
    next();
  } catch (error) {
    Logger.error('Authentication error', error, { requestId: req.requestId });
    return res.status(500).json(ErrorResponse.serverError('Authentication service error', req.requestId));
  }
}


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
    
    // キャッシュキーの生成
    const cacheKey = `tasks:${search || ''}:${category || ''}:${sort || 'priority'}`;
    
    // 簡易的なメモリキャッシュ（本番環境ではRedisなどを使用推奨）
    if (taskCache.has(cacheKey)) {
      const cached = taskCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        Logger.info('Serving cached tasks', { requestId: req.requestId, cacheKey });
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached.data);
      } else {
        taskCache.delete(cacheKey);
      }
    }
    
    Logger.info('Fetching tasks', { requestId: req.requestId, search, category, sort });
    const tasks = await getAllTasks(search, category, sort);
    
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
    
    Logger.info('Creating new task', { requestId: req.requestId, text: text.trim(), priority, due_date, category });
    const taskId = await addTask(text.trim(), priority, due_date, category?.trim() || null);
    
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

// New RESTful API endpoints

app.delete('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    
    if (isNaN(taskId) || taskId <= 0) {
      Logger.warn('Invalid task ID parameter', { requestId: req.requestId, id: req.params.id });
      return res.status(400).json(ErrorResponse.badRequest('Task ID must be a valid positive number'));
    }
    
    Logger.info('Deleting task', { requestId: req.requestId, taskId });
    const deleted = await deleteTask(taskId);
    
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

app.put('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { text, priority, due_date, category, completed } = req.body;
    
    if (isNaN(taskId) || taskId <= 0) {
      Logger.warn('Invalid task ID for update', { requestId: req.requestId, id: req.params.id });
      return res.status(400).json(ErrorResponse.badRequest('Task ID must be a valid positive number'));
    }
    
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
    
    Logger.info('Updating task', { requestId: req.requestId, taskId, newText: text.trim() });
    
    const updated = await updateTask(taskId, text.trim(), priority, due_date, category?.trim() || null, completed);
    
    if (!updated) {
      Logger.warn('Task not found for update', { requestId: req.requestId, taskId });
      return res.status(404).json(ErrorResponse.notFound('Task'));
    }
    
    Logger.info('Task updated successfully', { requestId: req.requestId, taskId, newText: text.trim() });
    
    // タスク更新時にキャッシュをクリア
    clearTaskCache();
    clearCategoryCache();
    
    res.json({ 
      id: taskId,
      text: text.trim(),
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

app.patch('/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { completed } = req.body || {};
    
    if (isNaN(taskId) || taskId <= 0) {
      Logger.warn('Invalid task ID for patch', { requestId: req.requestId, id: req.params.id });
      return res.status(400).json(ErrorResponse.badRequest('Task ID must be a valid positive number'));
    }
    
    if (completed !== undefined && typeof completed !== 'boolean') {
      Logger.warn('Invalid completed value for patch', { requestId: req.requestId, completed });
      return res.status(400).json(ErrorResponse.badRequest('Completed status must be a boolean'));
    }
    
    Logger.info('Patching task', { requestId: req.requestId, taskId, completed });
    
    let updated;
    if (completed !== undefined) {
      const tasks = await getAllTasks();
      const task = tasks.find(t => t.id === taskId);
      if (!task) {
        Logger.warn('Task not found for patch', { requestId: req.requestId, taskId });
        return res.status(404).json(ErrorResponse.notFound('Task'));
      }
      updated = await updateTask(taskId, task.text, task.priority, task.due_date, task.category, completed);
    } else {
      updated = await toggleTaskCompletion(taskId);
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
      const deleted = await deleteTask(taskId);
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
    
    const tasks = await getAllTasks();
    let updatedCount = 0;
    
    for (const taskId of validIds) {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        const updated = await updateTask(taskId, task.text, task.priority, task.due_date, task.category, completed);
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
    const cacheKey = 'categories:all';
    
    // カテゴリキャッシュチェック
    if (categoryCache.has(cacheKey)) {
      const cached = categoryCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL) {
        Logger.info('Serving cached categories', { requestId: req.requestId });
        res.setHeader('X-Cache', 'HIT');
        return res.json(cached.data);
      } else {
        categoryCache.delete(cacheKey);
      }
    }
    
    Logger.info('Fetching categories', { requestId: req.requestId });
    const categories = await getAllCategories();
    
    // カテゴリキャッシュに保存
    categoryCache.set(cacheKey, {
      data: categories,
      timestamp: Date.now()
    });
    
    Logger.info('Categories fetched successfully', { requestId: req.requestId, count: categories.length });
    res.setHeader('X-Cache', 'MISS');
    res.json(categories);
  } catch (err) {
    Logger.error('Error fetching categories', err, { requestId: req.requestId });
    res.status(500).json(ErrorResponse.serverError('Failed to fetch categories', req.requestId));
  }
});

// Global error handler middleware
app.use((err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  
  Logger.error('Unhandled error', err, { requestId, path: req.path, method: req.method });
  
  // Handle specific error types
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(ErrorResponse.badRequest('Invalid JSON in request body'));
  }
  
  if (err.type === 'entity.too.large') {
    return res.status(413).json(ErrorResponse.badRequest('Request body too large'));
  }
  
  // Default server error
  res.status(500).json(ErrorResponse.serverError('An unexpected error occurred', requestId));
});

// Backward compatibility endpoints (deprecated)
app.delete('/tasks/:index', authenticateToken, async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    
    if (isNaN(idx) || idx < 0) {
      return res.status(400).json(ErrorResponse.badRequest('Index must be a valid non-negative number'));
    }
    
    const tasks = await getAllTasks();
    if (idx >= tasks.length) {
      return res.status(400).json(ErrorResponse.badRequest(`Index ${idx} is out of range`));
    }
    
    const taskId = tasks[idx].id;
    const deleted = await deleteTask(taskId);
    
    if (!deleted) {
      return res.status(404).json(ErrorResponse.notFound('Task'));
    }
    
    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    Logger.error('Error in deprecated delete endpoint', err, { requestId: req.requestId });
    res.status(500).json(ErrorResponse.serverError('Failed to delete task', req.requestId));
  }
});

app.put('/tasks/:index', authenticateToken, async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    const { task, priority, due_date, category, completed } = req.body;
    
    if (isNaN(idx) || idx < 0) {
      return res.status(400).json(ErrorResponse.badRequest('Index must be a valid non-negative number'));
    }
    
    const tasks = await getAllTasks();
    if (idx >= tasks.length) {
      return res.status(400).json(ErrorResponse.badRequest(`Index ${idx} is out of range`));
    }
    
    const taskId = tasks[idx].id;
    const updated = await updateTask(taskId, task, priority, due_date, category, completed);
    
    if (!updated) {
      return res.status(404).json(ErrorResponse.notFound('Task'));
    }
    
    res.json({ message: 'Task updated successfully', task });
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
    
    const tasks = await getAllTasks();
    if (idx >= tasks.length) {
      return res.status(400).json(ErrorResponse.badRequest(`Index ${idx} is out of range`));
    }
    
    const taskId = tasks[idx].id;
    const updated = await toggleTaskCompletion(taskId);
    
    if (!updated) {
      return res.status(404).json(ErrorResponse.notFound('Task'));
    }
    
    res.json({ message: 'Task completion toggled successfully' });
  } catch (err) {
    Logger.error('Error in deprecated toggle endpoint', err, { requestId: req.requestId });
    res.status(500).json(ErrorResponse.serverError('Failed to toggle task', req.requestId));
  }
});

app.post('/tasks/bulk-delete', authenticateToken, async (req, res) => {
  try {
    const { indices } = req.body;
    
    if (!Array.isArray(indices) || indices.length === 0) {
      return res.status(400).json(ErrorResponse.badRequest('Valid indices array required'));
    }
    
    const tasks = await getAllTasks();
    const validIndices = indices.filter(idx => 
      Number.isInteger(idx) && idx >= 0 && idx < tasks.length
    );
    
    let deletedCount = 0;
    for (const idx of validIndices.sort((a, b) => b - a)) {
      const deleted = await deleteTask(tasks[idx].id);
      if (deleted) deletedCount++;
    }
    
    res.json({ message: `${deletedCount} tasks deleted` });
  } catch (err) {
    Logger.error('Error in deprecated bulk delete endpoint', err, { requestId: req.requestId });
    res.status(500).json(ErrorResponse.serverError('Failed to bulk delete tasks', req.requestId));
  }
});

app.post('/tasks/bulk-complete', authenticateToken, async (req, res) => {
  try {
    const { indices, completed } = req.body;
    
    if (!Array.isArray(indices) || indices.length === 0 || typeof completed !== 'boolean') {
      return res.status(400).json(ErrorResponse.badRequest('Valid indices array and completed boolean required'));
    }
    
    const tasks = await getAllTasks();
    const validIndices = indices.filter(idx => 
      Number.isInteger(idx) && idx >= 0 && idx < tasks.length
    );
    
    let updatedCount = 0;
    for (const idx of validIndices) {
      const task = tasks[idx];
      const updated = await updateTask(task.id, task.text, task.priority, task.due_date, task.category, completed);
      if (updated) updatedCount++;
    }
    
    res.json({ message: `${updatedCount} tasks updated` });
  } catch (err) {
    Logger.error('Error in deprecated bulk complete endpoint', err, { requestId: req.requestId });
    res.status(500).json(ErrorResponse.serverError('Failed to bulk complete tasks', req.requestId));
  }
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

if (require.main === module) {
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
