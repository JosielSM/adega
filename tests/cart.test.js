import test from 'node:test';
import assert from 'node:assert/strict';
import {orderMessage,reconcileCart} from '../cart.js';
test('WhatsApp draft includes only products, quantities, values and total',()=>{
 const text=orderMessage([{name:'Bebida A',brand:'Marca',price:10.10,quantity:3},{name:'Bebida B',price:5.50,quantity:2}]);
 assert.match(text,/3 × Bebida A/);assert.match(text,/Total a pagar:.*41,30/);
 assert.doesNotMatch(text,/Olá|Observações|confirme|Obrigado|Marca/);
});
test('cart rechecks availability and price before checkout',()=>{
 const cart=new Map([['a',{id:'a',price:10,quantity:2}],['b',{id:'b',price:5,quantity:1}]]);
 assert.equal(reconcileCart(cart,[{id:'a',name:'A',price:12}]),true);
 assert.equal(cart.has('b'),false);assert.equal(cart.get('a').price,12);assert.equal(cart.get('a').quantity,2);
 assert.equal(reconcileCart(cart,[{id:'a',name:'A',price:12}]),false);
});
