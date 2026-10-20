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
  let hold = false;
  let finish;
  const context = vm.createContext({
    AbortSignal, Intl, Date, JSON, Number, String, Array, Object, Set, Math, Error, navigator:{onLine:true}, crypto: webcrypto,
    document: { body: { classList: { add() {}, remove() {} } }, querySelector: el, querySelectorAll: () => [] }, location: { hash: '' },
    window: { addEventListener() {} }, setTimeout: () => 1, clearTimeout() {},
    fetch: async (url, options) => {
      if (url === '/api/command') {
        calls.push(JSON.parse(options.body));
        if (fail) throw Error('Connexion interrompue');
        if (hold) return new Promise(resolve=>{finish=resolve;});
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
  hold=true;
  const stale=vm.runInContext("saveCommand('movement',{id:'previous-account-product',type:'sale',quantity:1,price:10},source)",context);
  vm.runInContext('sessionGeneration++',context);
  finish(Response.json({products:[{id:'previous-account-product'}],movements:[]}));
  assert.equal(await stale,false);
  assert.equal(vm.runInContext('db.products.length',context),0,'response from prior account must never replace current data');
  el('#transaction-form').elements={mode:{value:'unit',querySelector:()=>({disabled:false})},quantity:{value:'3'}};
  vm.runInContext("db.products=[{id:'pack-product',name:'Bebida',active:true,stock:24,pack_size:6,cost:6.666667,price:8,pack_price:40}];transaction('purchase')",context);
  el('#transaction-product').value='pack-product';el('#transaction-product').onchange();
  assert.equal(el('#unit-price').value,6.67,'suggested unit cost must fit the cent precision of the form');
  el('#transaction-form').elements.mode.value='pack';el('#transaction-form').elements.mode.onchange();
  assert.equal(el('#unit-price').value,40,'a repeating unit cost must not produce an invalid fractional cent package price');
  assert.match(el('#transaction-stock').textContent,/18 unidades/);
  assert.match(el('#transaction-total').textContent,/120,00/);
  assert.doesNotMatch(vm.runInContext("stockBreakdown({stock:24,pack_size:12,pack_name:'<img src=x>'})",context),/<img/);
});
