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
      completed BOOLEAN DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
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
              // Add completed column to existing tables if it doesn't exist
              db.run(`ALTER TABLE tasks ADD COLUMN completed BOOLEAN DEFAULT 0`, (completedErr) => {
                // Add sort_order column to existing tables if it doesn't exist
                db.run(`ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0`, (sortOrderErr) => {
                  // Ignore errors if columns already exist
                  resolve();
                });
              });
            });
          });
        });
      }
    });
  });
}

function getAllTasks(searchQuery = null, categoryFilter = null, sortBy = 'priority') {
  return new Promise((resolve, reject) => {
    let query = `SELECT * FROM tasks`;
    const params = [];
    const conditions = [];

    if (searchQuery) {
      conditions.push(`text LIKE ?`);
      params.push(`%${searchQuery}%`);
    }

    if (categoryFilter) {
      conditions.push(`category = ?`);
      params.push(categoryFilter);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Sort by drag-and-drop order first, then by other criteria
    if (sortBy === 'manual') {
      query += ` ORDER BY completed ASC, sort_order ASC`;
    } else {
      query += ` ORDER BY 
                completed ASC,
                CASE priority 
                  WHEN 'high' THEN 1 
                  WHEN 'medium' THEN 2 
                  WHEN 'low' THEN 3 
                  ELSE 2 
                END, 
                created_at`;
    }

    db.all(query, params, (err, rows) => {
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
    // Get the next sort order (highest current sort_order + 1)
    db.get('SELECT MAX(sort_order) as max_sort FROM tasks', (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      const nextSortOrder = (row.max_sort || 0) + 1;
      
      db.run('INSERT INTO tasks (text, priority, due_date, category, completed, sort_order) VALUES (?, ?, ?, ?, 0, ?)', 
        [text, priority, dueDate, category, nextSortOrder], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ 
            id: this.lastID, 
            text, 
            priority, 
            due_date: dueDate, 
            category, 
            completed: false, 
            sort_order: nextSortOrder,
            created_at: new Date().toISOString() 
          });
        }
      });
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

function updateTask(id, text, priority, dueDate, category, completed) {
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
    
    if (completed !== undefined) {
      query += ', completed = ?';
      params.push(completed ? 1 : 0);
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

function toggleTaskCompletion(id) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE tasks SET completed = 1 - completed WHERE id = ?', [id], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this.changes > 0);
      }
    });
  });
}

function reorderTasks(taskOrders) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(taskOrders) || taskOrders.length === 0) {
      resolve(true);
      return;
    }

    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          reject(err);
          return;
        }

        const stmt = db.prepare('UPDATE tasks SET sort_order = ? WHERE id = ?');
        let error = null;
        let completed = 0;
        const total = taskOrders.length;
        
        taskOrders.forEach(({ id, sort_order }) => {
          stmt.run([sort_order, id], function(err) {
            if (err && !error) {
              error = err;
            }
            completed++;
            
            if (completed === total) {
              stmt.finalize((finalizeErr) => {
                if (finalizeErr && !error) {
                  error = finalizeErr;
                }
                
                if (error) {
                  db.run('ROLLBACK', () => {
                    reject(error);
                  });
                } else {
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      reject(commitErr);
                    } else {
                      resolve(true);
                    }
                  });
                }
              });
            }
          });
        });
      });
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
  toggleTaskCompletion,
  reorderTasks,
  getAllCategories
};