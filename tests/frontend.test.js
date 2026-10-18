import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

test('interface sends commands and reuses request ID after connection failure', async () => {
  const elements = new Map();
  const el = key => {
    if (!elements.has(key)) elements.set(key, { textContent: '', innerHTML: '', style: {}, close() {}, querySelector() { return { disabled: false }; } });
    return elements.get(key);
  };
  const calls = [];
  let fail = false;
  const context = vm.createContext({
    Intl, Date, JSON, Number, String, Array, Object, Set, Math, Error, crypto: webcrypto,
    document: { body: { classList: { add() {}, remove() {} } }, querySelector: el, querySelectorAll: () => [] }, location: { hash: '' },
    window: { addEventListener() {} }, setTimeout: () => 1, clearTimeout() {},
    fetch: async (url, options) => {
      if (url === '/api/command') {
        calls.push(JSON.parse(options.body));
        if (fail) throw Error('Connexion interrompue');
      }
      return Response.json({ products: [], movements: [] });
    }
  });
  vm.runInContext(await readFile(new URL('../app.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(el('#content').innerHTML, /Seu negócio em um olhar/);
  fail = true;
  assert.equal(await vm.runInContext("globalThis.source={};saveCommand('movement',{id:'product',type:'sale',quantity:1,price:10},source)", context), false);
  fail = false;
  assert.equal(await vm.runInContext("saveCommand('movement',{id:'product',type:'sale',quantity:1,price:10},source)", context), true);
  assert.equal(calls[0].requestId, calls[1].requestId);
  assert.equal(calls[1].payload.quantity, 1);
});
