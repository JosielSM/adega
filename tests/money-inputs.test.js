import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('BRL mask keeps empty fields empty and converts typed cents to canonical numeric values',async()=>{
 const context=vm.createContext({Intl});vm.runInContext(await readFile(new URL('../money-inputs.js',import.meta.url),'utf8'),context);
 for(const [typed,value] of [['',''],['0','0.00'],['1250','12.50'],['R$ 1.234,56','1234.56']]){
  assert.equal(vm.runInContext(`moneyFromDigits(${JSON.stringify(typed)})`,context),value);
 }
 assert.equal(vm.runInContext("moneyDisplay('')",context),'');
 assert.match(vm.runInContext("moneyDisplay('1234.56')",context),/R\$\s1\.234,56/);
 assert.equal(vm.runInContext("moneyFromDigits('0000001250')",context),'12.50');
});
