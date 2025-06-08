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
      due_date TEXT,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        reject(err);
      } else {
        // Add priority column to existing tables if it doesn't exist
        db.run(`ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low'))`, (alterErr) => {
          // Add due_date column to existing tables if it doesn't exist
          db.run(`ALTER TABLE tasks ADD COLUMN due_date TEXT`, (dueDateErr) => {
            // Add category column to existing tables if it doesn't exist
            db.run(`ALTER TABLE tasks ADD COLUMN category TEXT`, (categoryErr) => {
              // Ignore errors if columns already exist
              resolve();
            });
          });
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

function addTask(text, priority = 'medium', dueDate = null, category = null) {
  return new Promise((resolve, reject) => {
    db.run('INSERT INTO tasks (text, priority, due_date, category) VALUES (?, ?, ?, ?)', [text, priority, dueDate, category], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, text, priority, due_date: dueDate, category, created_at: new Date().toISOString() });
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

function updateTask(id, text, priority, dueDate, category) {
  return new Promise((resolve, reject) => {
    const params = [text];
    let query = 'UPDATE tasks SET text = ?';
    
    if (priority !== undefined) {
      query += ', priority = ?';
      params.push(priority);
    }
    
    if (dueDate !== undefined) {
      query += ', due_date = ?';
      params.push(dueDate);
    }
    
    if (category !== undefined) {
      query += ', category = ?';
      params.push(category);
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

function getAllCategories() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT DISTINCT category FROM tasks WHERE category IS NOT NULL AND category != '' ORDER BY category`, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows.map(row => row.category));
      }
    });
  });
}

module.exports = {
  initializeDatabase,
  getAllTasks,
  addTask,
  deleteTask,
  updateTask,
  getAllCategories
};