const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.NODE_ENV === 'test' 
  ? path.join(__dirname, 'test.db')
  : path.join(__dirname, 'tasks.db');
const db = new sqlite3.Database(dbPath);

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function getAllTasks() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM tasks ORDER BY created_at', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function addTask(text) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO tasks (text) VALUES (?)', [text], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, text, created_at: new Date().toISOString() });
      }
    });
  });
}

function deleteTask(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM tasks WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
}

function updateTask(id, text) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE tasks SET text = ? WHERE id = ?', [text, id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
}

module.exports = {
  initializeDatabase,
  getAllTasks,
  addTask,
  deleteTask,
  updateTask
};