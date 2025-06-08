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
      priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        reject(err);
      } else {
        // Add priority column to existing tables if it doesn't exist
        db.run(`ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low'))`, (alterErr) => {
          // Ignore error if column already exists
          resolve();
        });
      }
    });
  });
}

function getAllTasks() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM tasks 
            ORDER BY 
              CASE priority 
                WHEN 'high' THEN 1 
                WHEN 'medium' THEN 2 
                WHEN 'low' THEN 3 
                ELSE 2 
              END, 
              created_at`, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

function addTask(text, priority = 'medium') {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO tasks (text, priority) VALUES (?, ?)', [text, priority], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, text, priority, created_at: new Date().toISOString() });
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

function updateTask(id, text, priority) {
  return new Promise((resolve, reject) => {
    const params = [text];
    let query = 'UPDATE tasks SET text = ?';
    
    if (priority !== undefined) {
      query += ', priority = ?';
      params.push(priority);
    }
    
    query += ' WHERE id = ?';
    params.push(id);
    
    db.run(query, params, function(err) {
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