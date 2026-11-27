import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

test('interface sends commands and reuses request ID after connection failure', async () => {
  const elements = new Map();
  const el = key => {
    if (!elements.has(key)) elements.set(key, { textContent: '', innerHTML: '', style: {}, focus() {}, showModal() { this.open = true; }, close() { this.open = false; }, querySelector() { return { disabled: false }; } });
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
  assert.match(el('#content').innerHTML, /<h1>Vendas<\/h1>/);
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
  vm.runInContext("db.products=[{id:'pack-product',name:'Bebida',code:'001234',active:true,stock:24,pack_size:6,cost:6.666667,price:8,pack_price:40}];transaction('purchase')",context);
  el('#transaction-product').value='pack-product';el('#transaction-product').onchange();
  assert.equal(el('#unit-price').value,6.67,'suggested unit cost must fit the cent precision of the form');
  el('#transaction-form').elements.mode.value='pack';el('#transaction-form').elements.mode.onchange();
  assert.equal(el('#unit-price').value,40,'a repeating unit cost must not produce an invalid fractional cent package price');
  assert.match(el('#transaction-stock').textContent,/18 unidades/);
  assert.match(el('#transaction-total').textContent,/120,00/);
  el('#transaction-search').value='001234';
  el('#transaction-search').oninput();
  assert.match(el('#transaction-results').innerHTML, /<th scope="col">Código<\/th>/);
  let prevented = false;
  el('#transaction-search').onkeydown({key:'Enter',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(el('#transaction-product').value,'pack-product');
  assert.equal(el('#transaction-entry').open,true);
  el('#cancel-transaction').onclick();
  assert.equal(el('#transaction-entry').open,false);
  vm.runInContext("showReceipt({name:'Bebida',party:'<Cliente>',payment:'Pix',quantity:2,price:8,date:new Date()})",context);
  assert.match(el('#receipt-details').innerHTML,/&lt;Cliente&gt;/);
  assert.match(el('#receipt-details').innerHTML,/16,00/);
  vm.runInContext("pointOfSale()",context);
  el('#pos-search').value='001234';
  el('#pos-search').onkeydown({key:'Enter',preventDefault(){}});
  el('#pos-search').value='001234';
  el('#pos-search').onkeydown({key:'Enter',preventDefault(){}});
  assert.match(el('#pos-cart').innerHTML,/value="2"/);
  assert.match(el('#pos-total').textContent,/16,00/);
  vm.runInContext(`db.movements=[
    {saleId:'sale-1',name:'Bebida',party:'Ana',quantity:2,price:8,date:new Date()},
    {saleId:'sale-1',name:'Água',party:'Ana',quantity:1,price:3,date:new Date()}
  ];showReceipt(db.movements[0]);`,context);
  assert.match(el('#receipt-details').innerHTML,/Água/);
  assert.match(el('#receipt-details').innerHTML,/19,00/);
  assert.equal(vm.runInContext('groupedMovements(db.movements).length',context),1);
  assert.doesNotMatch(vm.runInContext("stockBreakdown({stock:24,pack_size:12,pack_name:'<img src=x>'})",context),/<img/);
});
