import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('automatic sync skips hidden tabs and rejects a response started before a write', async () => {
  let tick, finish, calls = 0, renders = 0;
  const status = {};
  const context = vm.createContext({authenticated:true,busy:false,dataRevision:0,db:{products:[]},Date,JSON,Event,CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
    navigator:{onLine:true},document:{hidden:false,activeElement:{matches:()=>false},querySelector:selector=>selector==='#sync-status'?status:null,querySelectorAll:()=>[],addEventListener(){}},
    window:{addEventListener(){},dispatchEvent(){}},setInterval:callback=>{tick=callback;},render:()=>{renders++;},
    api:async()=>{calls++; return new Promise(resolve=>{finish=resolve;});}
  });
  vm.runInContext(await readFile(new URL('../sync.js',import.meta.url),'utf8'),context);
  context.document.hidden=true; await tick(); assert.equal(calls,0);
  context.document.hidden=false;
  const pending=tick(); context.dataRevision++; finish({products:[{id:'old'}]}); await pending;
  assert.equal(context.db.products.length,0); assert.equal(renders,0);
  const fresh=tick(); finish({products:[{id:'new'}]}); await fresh;
  assert.equal(context.db.products[0].id,'new'); assert.equal(renders,1);
});
