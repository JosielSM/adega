import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key', ASSETS: { fetch: async () => new Response('Adega') } };
const post = (path, data, extra = {}) => new Request(`https://adega.example/api/${path}`, { method: 'POST', headers: { origin: 'https://adega.example', 'content-type': 'application/json', ...extra }, body: JSON.stringify(data) });
test('API requires authentication; static assets remain available', async () => {
  assert.equal((await worker.fetch(new Request('https://adega.example/api/state'), env)).status, 401);
  assert.equal(await (await worker.fetch(new Request('https://adega.example/'), env)).text(), 'Adega');
});
test('cross-origin mutations are rejected', async () => {
  assert.equal((await worker.fetch(post('login', {}, { origin: 'https://other.example' }), env)).status, 403);
});
test('unconfigured backend returns actionable error', async () => {
  assert.equal((await worker.fetch(new Request('https://adega.example/api/state'), {})).status, 503);
});
test('login stores token in HttpOnly cookie, without exposing it in JSON', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://project.supabase.co/auth/v1/token?grant_type=password');
    assert.equal(options.headers.apikey, 'public-key');
    return Response.json({ access_token: 'secret-jwt', expires_in: 3600 });
  });
  const response = await worker.fetch(post('login', { email: 'owner@example.com', password: 'password' }), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.match(response.headers.get('set-cookie'), /Secure/);
  assert.deepEqual(await response.json(), { ok: true });
});
test('commands forward user token and idempotency identifier', async t => {
  const requestId = '12345678-1234-1234-1234-123456789012';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(url, /rpc\/adega_command$/);
    assert.equal(options.headers.Authorization, 'Bearer user-token');
    assert.equal(JSON.parse(options.body).p_request_id, requestId);
    return Response.json({ products: [], movements: [] });
  });
  const response = await worker.fetch(post('command', { action: 'movement', payload: { quantity: 1 }, requestId }, { cookie: 'adega_session=user-token' }), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('stock errors reach the client', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 'P0001', message: 'Estoque insuficiente.' }, { status: 400 }));
  const response = await worker.fetch(post('command', { action: 'movement', payload: {}, requestId: '12345678-1234-1234-1234-123456789012' }, { cookie: 'adega_session=user-token' }), env);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Estoque insuficiente.');
});
test('oversized and malformed JSON are rejected', async () => {
  assert.equal((await worker.fetch(post('login', { email: 'a'.repeat(40000) }), env)).status, 413);
  const request = new Request('https://adega.example/api/login', { method: 'POST', headers: { origin: 'https://adega.example', 'content-type': 'application/json' }, body: '{' });
  assert.equal((await worker.fetch(request, env)).status, 400);
});
test('logout expires cookie', async () => {
  assert.match((await worker.fetch(post('logout', {}), env)).headers.get('set-cookie'), /Max-Age=0/);
});
