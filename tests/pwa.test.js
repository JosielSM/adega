import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('service worker never intercepts private API, callbacks or writes', async () => {
  const handlers = {};
  vm.runInNewContext(await readFile(new URL('../sw.js', import.meta.url), 'utf8'), {
    URL, self: {location: {origin: 'https://adega.example'}, addEventListener: (type, handler) => {handlers[type] = handler;}}
  });
  for (const [path, method, mode] of [['/api/state','GET','cors'], ['/api/auth/callback?code=secret','GET','navigate'], ['/api/command','POST','cors'], ['https://external.example/','GET','navigate']]) {
    let intercepted = false;
    handlers.fetch({request: {url: new URL(path, 'https://adega.example').href, method, mode}, respondWith: () => {intercepted = true;}});
    assert.equal(intercepted, false, path);
  }
});

test('offline navigation returns only public notice, never stored account pages', async () => {
  const handlers = {};
  let requested;
  vm.runInNewContext(await readFile(new URL('../sw.js', import.meta.url), 'utf8'), {
    URL, fetch: async () => {throw new Error('offline');}, caches: {match: async path => {requested = path; return 'public offline notice';}},
    self: {location: {origin: 'https://adega.example'}, addEventListener: (type, handler) => {handlers[type] = handler;}}
  });
  let response;
  handlers.fetch({request: {url:'https://adega.example/',method:'GET',mode:'navigate'},respondWith: promise => {response = promise;}});
  assert.equal(await response, 'public offline notice');
  assert.equal(requested, '/offline.html');
});
