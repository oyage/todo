const request = require('supertest');
const { initializeDatabase } = require('../database');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { JSDOM } = require('jsdom');

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
    expect(res.body).toEqual(['Test']);
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
    expect(res.body).toEqual(['New']);
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

  test('index.html escapes task text content', async () => {
    const malicious = '<img src=x onerror="alert(1)">';
    await request(app).post('/tasks').set(authHeaders).send({ task: malicious });
    const serverInstance = app.listen(0);
    const port = serverInstance.address().port;

    const fs = require('fs');
    const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').replace('your-secret-token', 'test-token');
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      resources: 'usable',
      url: `http://localhost:${port}/`
    });

    dom.window.fetch = (input, init) => fetch(new URL(input, dom.window.location.href), init);

    await new Promise(resolve => dom.window.addEventListener('load', resolve));
    await new Promise(resolve => setTimeout(resolve, 50));
    const span = dom.window.document.querySelector('#taskList span');
    expect(span).not.toBeNull();
    expect(span.textContent).toBe(malicious);
    expect(span.querySelector('img')).toBeNull();
    serverInstance.close();
  });
});
