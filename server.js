const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
const TASK_FILE = path.join(__dirname, 'tasks.txt');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadTasks() {
  try {
    const data = fs.readFileSync(TASK_FILE, 'utf8');
    return data.split(/\r?\n/).filter(t => t);
  } catch (err) {
    return [];
  }
}

function saveTasks(tasks) {
  fs.writeFileSync(TASK_FILE, tasks.join('\n'), 'utf8');
}

app.get('/tasks', (req, res) => {
  res.json(loadTasks());
});

app.post('/tasks', (req, res) => {
  const tasks = loadTasks();
  const { task } = req.body;
  if (typeof task !== 'string' || !task.trim()) {
    return res.status(400).json({ error: 'invalid task' });
  }
  tasks.push(task.trim());
  saveTasks(tasks);
  res.status(201).json({ message: 'task added' });
});

app.delete('/tasks/:index', (req, res) => {
  const tasks = loadTasks();
  const idx = parseInt(req.params.index, 10);
  if (isNaN(idx) || idx < 0 || idx >= tasks.length) {
    return res.status(400).json({ error: 'invalid index' });
  }
  tasks.splice(idx, 1);
  saveTasks(tasks);
  res.json({ message: 'task deleted' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
