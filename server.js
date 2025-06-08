const express = require('express');
const path = require('path');
const { initializeDatabase, getAllTasks, addTask, deleteTask, updateTask, toggleTaskCompletion, reorderTasks, getAllCategories } = require('./database');
const app = express();
const PORT = process.env.PORT || 3000;

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

// Request ID middleware for tracking
app.use((req, res, next) => {
  req.requestId = Math.random().toString(36).substr(2, 9);
  res.setHeader('X-Request-ID', req.requestId);
  Logger.info(`${req.method} ${req.path}`, { 
    requestId: req.requestId,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BEARER_TOKEN = process.env.BEARER_TOKEN || 'your-secret-token';

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
    
    Logger.info('Tasks fetched successfully', { requestId: req.requestId, count: formattedTasks.length });
    res.json(formattedTasks);
  } catch (err) {
    Logger.error('Error fetching tasks', err, { requestId: req.requestId, query: req.query });
    res.status(500).json(ErrorResponse.serverError('Failed to fetch tasks', req.requestId));
  }
});

app.post('/tasks', authenticateToken, async (req, res) => {
  try {
    const { task, priority = 'medium', due_date, category } = req.body;
    
    // Comprehensive validation with detailed error messages
    const validationErrors = [];
    
    if (!task) {
      validationErrors.push('Task text is required');
    } else if (typeof task !== 'string') {
      validationErrors.push('Task text must be a string');
    } else if (!task.trim()) {
      validationErrors.push('Task text cannot be empty');
    } else if (task.trim().length > 200) {
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
    
    Logger.info('Creating new task', { requestId: req.requestId, task: task.trim(), priority, due_date, category });
    await addTask(task.trim(), priority, due_date, category?.trim() || null);
    
    Logger.info('Task created successfully', { requestId: req.requestId, task: task.trim() });
    res.status(201).json({ message: 'Task created successfully', task: task.trim() });
  } catch (err) {
    Logger.error('Error creating task', err, { requestId: req.requestId, body: req.body });
    res.status(500).json(ErrorResponse.serverError('Failed to create task', req.requestId));
  }
});

app.delete('/tasks/:index', authenticateToken, async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    
    if (isNaN(idx)) {
      Logger.warn('Invalid index parameter - not a number', { requestId: req.requestId, index: req.params.index });
      return res.status(400).json(ErrorResponse.badRequest('Index must be a valid number'));
    }
    
    if (idx < 0) {
      Logger.warn('Invalid index parameter - negative number', { requestId: req.requestId, index: idx });
      return res.status(400).json(ErrorResponse.badRequest('Index cannot be negative'));
    }
    
    Logger.info('Fetching tasks for deletion', { requestId: req.requestId, index: idx });
    const tasks = await getAllTasks();
    
    if (idx >= tasks.length) {
      Logger.warn('Index out of range', { requestId: req.requestId, index: idx, totalTasks: tasks.length });
      return res.status(400).json(ErrorResponse.badRequest(`Index ${idx} is out of range. Total tasks: ${tasks.length}`));
    }
    
    const taskId = tasks[idx].id;
    const taskText = tasks[idx].text;
    
    Logger.info('Deleting task', { requestId: req.requestId, taskId, taskText, index: idx });
    const deleted = await deleteTask(taskId);
    
    if (!deleted) {
      Logger.error('Task deletion failed - task not found in database', null, { requestId: req.requestId, taskId });
      return res.status(404).json(ErrorResponse.notFound('Task'));
    }
    
    Logger.info('Task deleted successfully', { requestId: req.requestId, taskId, taskText });
    res.json({ message: 'Task deleted successfully', deletedTask: taskText });
  } catch (err) {
    Logger.error('Error deleting task', err, { requestId: req.requestId, index: req.params.index });
    res.status(500).json(ErrorResponse.serverError('Failed to delete task', req.requestId));
  }
});

app.put('/tasks/:index', authenticateToken, async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    const { task, priority, due_date, category, completed } = req.body;
    
    // Index validation
    if (isNaN(idx) || idx < 0) {
      Logger.warn('Invalid index for task update', { requestId: req.requestId, index: req.params.index });
      return res.status(400).json(ErrorResponse.badRequest('Invalid index'));
    }
    
    const tasks = await getAllTasks();
    if (idx >= tasks.length) {
      Logger.warn('Index out of range for update', { requestId: req.requestId, index: idx, totalTasks: tasks.length });
      return res.status(400).json(ErrorResponse.badRequest(`Index ${idx} is out of range. Total tasks: ${tasks.length}`));
    }
    
    // Comprehensive validation
    const validationErrors = [];
    const originalTask = tasks[idx];
    
    if (!task) {
      validationErrors.push('Task text is required');
    } else if (typeof task !== 'string') {
      validationErrors.push('Task text must be a string');
    } else if (!task.trim()) {
      validationErrors.push('Task text cannot be empty');
    } else if (task.trim().length > 200) {
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
    
    const taskId = originalTask.id;
    
    Logger.info('Updating task', { 
      requestId: req.requestId, 
      taskId, 
      originalText: originalTask.text,
      newText: task.trim(),
      changes: {
        text: task.trim() !== originalTask.text,
        priority: priority !== originalTask.priority,
        due_date: due_date !== originalTask.due_date,
        category: category !== originalTask.category,
        completed: completed !== originalTask.completed
      }
    });
    
    const updated = await updateTask(taskId, task.trim(), priority, due_date, category?.trim() || null, completed);
    
    if (!updated) {
      Logger.error('Task update failed - task not found in database', null, { requestId: req.requestId, taskId });
      return res.status(404).json(ErrorResponse.notFound('Task'));
    }
    
    Logger.info('Task updated successfully', { requestId: req.requestId, taskId, newText: task.trim() });
    res.json({ message: 'Task updated successfully', task: task.trim() });
  } catch (err) {
    Logger.error('Error updating task', err, { requestId: req.requestId, index: req.params.index, body: req.body });
    res.status(500).json(ErrorResponse.serverError('Failed to update task', req.requestId));
  }
});

app.patch('/tasks/:index/toggle', authenticateToken, async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    
    if (isNaN(idx) || idx < 0) {
      Logger.warn('Invalid index for task toggle', { requestId: req.requestId, index: req.params.index });
      return res.status(400).json(ErrorResponse.badRequest('Invalid index'));
    }
    
    const tasks = await getAllTasks();
    if (idx >= tasks.length) {
      Logger.warn('Index out of range for toggle', { requestId: req.requestId, index: idx, totalTasks: tasks.length });
      return res.status(400).json(ErrorResponse.badRequest(`Index ${idx} is out of range`));
    }
    
    const task = tasks[idx];
    const taskId = task.id;
    
    Logger.info('Toggling task completion', { 
      requestId: req.requestId, 
      taskId, 
      taskText: task.text,
      currentStatus: task.completed 
    });
    
    const updated = await toggleTaskCompletion(taskId);
    if (!updated) {
      Logger.error('Task toggle failed - task not found in database', null, { requestId: req.requestId, taskId });
      return res.status(404).json(ErrorResponse.notFound('Task'));
    }
    
    Logger.info('Task completion toggled successfully', { 
      requestId: req.requestId, 
      taskId, 
      newStatus: !task.completed 
    });
    res.json({ message: 'Task completion toggled successfully', newStatus: !task.completed });
  } catch (err) {
    Logger.error('Error toggling task completion', err, { requestId: req.requestId, index: req.params.index });
    res.status(500).json(ErrorResponse.serverError('Failed to toggle task completion', req.requestId));
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
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', validationErrors));
    }
    
    const tasks = await getAllTasks();
    const validIndices = indices.filter(idx => 
      Number.isInteger(idx) && idx >= 0 && idx < tasks.length
    );
    
    if (validIndices.length === 0) {
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', ['No valid indices provided']));
    }
    
    // Sort indices in descending order to avoid index shifting issues
    const sortedIndices = validIndices.sort((a, b) => b - a);
    let deletedCount = 0;
    
    for (const idx of sortedIndices) {
      const taskId = tasks[idx].id;
      const deleted = await deleteTask(taskId);
      if (deleted) deletedCount++;
    }
    
    res.json({ message: `${deletedCount} tasks deleted` });
  } catch (err) {
    Logger.error('Error in bulk delete operation', err, { requestId: req.requestId });
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
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', validationErrors));
    }
    
    const tasks = await getAllTasks();
    const validIndices = indices.filter(idx => 
      Number.isInteger(idx) && idx >= 0 && idx < tasks.length
    );
    
    if (validIndices.length === 0) {
      return res.status(400).json(ErrorResponse.badRequest('Validation failed', ['No valid indices provided']));
    }
    
    let updatedCount = 0;
    
    for (const idx of validIndices) {
      const task = tasks[idx];
      const updated = await updateTask(task.id, task.text, task.priority, task.due_date, task.category, completed);
      if (updated) updatedCount++;
    }
    
    res.json({ message: `${updatedCount} tasks updated` });
  } catch (err) {
    Logger.error('Error in bulk complete operation', err, { requestId: req.requestId });
    res.status(500).json(ErrorResponse.serverError('Failed to bulk complete tasks', req.requestId));
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
    
    res.json({ message: 'tasks reordered successfully' });
  } catch (err) {
    console.error('Error in POST /tasks/reorder:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/categories', authenticateToken, async (req, res) => {
  try {
    Logger.info('Fetching categories', { requestId: req.requestId });
    const categories = await getAllCategories();
    
    Logger.info('Categories fetched successfully', { requestId: req.requestId, count: categories.length });
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

// 404 handler for undefined routes
app.use((req, res) => {
  Logger.warn('Route not found', { requestId: req.requestId, path: req.path, method: req.method });
  res.status(404).json(ErrorResponse.notFound('Endpoint'));
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  Logger.info('Received SIGTERM signal, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  Logger.info('Received SIGINT signal, shutting down gracefully');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Promise Rejection', reason, { promise });
});

process.on('uncaughtException', (error) => {
  Logger.error('Uncaught Exception', error);
  process.exit(1);
});

if (require.main === module) {
  initializeDatabase().then(() => {
    const server = app.listen(PORT, () => {
      Logger.info(`Server started successfully`, { port: PORT, url: `http://localhost:${PORT}` });
    });
    
    server.on('error', (error) => {
      Logger.error('Server error', error);
      process.exit(1);
    });
  }).catch(err => {
    Logger.error('Failed to initialize database', err);
    process.exit(1);
  });
}

module.exports = app;
