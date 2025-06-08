const express = require('express');
const path = require('path');
const { initializeDatabase, getAllTasks, addTask, deleteTask, updateTask, toggleTaskCompletion, getAllCategories } = require('./database');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BEARER_TOKEN = process.env.BEARER_TOKEN || 'your-secret-token';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token || token !== BEARER_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}


app.get('/tasks', authenticateToken, async (req, res) => {
  try {
    const { search, category } = req.query;
    const tasks = await getAllTasks(search, category);
    res.json(tasks.map(task => ({ 
      text: task.text, 
      priority: task.priority || 'medium',
      due_date: task.due_date,
      category: task.category,
      completed: Boolean(task.completed)
    })));
  } catch (err) {
    console.error('Error in GET /tasks:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/tasks', authenticateToken, async (req, res) => {
  try {
    const { task, priority = 'medium', due_date, category } = req.body;
    if (typeof task !== 'string' || !task.trim()) {
      return res.status(400).json({ error: 'invalid task' });
    }
    if (!['high', 'medium', 'low'].includes(priority)) {
      return res.status(400).json({ error: 'invalid priority' });
    }
    if (due_date && isNaN(Date.parse(due_date))) {
      return res.status(400).json({ error: 'invalid due_date format' });
    }
    if (category && (typeof category !== 'string' || category.length > 50)) {
      return res.status(400).json({ error: 'invalid category' });
    }
    await addTask(task.trim(), priority, due_date, category?.trim() || null);
    res.status(201).json({ message: 'task added' });
  } catch (err) {
    console.error('Error in POST /tasks:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/tasks/:index', authenticateToken, async (req, res) => {
  try {
    const tasks = await getAllTasks();
    const idx = parseInt(req.params.index, 10);
    if (isNaN(idx) || idx < 0 || idx >= tasks.length) {
      return res.status(400).json({ error: 'invalid index' });
    }
    const taskId = tasks[idx].id;
    const deleted = await deleteTask(taskId);
    if (!deleted) {
      return res.status(404).json({ error: 'task not found' });
    }
    res.json({ message: 'task deleted' });
  } catch (err) {
    console.error('Error in DELETE /tasks/:index:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/tasks/:index', authenticateToken, async (req, res) => {
  try {
    const tasks = await getAllTasks();
    const idx = parseInt(req.params.index, 10);
    const { task, priority, due_date, category, completed } = req.body;
    if (isNaN(idx) || idx < 0 || idx >= tasks.length) {
      return res.status(400).json({ error: 'invalid index' });
    }
    if (typeof task !== 'string' || !task.trim()) {
      return res.status(400).json({ error: 'invalid task' });
    }
    if (priority !== undefined && !['high', 'medium', 'low'].includes(priority)) {
      return res.status(400).json({ error: 'invalid priority' });
    }
    if (due_date !== undefined && due_date !== null && isNaN(Date.parse(due_date))) {
      return res.status(400).json({ error: 'invalid due_date format' });
    }
    if (category !== undefined && category !== null && (typeof category !== 'string' || category.length > 50)) {
      return res.status(400).json({ error: 'invalid category' });
    }
    if (completed !== undefined && typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'invalid completed value' });
    }
    const taskId = tasks[idx].id;
    const updated = await updateTask(taskId, task.trim(), priority, due_date, category?.trim() || null, completed);
    if (!updated) {
      return res.status(404).json({ error: 'task not found' });
    }
    res.json({ message: 'task updated' });
  } catch (err) {
    console.error('Error in PUT /tasks/:index:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/tasks/:index/toggle', authenticateToken, async (req, res) => {
  try {
    const tasks = await getAllTasks();
    const idx = parseInt(req.params.index, 10);
    if (isNaN(idx) || idx < 0 || idx >= tasks.length) {
      return res.status(400).json({ error: 'invalid index' });
    }
    const taskId = tasks[idx].id;
    const updated = await toggleTaskCompletion(taskId);
    if (!updated) {
      return res.status(404).json({ error: 'task not found' });
    }
    res.json({ message: 'task completion toggled' });
  } catch (err) {
    console.error('Error in PATCH /tasks/:index/toggle:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/categories', authenticateToken, async (req, res) => {
  try {
    const categories = await getAllCategories();
    res.json(categories);
  } catch (err) {
    console.error('Error in GET /categories:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

if (require.main === module) {
  initializeDatabase().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
}

module.exports = app;
