const request = require('supertest');
const { initializeDatabase } = require('../database');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
// const { JSDOM } = require('jsdom');

const testDbPath = path.join(__dirname, '..', 'test.db');
const db = new sqlite3.Database(testDbPath);

process.env.NODE_ENV = 'test';
process.env.BEARER_TOKEN = 'test-token';

const app = require('../server');

afterAll(async () => {
  db.close();
  const fs = require('fs');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

beforeEach(async () => {
  await new Promise((resolve) => {
    db.run('DELETE FROM tasks', resolve);
  });
});

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.BEARER_TOKEN = 'test-token';
  await initializeDatabase();
});

const authHeaders = { 'Authorization': 'Bearer test-token' };

describe('Todo API', () => {
  test('GET /tasks returns empty array initially with auth', async () => {
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('GET /tasks returns 401 without auth', async () => {
    const res = await request(app).get('/tasks');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('POST /tasks adds a task with auth', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Test' });
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body).toEqual([{ id: expect.any(Number), text: 'Test', priority: 'medium', due_date: null, category: null, completed: false, sort_order: expect.any(Number) }]);
  });

  test('POST /tasks returns 401 without auth', async () => {
    const res = await request(app).post('/tasks').send({ task: 'Test' });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('POST /tasks rejects invalid task', async () => {
    const res = await request(app).post('/tasks').set(authHeaders).send({ task: '' });
    expect(res.statusCode).toBe(400);
  });

  test('DELETE /tasks/:index removes a task with auth', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Test' });
    const resDel = await request(app).delete('/tasks/0').set(authHeaders);
    expect(resDel.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body).toEqual([]);
  });

  test('DELETE /tasks/:index returns 401 without auth', async () => {
    const res = await request(app).delete('/tasks/0');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('DELETE /tasks/:index invalid index returns 400', async () => {
    const res = await request(app).delete('/tasks/5').set(authHeaders);
    expect(res.statusCode).toBe(400);
  });

  test('PUT /tasks/:index updates a task with auth', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Old' });
    const resUpdate = await request(app).put('/tasks/0').set(authHeaders).send({ task: 'New' });
    expect(resUpdate.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body).toEqual([{ id: expect.any(Number), text: 'New', priority: 'medium', due_date: null, category: null, completed: false, sort_order: expect.any(Number) }]);
  });

  test('PUT /tasks/:index returns 401 without auth', async () => {
    const res = await request(app).put('/tasks/0').send({ task: 'Test' });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('PUT /tasks/:index invalid index returns 400', async () => {
    const res = await request(app).put('/tasks/3').set(authHeaders).send({ task: 'Bad' });
    expect(res.statusCode).toBe(400);
  });

  test('PUT /tasks/:index rejects invalid task', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Test' });
    const res = await request(app).put('/tasks/0').set(authHeaders).send({ task: '' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid task');
  });

  test('PUT /tasks/:index handles non-existent index', async () => {
    const res = await request(app).put('/tasks/999').set(authHeaders).send({ task: 'Test' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid index');
  });

  test('Unauthorized with invalid token', async () => {
    const res = await request(app).get('/tasks').set('Authorization', 'Bearer invalid-token');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('POST /tasks accepts priority parameter', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'High Priority Task', priority: 'high' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Low Priority Task', priority: 'low' });
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({ id: expect.any(Number), text: 'High Priority Task', priority: 'high', due_date: null, category: null, completed: false, sort_order: expect.any(Number) });
    expect(res.body[1]).toEqual({ id: expect.any(Number), text: 'Low Priority Task', priority: 'low', due_date: null, category: null, completed: false, sort_order: expect.any(Number) });
  });

  test('POST /tasks defaults to medium priority', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Default Priority Task' });
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).toEqual({ id: expect.any(Number), text: 'Default Priority Task', priority: 'medium', due_date: null, category: null, completed: false, sort_order: expect.any(Number) });
  });

  test('POST /tasks rejects invalid priority', async () => {
    const res = await request(app).post('/tasks').set(authHeaders).send({ task: 'Test', priority: 'invalid' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid priority');
  });

  test('PUT /tasks/:index updates task priority', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Test Task', priority: 'low' });
    const resUpdate = await request(app).put('/tasks/0').set(authHeaders).send({ task: 'Test Task', priority: 'high' });
    expect(resUpdate.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body[0]).toEqual({ id: expect.any(Number), text: 'Test Task', priority: 'high', due_date: null, category: null, completed: false, sort_order: expect.any(Number) });
  });

  test('PUT /tasks/:index rejects invalid priority', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Test Task' });
    const res = await request(app).put('/tasks/0').set(authHeaders).send({ task: 'Test Task', priority: 'invalid' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid priority');
  });

  test('GET /tasks returns tasks sorted by priority', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Medium Task', priority: 'medium' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'High Task', priority: 'high' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Low Task', priority: 'low' });
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(3);
    expect(res.body[0]).toEqual(expect.objectContaining({
      id: expect.any(Number),
      text: 'High Task',
      priority: 'high',
      due_date: null,
      category: null,
      completed: false,
      sort_order: expect.any(Number)
    }));
    expect(res.body[1]).toEqual(expect.objectContaining({
      id: expect.any(Number),
      text: 'Medium Task',
      priority: 'medium',
      due_date: null,
      category: null,
      completed: false,
      sort_order: expect.any(Number)
    }));
    expect(res.body[2]).toEqual(expect.objectContaining({
      id: expect.any(Number),
      text: 'Low Task',
      priority: 'low',
      due_date: null,
      category: null,
      completed: false,
      sort_order: expect.any(Number)
    }));
  });

  test('POST /tasks accepts due_date parameter', async () => {
    const dueDate = '2024-12-31';
    await request(app).post('/tasks').set(authHeaders).send({ 
      task: 'Task with deadline', 
      priority: 'high',
      due_date: dueDate 
    });
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).toEqual({ 
      id: expect.any(Number),
      text: 'Task with deadline', 
      priority: 'high',
      due_date: dueDate,
      category: null,
      completed: false,
      sort_order: expect.any(Number)
    });
  });

  test('POST /tasks works without due_date', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ 
      task: 'Task without deadline', 
      priority: 'medium'
    });
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).toEqual({ 
      id: expect.any(Number),
      text: 'Task without deadline', 
      priority: 'medium',
      due_date: null,
      category: null,
      completed: false,
      sort_order: expect.any(Number)
    });
  });

  test('POST /tasks rejects invalid due_date format', async () => {
    const res = await request(app).post('/tasks').set(authHeaders).send({ 
      task: 'Test', 
      due_date: 'invalid-date' 
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid due_date format');
  });

  test('PUT /tasks/:index updates task due_date', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Test Task' });
    const dueDate = '2024-12-25';
    const resUpdate = await request(app).put('/tasks/0').set(authHeaders).send({ 
      task: 'Test Task', 
      due_date: dueDate 
    });
    expect(resUpdate.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body[0].due_date).toBe(dueDate);
  });

  test('PUT /tasks/:index removes due_date when set to null', async () => {
    const dueDate = '2024-12-25';
    await request(app).post('/tasks').set(authHeaders).send({ 
      task: 'Test Task', 
      due_date: dueDate 
    });
    const resUpdate = await request(app).put('/tasks/0').set(authHeaders).send({ 
      task: 'Test Task', 
      due_date: null 
    });
    expect(resUpdate.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body[0].due_date).toBe(null);
  });

  test('PUT /tasks/:index rejects invalid due_date format', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Test Task' });
    const res = await request(app).put('/tasks/0').set(authHeaders).send({ 
      task: 'Test Task', 
      due_date: 'bad-date' 
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid due_date format');
  });

  test('POST /tasks accepts category parameter', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ 
      task: 'Task with category', 
      priority: 'high',
      category: 'Work' 
    });
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).toEqual({ 
      id: expect.any(Number),
      text: 'Task with category', 
      priority: 'high',
      due_date: null,
      category: 'Work',
      completed: false,
      sort_order: expect.any(Number)
    });
  });

  test('POST /tasks works without category', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ 
      task: 'Task without category', 
      priority: 'medium'
    });
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).toEqual({ 
      id: expect.any(Number),
      text: 'Task without category', 
      priority: 'medium',
      due_date: null,
      category: null,
      completed: false,
      sort_order: expect.any(Number)
    });
  });

  test('POST /tasks rejects invalid category (too long)', async () => {
    const longCategory = 'a'.repeat(51);
    const res = await request(app).post('/tasks').set(authHeaders).send({ 
      task: 'Test', 
      category: longCategory 
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid category');
  });

  test('PUT /tasks/:index updates task category', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Test Task' });
    const resUpdate = await request(app).put('/tasks/0').set(authHeaders).send({ 
      task: 'Test Task', 
      category: 'Updated Category' 
    });
    expect(resUpdate.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body[0].category).toBe('Updated Category');
  });

  test('PUT /tasks/:index removes category when set to null', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ 
      task: 'Test Task', 
      category: 'Original Category' 
    });
    const resUpdate = await request(app).put('/tasks/0').set(authHeaders).send({ 
      task: 'Test Task', 
      category: null 
    });
    expect(resUpdate.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body[0].category).toBe(null);
  });

  test('PUT /tasks/:index rejects invalid category (too long)', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Test Task' });
    const longCategory = 'a'.repeat(51);
    const res = await request(app).put('/tasks/0').set(authHeaders).send({ 
      task: 'Test Task', 
      category: longCategory 
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid category');
  });

  test('GET /categories returns categories', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 1', category: 'Work' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 2', category: 'Personal' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 3', category: 'Work' });
    
    const res = await request(app).get('/categories').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(['Personal', 'Work']);
  });

  test('GET /categories returns 401 without auth', async () => {
    const res = await request(app).get('/categories');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('GET /tasks supports search query parameter', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Buy groceries', category: 'Shopping' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Finish homework', category: 'Study' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Buy coffee', category: 'Shopping' });
    
    const res = await request(app).get('/tasks?search=Buy').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].text).toBe('Buy groceries');
    expect(res.body[1].text).toBe('Buy coffee');
  });

  test('GET /tasks supports category filter parameter', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Buy groceries', category: 'Shopping' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Finish homework', category: 'Study' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Buy coffee', category: 'Shopping' });
    
    const res = await request(app).get('/tasks?category=Shopping').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].text).toBe('Buy groceries');
    expect(res.body[1].text).toBe('Buy coffee');
  });

  test('GET /tasks supports both search and category filters', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Buy groceries', category: 'Shopping' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Finish homework', category: 'Study' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Buy coffee', category: 'Shopping' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Study coffee brewing', category: 'Study' });
    
    const res = await request(app).get('/tasks?search=coffee&category=Shopping').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].text).toBe('Buy coffee');
  });

  test('GET /tasks search is case insensitive', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Buy Groceries' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'finish homework' });
    
    const res = await request(app).get('/tasks?search=buy').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].text).toBe('Buy Groceries');
  });

  test('GET /tasks returns empty array when no tasks match search', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Buy groceries' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Finish homework' });
    
    const res = await request(app).get('/tasks?search=nonexistent').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test('GET /tasks returns empty array when no tasks match category filter', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Buy groceries', category: 'Shopping' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Finish homework', category: 'Study' });
    
    const res = await request(app).get('/tasks?category=Work').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test('POST /tasks creates task with completed false by default', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Test task' });
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).toEqual({ 
      id: expect.any(Number),
      text: 'Test task', 
      priority: 'medium', 
      due_date: null, 
      category: null,
      completed: false,
      sort_order: expect.any(Number)
    });
  });

  test('PATCH /tasks/:index/toggle toggles task completion', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Test task' });
    
    // Toggle to completed
    const toggleRes = await request(app).patch('/tasks/0/toggle').set(authHeaders);
    expect(toggleRes.statusCode).toBe(200);
    expect(toggleRes.body.message).toBe('task completion toggled');
    
    let res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body[0].completed).toBe(true);
    
    // Toggle back to incomplete
    await request(app).patch('/tasks/0/toggle').set(authHeaders);
    res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body[0].completed).toBe(false);
  });

  test('PATCH /tasks/:index/toggle returns 401 without auth', async () => {
    const res = await request(app).patch('/tasks/0/toggle');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('PATCH /tasks/:index/toggle returns 400 for invalid index', async () => {
    const res = await request(app).patch('/tasks/999/toggle').set(authHeaders);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid index');
  });

  test('PUT /tasks/:index can update task completion status', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Test task' });
    
    const updateRes = await request(app).put('/tasks/0').set(authHeaders).send({ 
      task: 'Test task', 
      completed: true 
    });
    expect(updateRes.statusCode).toBe(200);
    
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body[0].completed).toBe(true);
  });

  test('PUT /tasks/:index rejects invalid completed value', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Test task' });
    
    const res = await request(app).put('/tasks/0').set(authHeaders).send({ 
      task: 'Test task', 
      completed: 'invalid' 
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid completed value');
  });

  test('GET /tasks returns completed tasks after incomplete tasks', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 1', priority: 'high' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 2', priority: 'high' });
    
    // Complete the first task
    await request(app).patch('/tasks/0/toggle').set(authHeaders);
    
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    
    // Incomplete task should come first
    expect(res.body[0].text).toBe('Task 2');
    expect(res.body[0].completed).toBe(false);
    
    // Completed task should come second
    expect(res.body[1].text).toBe('Task 1');
    expect(res.body[1].completed).toBe(true);
  });

  test('POST /tasks/bulk-delete deletes multiple tasks', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 1' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 2' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 3' });
    
    const deleteRes = await request(app).post('/tasks/bulk-delete').set(authHeaders).send({
      indices: [0, 2]
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body.message).toBe('2 tasks deleted');
    
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].text).toBe('Task 2');
  });

  test('POST /tasks/bulk-delete returns 401 without auth', async () => {
    const res = await request(app).post('/tasks/bulk-delete').send({
      indices: [0]
    });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('POST /tasks/bulk-delete rejects invalid indices array', async () => {
    const res = await request(app).post('/tasks/bulk-delete').set(authHeaders).send({
      indices: 'not-an-array'
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid indices array');
  });

  test('POST /tasks/bulk-delete rejects empty indices array', async () => {
    const res = await request(app).post('/tasks/bulk-delete').set(authHeaders).send({
      indices: []
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid indices array');
  });

  test('POST /tasks/bulk-delete handles invalid indices gracefully', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 1' });
    
    const res = await request(app).post('/tasks/bulk-delete').set(authHeaders).send({
      indices: [999, -1, 'invalid']
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('no valid indices provided');
  });

  test('POST /tasks/bulk-complete marks multiple tasks as completed', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 1' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 2' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 3' });
    
    const completeRes = await request(app).post('/tasks/bulk-complete').set(authHeaders).send({
      indices: [0, 2],
      completed: true
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.body.message).toBe('2 tasks updated');
    
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body).toHaveLength(3);
    
    // Task 2 (index 1) should remain incomplete and come first
    expect(res.body[0].text).toBe('Task 2');
    expect(res.body[0].completed).toBe(false);
    
    // Tasks 1 and 3 should be completed and come after
    expect(res.body[1].completed).toBe(true);
    expect(res.body[2].completed).toBe(true);
  });

  test('POST /tasks/bulk-complete marks multiple tasks as incomplete', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 1' });
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 2' });
    
    // First mark them as completed
    await request(app).patch('/tasks/0/toggle').set(authHeaders);
    await request(app).patch('/tasks/1/toggle').set(authHeaders);
    
    // Then mark them as incomplete using bulk operation
    const incompleteRes = await request(app).post('/tasks/bulk-complete').set(authHeaders).send({
      indices: [0, 1],
      completed: false
    });
    expect(incompleteRes.statusCode).toBe(200);
    expect(incompleteRes.body.message).toBe('2 tasks updated');
    
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].completed).toBe(false);
    expect(res.body[1].completed).toBe(false);
  });

  test('POST /tasks/bulk-complete returns 401 without auth', async () => {
    const res = await request(app).post('/tasks/bulk-complete').send({
      indices: [0],
      completed: true
    });
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  test('POST /tasks/bulk-complete rejects invalid completed value', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Task 1' });
    
    const res = await request(app).post('/tasks/bulk-complete').set(authHeaders).send({
      indices: [0],
      completed: 'invalid'
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid completed value');
  });

  test('POST /tasks/bulk-complete rejects invalid indices array', async () => {
    const res = await request(app).post('/tasks/bulk-complete').set(authHeaders).send({
      indices: 'not-an-array',
      completed: true
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid indices array');
  });

  // test('index.html escapes task text content', async () => {
  //   const malicious = '<img src=x onerror="alert(1)">';
  //   await request(app).post('/tasks').set(authHeaders).send({ task: malicious });
  //   const serverInstance = app.listen(0);
  //   const port = serverInstance.address().port;

  //   const fs = require('fs');
  //   const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').replace('your-secret-token', 'test-token');
  //   const dom = new JSDOM(html, {
  //     runScripts: 'dangerously',
  //     resources: 'usable',
  //     url: `http://localhost:${port}/`
  //   });

  //   dom.window.fetch = (input, init) => fetch(new URL(input, dom.window.location.href), init);

  //   await new Promise(resolve => dom.window.addEventListener('load', resolve));
  //   await new Promise(resolve => setTimeout(resolve, 50));
  //   const span = dom.window.document.querySelector('#taskList span');
  //   expect(span).not.toBeNull();
  //   expect(span.textContent).toBe(malicious);
  //   expect(span.querySelector('img')).toBeNull();
  //   serverInstance.close();
  // });
});
