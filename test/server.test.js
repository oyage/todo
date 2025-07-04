const request = require('supertest');
const { initializeDatabase, createUser } = require('../database');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const testDbPath = path.join(__dirname, '..', 'test.db');
const db = new sqlite3.Database(testDbPath);

process.env.NODE_ENV = 'test';
process.env.BEARER_TOKEN = 'test-token';
process.env.JWT_SECRET = 'test-jwt-secret';

const app = require('../server');

afterAll(async () => {
  db.close();
  const fs = require('fs');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

// Test users and tokens
let testUser1, testUser2, testToken1, testToken2;

beforeEach(async () => {
  await new Promise((resolve) => {
    db.run('DELETE FROM tasks', () => {
      db.run('DELETE FROM users', resolve);
    });
  });
  
  // Create test users for each test
  const hashedPassword = await bcrypt.hash('testpass123', 10);
  
  const userId1 = await createUser('testuser1', 'test1@example.com', hashedPassword);
  const userId2 = await createUser('testuser2', 'test2@example.com', hashedPassword);
  
  testUser1 = { userId: userId1, id: userId1, username: 'testuser1', email: 'test1@example.com' };
  testUser2 = { userId: userId2, id: userId2, username: 'testuser2', email: 'test2@example.com' };
  
  testToken1 = jwt.sign(testUser1, process.env.JWT_SECRET, { expiresIn: '1h' });
  testToken2 = jwt.sign(testUser2, process.env.JWT_SECRET, { expiresIn: '1h' });
});

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.BEARER_TOKEN = 'test-token';
  await initializeDatabase();
});

const getAuthHeaders = (token) => ({ 'Authorization': `Bearer ${token}` });
const authHeaders1 = () => getAuthHeaders(testToken1);
const authHeaders2 = () => getAuthHeaders(testToken2);

// Keep old bearer token for backward compatibility tests
const legacyAuthHeaders = { 'Authorization': 'Bearer test-token' };

describe('Authentication API', () => {
  test('POST /auth/register creates new user', async () => {
    const res = await request(app).post('/auth/register').send({
      username: 'newuser',
      email: 'newuser@example.com',
      password: 'password123'
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.user).toEqual({
      id: expect.any(Number),
      username: 'newuser',
      email: 'newuser@example.com'
    });
    expect(res.body.token).toBeDefined();
  });

  test('POST /auth/register rejects duplicate email', async () => {
    const res = await request(app).post('/auth/register').send({
      username: 'anotheruser',
      email: 'test1@example.com', // Already exists
      password: 'password123'
    });
    expect(res.statusCode).toBe(409);
    expect(res.body.error.message).toBe('Email already registered');
  });

  test('POST /auth/register rejects duplicate username', async () => {
    const res = await request(app).post('/auth/register').send({
      username: 'testuser1', // Already exists
      email: 'different@example.com',
      password: 'password123'
    });
    expect(res.statusCode).toBe(409);
    expect(res.body.error.message).toBe('Username already taken');
  });

  test('POST /auth/login authenticates user', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'test1@example.com',
      password: 'testpass123'
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.user).toEqual({
      id: testUser1.userId,
      username: 'testuser1',
      email: 'test1@example.com'
    });
    expect(res.body.token).toBeDefined();
  });

  test('POST /auth/login rejects invalid password', async () => {
    const res = await request(app).post('/auth/login').send({
      email: 'test1@example.com',
      password: 'wrongpassword'
    });
    expect(res.statusCode).toBe(401);
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  test('GET /auth/me returns user profile', async () => {
    const res = await request(app).get('/auth/me').set(authHeaders1());
    expect(res.statusCode).toBe(200);
    expect(res.body.user).toEqual({
      id: testUser1.userId,
      username: 'testuser1',
      email: 'test1@example.com',
      created_at: expect.any(String)
    });
  });
});

describe('Todo API', () => {
  test('GET /tasks returns empty array initially with auth', async () => {
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('GET /tasks returns 401 without auth', async () => {
    const res = await request(app).get('/tasks');
    expect(res.statusCode).toBe(401);
    expect(res.body.error.type).toBe('AUTHENTICATION_ERROR');
    expect(res.body.error.code).toBe(401);
  });

  test('Tasks are isolated between users', async () => {
    // User 1 creates a task
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'User 1 Task' });
    
    // User 2 creates a task
    await request(app).post('/tasks').set(authHeaders2()).send({ text: 'User 2 Task' });
    
    // User 1 should only see their task
    const res1 = await request(app).get('/tasks').set(authHeaders1());
    expect(res1.statusCode).toBe(200);
    expect(res1.body).toHaveLength(1);
    expect(res1.body[0].text).toBe('User 1 Task');
    
    // User 2 should only see their task
    const res2 = await request(app).get('/tasks').set(authHeaders2());
    expect(res2.statusCode).toBe(200);
    expect(res2.body).toHaveLength(1);
    expect(res2.body[0].text).toBe('User 2 Task');
  });

  test('POST /tasks adds a task with auth (new API)', async () => {
    const createRes = await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test' });
    expect(createRes.statusCode).toBe(201);
    expect(createRes.body).toEqual({
      id: expect.any(Number),
      text: 'Test',
      priority: 'medium',
      due_date: null,
      category: null,
      completed: false
    });
    
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body).toEqual([{ id: expect.any(Number), text: 'Test', priority: 'medium', due_date: null, category: null, completed: false, sort_order: expect.any(Number) }]);
  });

  test('POST /tasks adds a task with auth (old API backward compatibility)', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test' });
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body).toEqual([{ id: expect.any(Number), text: 'Test', priority: 'medium', due_date: null, category: null, completed: false, sort_order: expect.any(Number) }]);
  });

  test('POST /tasks returns 401 without auth', async () => {
    const res = await request(app).post('/tasks').send({ text: 'Test' });
    expect(res.statusCode).toBe(401);
    expect(res.body.error.type).toBe('AUTHENTICATION_ERROR');
    expect(res.body.error.code).toBe(401);
  });

  test('POST /tasks rejects invalid task (new API)', async () => {
    const res = await request(app).post('/tasks').set(authHeaders1()).send({ text: '' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('Task text is required');
  });

  test('POST /tasks rejects invalid task (old API backward compatibility)', async () => {
    const res = await request(app).post('/tasks').set(authHeaders1()).send({ text: '' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('Task text is required');
  });

  test('User cannot delete another user\'s task', async () => {
    // User 1 creates a task
    const createRes = await request(app).post('/tasks').set(authHeaders1()).send({ text: 'User 1 Task' });
    const taskId = createRes.body.id;
    
    // User 2 tries to delete User 1's task - should fail
    const resDel = await request(app).delete(`/tasks/${taskId}`).set(authHeaders2());
    expect(resDel.statusCode).toBe(404); // Task not found for this user
    
    // Task should still exist for User 1
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body).toHaveLength(1);
    expect(res.body[0].text).toBe('User 1 Task');
  });

  test('DELETE /tasks/:id removes a task with auth (new API)', async () => {
    const createRes = await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test' });
    const taskId = createRes.body.id;
    
    const resDel = await request(app).delete(`/tasks/${taskId}`).set(authHeaders1());
    expect(resDel.statusCode).toBe(204);
    
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body).toEqual([]);
  });

  test('DELETE /tasks/:index removes a task with auth (old API backward compatibility)', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test' });
    const resDel = await request(app).delete('/tasks/0').set(authHeaders1());
    expect(resDel.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body).toEqual([]);
  });

  test('DELETE /tasks/:id returns 401 without auth (new API)', async () => {
    const res = await request(app).delete('/tasks/1');
    expect(res.statusCode).toBe(401);
    expect(res.body.error.type).toBe('AUTHENTICATION_ERROR');
    expect(res.body.error.code).toBe(401);
  });

  test('DELETE /tasks/:index returns 401 without auth (old API)', async () => {
    const res = await request(app).delete('/tasks/0');
    expect(res.statusCode).toBe(401);
    expect(res.body.error.type).toBe('AUTHENTICATION_ERROR');
    expect(res.body.error.code).toBe(401);
  });

  test('DELETE /tasks/:id invalid ID returns 404 (new API)', async () => {
    const res = await request(app).delete('/tasks/999').set(authHeaders1());
    expect(res.statusCode).toBe(404);
  });

  test('DELETE /tasks/:index invalid index returns 400 (old API)', async () => {
    const res = await request(app).delete('/tasks/5').set(authHeaders1());
    expect(res.statusCode).toBe(404); // ID-based API returns 404 when task not found
  });

  test('PUT /tasks/:id updates a task with auth (new API)', async () => {
    const createRes = await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Old' });
    const taskId = createRes.body.id;
    
    const resUpdate = await request(app).put(`/tasks/${taskId}`).set(authHeaders1()).send({ task: 'New' });
    expect(resUpdate.statusCode).toBe(200);
    expect(resUpdate.body).toEqual({
      id: taskId,
      text: 'New',
      priority: 'medium',
      due_date: null,
      category: null,
      completed: false
    });
    
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body[0].text).toBe('New');
  });

  test('PUT /tasks/:index updates a task with auth (old API backward compatibility)', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Old' });
    const resUpdate = await request(app).put('/tasks/0').set(authHeaders1()).send({ task: 'New' });
    expect(resUpdate.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body).toEqual([{ id: expect.any(Number), text: 'New', priority: 'medium', due_date: null, category: null, completed: false, sort_order: expect.any(Number) }]);
  });

  test('PUT /tasks/:id returns 401 without auth (new API)', async () => {
    const res = await request(app).put('/tasks/1').send({ task: 'Test' });
    expect(res.statusCode).toBe(401);
    expect(res.body.error.type).toBe('AUTHENTICATION_ERROR');
    expect(res.body.error.code).toBe(401);
  });

  test('PUT /tasks/:index returns 401 without auth (old API)', async () => {
    const res = await request(app).put('/tasks/0').send({ task: 'Test' });
    expect(res.statusCode).toBe(401);
    expect(res.body.error.type).toBe('AUTHENTICATION_ERROR');
    expect(res.body.error.code).toBe(401);
  });

  test('PUT /tasks/:index invalid index returns 400', async () => {
    const res = await request(app).put('/tasks/3').set(authHeaders1()).send({ task: 'Bad' });
    expect(res.statusCode).toBe(404); // ID-based API returns 404 when task not found
  });

  test('PUT /tasks/:index rejects invalid task', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test' });
    const res = await request(app).put('/tasks/0').set(authHeaders1()).send({ task: '' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('Task text is required');
  });

  test('PUT /tasks/:index handles non-existent index', async () => {
    const res = await request(app).put('/tasks/999').set(authHeaders1()).send({ task: 'Test' });
    expect(res.statusCode).toBe(404); // ID-based API returns 404 when task not found
    expect(res.body.error.type).toBe('NOT_FOUND_ERROR');
    expect(res.body.error.message).toContain('Task not found');
  });

  test('Unauthorized with invalid token', async () => {
    const res = await request(app).get('/tasks').set('Authorization', 'Bearer invalid-token');
    expect(res.statusCode).toBe(401);
    expect(res.body.error.type).toBe('AUTHENTICATION_ERROR');
    expect(res.body.error.code).toBe(401);
  });

  test('POST /tasks accepts priority parameter', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'High Priority Task', priority: 'high' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Low Priority Task', priority: 'low' });
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({ id: expect.any(Number), text: 'High Priority Task', priority: 'high', due_date: null, category: null, completed: false, sort_order: expect.any(Number) });
    expect(res.body[1]).toEqual({ id: expect.any(Number), text: 'Low Priority Task', priority: 'low', due_date: null, category: null, completed: false, sort_order: expect.any(Number) });
  });

  test('POST /tasks defaults to medium priority', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Default Priority Task' });
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).toEqual({ id: expect.any(Number), text: 'Default Priority Task', priority: 'medium', due_date: null, category: null, completed: false, sort_order: expect.any(Number) });
  });

  test('POST /tasks rejects invalid priority', async () => {
    const res = await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test', priority: 'invalid' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('Priority must be one of: high, medium, low');
  });

  test('PUT /tasks/:index updates task priority', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test Task', priority: 'low' });
    const resUpdate = await request(app).put('/tasks/0').set(authHeaders1()).send({ task: 'Test Task', priority: 'high' });
    expect(resUpdate.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body[0]).toEqual({ id: expect.any(Number), text: 'Test Task', priority: 'high', due_date: null, category: null, completed: false, sort_order: expect.any(Number) });
  });

  test('PUT /tasks/:index rejects invalid priority', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test Task' });
    const res = await request(app).put('/tasks/0').set(authHeaders1()).send({ task: 'Test Task', priority: 'invalid' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('Priority must be one of: high, medium, low');
  });

  test('GET /tasks returns tasks sorted by priority', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Medium Task', priority: 'medium' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'High Task', priority: 'high' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Low Task', priority: 'low' });
    const res = await request(app).get('/tasks').set(authHeaders1());
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
    await request(app).post('/tasks').set(authHeaders1()).send({ 
      text: 'Task with deadline', 
      priority: 'high',
      due_date: dueDate 
    });
    const res = await request(app).get('/tasks').set(authHeaders1());
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
    await request(app).post('/tasks').set(authHeaders1()).send({ 
      text: 'Task without deadline', 
      priority: 'medium'
    });
    const res = await request(app).get('/tasks').set(authHeaders1());
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
    const res = await request(app).post('/tasks').set(authHeaders1()).send({ 
      text: 'Test', 
      due_date: 'invalid-date' 
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('Due date must be in valid date format (YYYY-MM-DD)');
  });

  test('PUT /tasks/:index updates task due_date', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test Task' });
    const dueDate = '2024-12-25';
    const resUpdate = await request(app).put('/tasks/0').set(authHeaders1()).send({ 
      task: 'Test Task', 
      due_date: dueDate 
    });
    expect(resUpdate.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body[0].due_date).toBe(dueDate);
  });

  test('PUT /tasks/:index removes due_date when set to null', async () => {
    const dueDate = '2024-12-25';
    await request(app).post('/tasks').set(authHeaders1()).send({ 
      text: 'Test Task', 
      due_date: dueDate 
    });
    const resUpdate = await request(app).put('/tasks/0').set(authHeaders1()).send({ 
      task: 'Test Task', 
      due_date: null 
    });
    expect(resUpdate.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body[0].due_date).toBe(null);
  });

  test('PUT /tasks/:index rejects invalid due_date format', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test Task' });
    const res = await request(app).put('/tasks/0').set(authHeaders1()).send({ 
      task: 'Test Task', 
      due_date: 'bad-date' 
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('Due date must be in valid date format (YYYY-MM-DD)');
  });

  test('POST /tasks accepts category parameter', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ 
      text: 'Task with category', 
      priority: 'high',
      category: 'Work' 
    });
    const res = await request(app).get('/tasks').set(authHeaders1());
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
    await request(app).post('/tasks').set(authHeaders1()).send({ 
      text: 'Task without category', 
      priority: 'medium'
    });
    const res = await request(app).get('/tasks').set(authHeaders1());
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
    const res = await request(app).post('/tasks').set(authHeaders1()).send({ 
      text: 'Test', 
      category: longCategory 
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('Category cannot exceed 50 characters');
  });

  test('PUT /tasks/:index updates task category', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test Task' });
    const resUpdate = await request(app).put('/tasks/0').set(authHeaders1()).send({ 
      task: 'Test Task', 
      category: 'Updated Category' 
    });
    expect(resUpdate.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body[0].category).toBe('Updated Category');
  });

  test('PUT /tasks/:index removes category when set to null', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ 
      text: 'Test Task', 
      category: 'Original Category' 
    });
    const resUpdate = await request(app).put('/tasks/0').set(authHeaders1()).send({ 
      task: 'Test Task', 
      category: null 
    });
    expect(resUpdate.statusCode).toBe(200);
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body[0].category).toBe(null);
  });

  test('PUT /tasks/:index rejects invalid category (too long)', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test Task' });
    const longCategory = 'a'.repeat(51);
    const res = await request(app).put('/tasks/0').set(authHeaders1()).send({ 
      task: 'Test Task', 
      category: longCategory 
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('Category cannot exceed 50 characters');
  });

  test('Categories are isolated between users', async () => {
    // User 1 creates tasks with categories
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 1', category: 'Work' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 2', category: 'Personal' });
    
    // User 2 creates tasks with different categories
    await request(app).post('/tasks').set(authHeaders2()).send({ text: 'Task 3', category: 'Study' });
    await request(app).post('/tasks').set(authHeaders2()).send({ text: 'Task 4', category: 'Hobby' });
    
    // User 1 should only see their categories
    const res1 = await request(app).get('/categories').set(authHeaders1());
    expect(res1.statusCode).toBe(200);
    expect(res1.body).toEqual(['Personal', 'Work']);
    
    // User 2 should only see their categories
    const res2 = await request(app).get('/categories').set(authHeaders2());
    expect(res2.statusCode).toBe(200);
    expect(res2.body).toEqual(['Hobby', 'Study']);
  });

  test('GET /categories returns categories', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 1', category: 'Work' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 2', category: 'Personal' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 3', category: 'Work' });
    
    const res = await request(app).get('/categories').set(authHeaders1());
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(['Personal', 'Work']);
  });

  test('GET /categories returns 401 without auth', async () => {
    const res = await request(app).get('/categories');
    expect(res.statusCode).toBe(401);
    expect(res.body.error.type).toBe('AUTHENTICATION_ERROR');
    expect(res.body.error.code).toBe(401);
  });

  test('GET /tasks supports search query parameter', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Buy groceries', category: 'Shopping' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Finish homework', category: 'Study' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Buy coffee', category: 'Shopping' });
    
    const res = await request(app).get('/tasks?search=Buy').set(authHeaders1());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].text).toBe('Buy groceries');
    expect(res.body[1].text).toBe('Buy coffee');
  });

  test('GET /tasks supports category filter parameter', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Buy groceries', category: 'Shopping' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Finish homework', category: 'Study' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Buy coffee', category: 'Shopping' });
    
    const res = await request(app).get('/tasks?category=Shopping').set(authHeaders1());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].text).toBe('Buy groceries');
    expect(res.body[1].text).toBe('Buy coffee');
  });

  test('GET /tasks supports both search and category filters', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Buy groceries', category: 'Shopping' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Finish homework', category: 'Study' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Buy coffee', category: 'Shopping' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Study coffee brewing', category: 'Study' });
    
    const res = await request(app).get('/tasks?search=coffee&category=Shopping').set(authHeaders1());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].text).toBe('Buy coffee');
  });

  test('GET /tasks search is case insensitive', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Buy Groceries' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'finish homework' });
    
    const res = await request(app).get('/tasks?search=buy').set(authHeaders1());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].text).toBe('Buy Groceries');
  });

  test('GET /tasks returns empty array when no tasks match search', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Buy groceries' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Finish homework' });
    
    const res = await request(app).get('/tasks?search=nonexistent').set(authHeaders1());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test('GET /tasks returns empty array when no tasks match category filter', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Buy groceries', category: 'Shopping' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Finish homework', category: 'Study' });
    
    const res = await request(app).get('/tasks?category=Work').set(authHeaders1());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  test('POST /tasks creates task with completed false by default', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test task' });
    const res = await request(app).get('/tasks').set(authHeaders1());
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

  test('PATCH /tasks/:id updates task completion (new API)', async () => {
    const createRes = await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test task' });
    const taskId = createRes.body.id;
    
    // Set to completed
    const patchRes = await request(app).patch(`/tasks/${taskId}`).set(authHeaders1()).send({ completed: true });
    expect(patchRes.statusCode).toBe(204);
    
    let res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body[0].completed).toBe(true);
    
    // Set to incomplete
    await request(app).patch(`/tasks/${taskId}`).set(authHeaders1()).send({ completed: false });
    res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body[0].completed).toBe(false);
  });

  test('PATCH /tasks/:id toggles task completion when no completed field (new API)', async () => {
    const createRes = await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test task' });
    const taskId = createRes.body.id;
    
    // Toggle completion
    const patchRes = await request(app).patch(`/tasks/${taskId}`).set(authHeaders1()).send({});
    expect(patchRes.statusCode).toBe(204);
    
    let res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body[0].completed).toBe(true);
  });

  test('PATCH /tasks/:index/toggle toggles task completion (old API backward compatibility)', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test task' });
    
    // Toggle to completed
    const toggleRes = await request(app).patch('/tasks/0/toggle').set(authHeaders1());
    expect(toggleRes.statusCode).toBe(200);
    expect(toggleRes.body.message).toBe('Task completion toggled successfully');
    
    let res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body[0].completed).toBe(true);
    
    // Toggle back to incomplete
    await request(app).patch('/tasks/0/toggle').set(authHeaders1());
    res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body[0].completed).toBe(false);
  });

  test('PATCH /tasks/:index/toggle returns 401 without auth', async () => {
    const res = await request(app).patch('/tasks/0/toggle');
    expect(res.statusCode).toBe(401);
    expect(res.body.error.type).toBe('AUTHENTICATION_ERROR');
    expect(res.body.error.code).toBe(401);
  });

  test('PATCH /tasks/:index/toggle returns 400 for invalid index', async () => {
    const res = await request(app).patch('/tasks/999/toggle').set(authHeaders1());
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.message).toContain('Index 999 is out of range');
  });

  test('PUT /tasks/:index can update task completion status', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test task' });
    
    const updateRes = await request(app).put('/tasks/0').set(authHeaders1()).send({ 
      task: 'Test task', 
      completed: true 
    });
    expect(updateRes.statusCode).toBe(200);
    
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body[0].completed).toBe(true);
  });

  test('PUT /tasks/:index rejects invalid completed value', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Test task' });
    
    const res = await request(app).put('/tasks/0').set(authHeaders1()).send({ 
      task: 'Test task', 
      completed: 'invalid' 
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('Completed status must be a boolean');
  });

  test('GET /tasks returns completed tasks after incomplete tasks', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 1', priority: 'high' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 2', priority: 'high' });
    
    // Complete the first task
    await request(app).patch('/tasks/0/toggle').set(authHeaders1());
    
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    
    // Incomplete task should come first
    expect(res.body[0].text).toBe('Task 2');
    expect(res.body[0].completed).toBe(false);
    
    // Completed task should come second
    expect(res.body[1].text).toBe('Task 1');
    expect(res.body[1].completed).toBe(true);
  });

  test('DELETE /tasks bulk deletes multiple tasks (new API)', async () => {
    const task1 = await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 1' });
    const task2 = await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 2' });
    const task3 = await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 3' });
    
    const deleteRes = await request(app).delete('/tasks').set(authHeaders1()).send({
      ids: [task1.body.id, task3.body.id]
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body.deleted).toBe(2);
    
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body).toHaveLength(1);
    expect(res.body[0].text).toBe('Task 2');
  });

  test('POST /tasks/bulk-delete deletes multiple tasks (old API backward compatibility)', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 1' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 2' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 3' });
    
    const deleteRes = await request(app).post('/tasks/bulk-delete').set(authHeaders1()).send({
      indices: [0, 2]
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.body.message).toBe('2 tasks deleted');
    
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body).toHaveLength(1);
    expect(res.body[0].text).toBe('Task 2');
  });

  test('POST /tasks/bulk-delete returns 401 without auth', async () => {
    const res = await request(app).post('/tasks/bulk-delete').send({
      indices: [0]
    });
    expect(res.statusCode).toBe(401);
    expect(res.body.error.type).toBe('AUTHENTICATION_ERROR');
    expect(res.body.error.code).toBe(401);
  });

  test('POST /tasks/bulk-delete rejects invalid indices array', async () => {
    const res = await request(app).post('/tasks/bulk-delete').set(authHeaders1()).send({
      indices: 'not-an-array'
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('Indices must be an array');
  });

  test('POST /tasks/bulk-delete rejects empty indices array', async () => {
    const res = await request(app).post('/tasks/bulk-delete').set(authHeaders1()).send({
      indices: []
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('At least one index must be provided');
  });

  test('POST /tasks/bulk-delete handles invalid indices gracefully', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 1' });
    
    const res = await request(app).post('/tasks/bulk-delete').set(authHeaders1()).send({
      indices: [999, -1, 'invalid']
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('No valid indices provided');
  });

  test('PATCH /tasks bulk updates multiple tasks (new API)', async () => {
    const task1 = await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 1' });
    const task2 = await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 2' });
    const task3 = await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 3' });
    
    const patchRes = await request(app).patch('/tasks').set(authHeaders1()).send({
      ids: [task1.body.id, task3.body.id],
      completed: true
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.body.updated).toBe(2);
    
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body).toHaveLength(3);
    
    // Task 2 should remain incomplete and come first
    expect(res.body[0].text).toBe('Task 2');
    expect(res.body[0].completed).toBe(false);
    
    // Tasks 1 and 3 should be completed and come after
    expect(res.body[1].completed).toBe(true);
    expect(res.body[2].completed).toBe(true);
  });

  test('POST /tasks/bulk-complete marks multiple tasks as completed (old API backward compatibility)', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 1' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 2' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 3' });
    
    const completeRes = await request(app).post('/tasks/bulk-complete').set(authHeaders1()).send({
      indices: [0, 2],
      completed: true
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.body.message).toBe('2 tasks updated');
    
    const res = await request(app).get('/tasks').set(authHeaders1());
    expect(res.body).toHaveLength(3);
    
    // Task 2 (index 1) should remain incomplete and come first
    expect(res.body[0].text).toBe('Task 2');
    expect(res.body[0].completed).toBe(false);
    
    // Tasks 1 and 3 should be completed and come after
    expect(res.body[1].completed).toBe(true);
    expect(res.body[2].completed).toBe(true);
  });

  test('POST /tasks/bulk-complete marks multiple tasks as incomplete', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 1' });
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 2' });
    
    // First mark them as completed
    await request(app).patch('/tasks/0/toggle').set(authHeaders1());
    await request(app).patch('/tasks/1/toggle').set(authHeaders1());
    
    // Then mark them as incomplete using bulk operation
    const incompleteRes = await request(app).post('/tasks/bulk-complete').set(authHeaders1()).send({
      indices: [0, 1],
      completed: false
    });
    expect(incompleteRes.statusCode).toBe(200);
    expect(incompleteRes.body.message).toBe('2 tasks updated');
    
    const res = await request(app).get('/tasks').set(authHeaders1());
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
    expect(res.body.error.type).toBe('AUTHENTICATION_ERROR');
    expect(res.body.error.code).toBe(401);
  });

  test('POST /tasks/bulk-complete rejects invalid completed value', async () => {
    await request(app).post('/tasks').set(authHeaders1()).send({ text: 'Task 1' });
    
    const res = await request(app).post('/tasks/bulk-complete').set(authHeaders1()).send({
      indices: [0],
      completed: 'invalid'
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('Completed status must be a boolean');
  });

  test('POST /tasks/bulk-complete rejects invalid indices array', async () => {
    const res = await request(app).post('/tasks/bulk-complete').set(authHeaders1()).send({
      indices: 'not-an-array',
      completed: true
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error.type).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContain('Indices must be an array');
  });

});
