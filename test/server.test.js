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
    expect(res.body).toEqual([{ text: 'Test', priority: 'medium' }]);
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
    expect(res.body).toEqual([{ text: 'New', priority: 'medium' }]);
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
    expect(res.body[0]).toEqual({ text: 'High Priority Task', priority: 'high' });
    expect(res.body[1]).toEqual({ text: 'Low Priority Task', priority: 'low' });
  });

  test('POST /tasks defaults to medium priority', async () => {
    await request(app).post('/tasks').set(authHeaders).send({ task: 'Default Priority Task' });
    const res = await request(app).get('/tasks').set(authHeaders);
    expect(res.statusCode).toBe(200);
    expect(res.body[0]).toEqual({ text: 'Default Priority Task', priority: 'medium' });
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
    expect(res.body[0]).toEqual({ text: 'Test Task', priority: 'high' });
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
    expect(res.body[0].text).toBe('High Task');
    expect(res.body[0].priority).toBe('high');
    expect(res.body[1].text).toBe('Medium Task');
    expect(res.body[1].priority).toBe('medium');
    expect(res.body[2].text).toBe('Low Task');
    expect(res.body[2].priority).toBe('low');
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
