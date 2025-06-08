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
        // パフォーマンス最適化のためのインデックス作成
        db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed)`, () => {
          db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)`, () => {
            db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category)`, () => {
              db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at)`, () => {
                db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(sort_order)`, () => {
                  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_text ON tasks(text)`, () => {
                    // Add columns if they don't exist (ignore errors)
                    db.run(`ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low'))`, () => {
                      db.run(`ALTER TABLE tasks ADD COLUMN due_date TEXT`, () => {
                        db.run(`ALTER TABLE tasks ADD COLUMN category TEXT`, () => {
                          db.run(`ALTER TABLE tasks ADD COLUMN completed BOOLEAN DEFAULT 0`, () => {
                            db.run(`ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0`, () => {
                              resolve();
                            });
                          });
                        });
                      });
                    });
                  });
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
      // フルテキスト検索の最適化（インデックスを使用）
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

    // ソート最適化 - インデックスを使用
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

    // LIMITを使用して大量データを防ぐ（オプション）
    query += ` LIMIT 1000`;

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
          resolve(this.lastID);
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
    // カテゴリ取得の最適化 - インデックスを使用して高速化
    db.all(`SELECT DISTINCT category FROM tasks 
            WHERE category IS NOT NULL AND category != '' 
            ORDER BY category 
            LIMIT 100`, (err, rows) => {
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