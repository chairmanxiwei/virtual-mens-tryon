const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';

const app = require('../server');

test.after(async () => {
  try {
    if (global.db && typeof global.db.end === 'function') {
      await global.db.end();
    }
  } catch (e) {}
  const t = setTimeout(() => process.exit(0), 200);
  if (typeof t.unref === 'function') t.unref();
});

function requestJson(port, path) {
  return new Promise((resolve, reject) => {
    const agent = new http.Agent({ keepAlive: false });
    const req = http.request(
      { method: 'GET', host: '127.0.0.1', port, path, agent },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, data: JSON.parse(buf || '{}') });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

test('health endpoint returns ok', async () => {
  const server = app.listen(0);
  server.unref();
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  const { port } = server.address();
  try {
    const res = await requestJson(port, '/health');
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'ok');
  } finally {
    for (const s of sockets) s.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('metrics endpoint returns success', async () => {
  const server = app.listen(0);
  server.unref();
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  const { port } = server.address();
  try {
    const res = await requestJson(port, '/metrics');
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  } finally {
    for (const s of sockets) s.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
});
