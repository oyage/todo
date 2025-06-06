const request = require('supertest');
const { initializeDatabase } = require('../database');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const testDbPath = path.join(__dirname, '..', 'test.db');
const db = new sqlite3.Database(testDbPath);

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
  await initializeDatabase();
});

describe('Todo API', () => {
  test('GET /tasks returns empty array initially', async () => {
    const res = await request(app).get('/tasks');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('POST /tasks adds a task', async () => {
    await request(app).post('/tasks').send({ task: 'Test' });
    const res = await request(app).get('/tasks');
    expect(res.body).toEqual(['Test']);
  });

  test('POST /tasks rejects invalid task', async () => {
    const res = await request(app).post('/tasks').send({ task: '' });
    expect(res.statusCode).toBe(400);
  });

  test('DELETE /tasks/:index removes a task', async () => {
    await request(app).post('/tasks').send({ task: 'Test' });
    const resDel = await request(app).delete('/tasks/0');
    expect(resDel.statusCode).toBe(200);
    const res = await request(app).get('/tasks');
    expect(res.body).toEqual([]);
  });

  test('DELETE /tasks/:index invalid index returns 400', async () => {
    const res = await request(app).delete('/tasks/5');
    expect(res.statusCode).toBe(400);
  });

  test('PUT /tasks/:index updates a task', async () => {
    await request(app).post('/tasks').send({ task: 'Old' });
    const resUpdate = await request(app).put('/tasks/0').send({ task: 'New' });
    expect(resUpdate.statusCode).toBe(200);
    const res = await request(app).get('/tasks');
    expect(res.body).toEqual(['New']);
  });

  test('PUT /tasks/:index invalid index returns 400', async () => {
    const res = await request(app).put('/tasks/3').send({ task: 'Bad' });
    expect(res.statusCode).toBe(400);
  });

  test('PUT /tasks/:index rejects invalid task', async () => {
    await request(app).post('/tasks').send({ task: 'Test' });
    const res = await request(app).put('/tasks/0').send({ task: '' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid task');
  });

  test('PUT /tasks/:index handles non-existent index', async () => {
    const res = await request(app).put('/tasks/999').send({ task: 'Test' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('invalid index');
  });
});
