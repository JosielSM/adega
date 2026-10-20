import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

async function fixture(product){
 const values={name:'Cerveja',category:'Cervejas',purchase_mode:'unit',stock:'0',pack_size:'12',purchase_cost:'',price:'8',pack_price:'84',pack_name:'Caixa',brand:'',code:'',min:'5'};
 const inputs=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value,disabled:false,focus(){}}]));
 const nodes=new Map();const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',hidden:false});return nodes.get(selector);};
 const form={elements:{namedItem:name=>inputs[name]},querySelector:node};
 const fields={querySelector:node,innerHTML:''};let payload;
 const context=vm.createContext({db:{products:product?[product]:[]},categories:['Cervejas'],document:{querySelector:selector=>selector==='#modal-form'?form:selector==='#modal-fields'?fields:selector==='#modal'?{showModal(){}}:node(selector)},field:()=>'',esc:value=>String(value??''),money:value=>Number(value).toFixed(2),FormData:class{constructor(){return Object.entries(inputs).filter(([,input])=>!input.disabled).map(([name,input])=>[name,input.value]);}},saveCommand:async(action,data)=>{payload={action,data};return false;}});
 vm.runInContext(await readFile(new URL('../product-form.js',import.meta.url),'utf8'),context);
 vm.runInContext(product?"productModal('a')":"productModal()",context);
 return {inputs,form,fields,node,payload:()=>payload};
}
test('box purchase computes units and unit cost, and sends the existing stock contract',async()=>{
 const f=await fixture();
 assert.equal(f.node('#product-box-size').hidden,true);assert.equal(f.inputs.pack_size.disabled,true);
 f.inputs.purchase_mode.value='pack';f.inputs.stock.value='3';f.inputs.purchase_cost.value='60';f.fields.oninput();
 assert.equal(f.node('#product-unit-total').textContent,'36 unidades');
 assert.match(f.node('#product-purchase-detail').textContent,/3 caixas × 12 unidades.*180.00.*5.00/);
 assert.equal(f.node('#product-box-size').hidden,false);assert.equal(f.inputs.pack_size.disabled,false);
 await f.form.onsubmit({preventDefault(){}});
 assert.equal(f.payload().action,'create_product');assert.equal(f.payload().data.stock,3);assert.equal(f.payload().data.stock_mode,'pack');
 assert.equal(f.payload().data.pack_size,12);assert.equal(f.payload().data.cost,5);assert.equal(f.payload().data.price,8);assert.equal(f.payload().data.pack_price,84);
});
test('switching to units does not submit hidden box values; editing never adds initial stock',async()=>{
 const f=await fixture();f.inputs.purchase_mode.value='pack';f.fields.onchange();f.inputs.purchase_mode.value='unit';f.inputs.stock.value='7';f.inputs.purchase_cost.value='5';f.fields.onchange();
 assert.equal(f.node('#product-unit-total').textContent,'7 unidades');
 await f.form.onsubmit({preventDefault(){}});
 assert.equal(f.payload().data.stock_mode,'unit');assert.equal(f.payload().data.pack_size,1);assert.equal(f.payload().data.pack_price,null);assert.equal(f.payload().data.cost,5);
 const edit=await fixture({id:'a',name:'Cerveja',pack_size:12,pack_price:84,cost:5.123456,stock:35});
 edit.inputs.purchase_mode.value='pack';edit.inputs.purchase_cost.value='5.123456';edit.fields.onchange();
 assert.equal(edit.node('#product-unit-total').textContent,'35 unidades');
 await edit.form.onsubmit({preventDefault(){}});
 assert.equal(edit.payload().action,'update_product');assert.equal(edit.payload().data.cost,5.123456);assert.equal(edit.payload().data.stock,undefined);
});

test('package choice changes questions and saves grade, fardo and pack without changing the unit conversion',async()=>{
 for(const [name,question,price] of [['Grade','Quantas grades comprou? *','da grade completa'],['Fardo','Quantos fardos comprou? *','do fardo completo'],['Pack','Quantos packs comprou? *','do pack completo']]){
  const f=await fixture();f.inputs.purchase_mode.value='pack';f.inputs.pack_name.value=name;f.inputs.stock.value='3';f.inputs.purchase_cost.value='60';f.fields.onchange();
  assert.equal(f.node('#product-quantity-label').textContent,question);
  assert.match(f.node('#product-pack-price-label').textContent,new RegExp(price));
  assert.equal(f.node('#product-unit-total').textContent,'36 unidades');
  await f.form.onsubmit({preventDefault(){}});
  assert.equal(f.payload().data.pack_name,name);assert.equal(f.payload().data.cost,5);
 }
});
