import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCatalogCart} from '../src/catalog-stock.js';
import {cartCapacity,catalogVariants} from '../cart.js';
const catalog={products:[{id:'a',name:'Cerveja',price:5,packSize:12,packPrice:45,packName:'Caixa',availableUnits:48}]};
test('server checks full boxes and units against one canonical balance',()=>{
 assert.equal(validateCatalogCart(catalog,[{id:'a:pack',quantity:4}])[0].quantity,4);
 assert.throws(()=>validateCatalogCart(catalog,[{id:'a:pack',quantity:5,units:1,stockUnits:9999}]),/Estoque insuficiente/);
 assert.throws(()=>validateCatalogCart(catalog,[{id:'a:pack',quantity:4},{id:'a:unit',quantity:1}]),/Estoque insuficiente/);
 assert.equal(validateCatalogCart(catalog,[{id:'a:pack',quantity:3},{id:'a:unit',quantity:12}]).length,2);
 assert.throws(()=>validateCatalogCart(catalog,[{id:'a:pack',quantity:2},{id:'a:pack',quantity:2}]),/inválida/);
 for(const quantity of [0,-1,1.5,'4',Number.MAX_SAFE_INTEGER])assert.throws(()=>validateCatalogCart(catalog,[{id:'a:pack',quantity}]));
 const afterSale={products:[{...catalog.products[0],availableUnits:47}]};
 assert.throws(()=>validateCatalogCart(afterSale,[{id:'a:pack',quantity:4}]),/Estoque insuficiente/);
 assert.equal(validateCatalogCart(afterSale,[{id:'a:pack',quantity:3},{id:'a:unit',quantity:11}]).length,2);
});
test('unknown stock is never treated as unlimited availability',()=>{
 assert.equal(cartCapacity(new Map(),{id:'a',units:12}),0);
 assert.deepEqual(catalogVariants([{id:'a',packSize:12,packPrice:45,availablePacks:4}]),[]);
 assert.throws(()=>validateCatalogCart({products:[{...catalog.products[0],availableUnits:null}]},[{id:'a:unit',quantity:1}]),/sem estoque/);
});
