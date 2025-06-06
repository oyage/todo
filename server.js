const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
const TASK_FILE = process.env.TASK_FILE || path.join(__dirname, 'tasks.txt');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function loadTasks() {
  try {
    const data = await fs.promises.readFile(TASK_FILE, 'utf8');
    return data.split(/\r?\n/).filter(t => t);
  } catch (err) {
    return [];
  }
}

async function saveTasks(tasks) {
  await fs.promises.writeFile(TASK_FILE, tasks.join('\n'), 'utf8');
}

app.get('/tasks', async (req, res) => {
  const tasks = await loadTasks();
  res.json(tasks);
});

app.post('/tasks', async (req, res) => {
  const tasks = await loadTasks();
  const { task } = req.body;
  if (typeof task !== 'string' || !task.trim()) {
    return res.status(400).json({ error: 'invalid task' });
  }
  tasks.push(task.trim());
  await saveTasks(tasks);
  res.status(201).json({ message: 'task added' });
});

app.delete('/tasks/:index', async (req, res) => {
  const tasks = await loadTasks();
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= tasks.length) {
    return res.status(400).json({ error: 'invalid index' });
  }
  tasks.splice(idx, 1);
  await saveTasks(tasks);
  res.json({ message: 'task deleted' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
