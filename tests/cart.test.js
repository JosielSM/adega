import test from 'node:test';
import assert from 'node:assert/strict';
import {orderMessage,reconcileCart,cartCapacity,setCartQuantity} from '../cart.js';
test('WhatsApp draft includes only products, quantities, values and total',()=>{
 const text=orderMessage([{name:'Bebida A',brand:'Marca',price:10.10,quantity:3},{name:'Bebida B',price:5.50,quantity:2}]);
 assert.match(text,/3 × Bebida A/);assert.match(text,/Total a pagar:.*41,30/);
 assert.doesNotMatch(text,/Olá|Observações|confirme|Obrigado|Marca/);
});
test('cart rechecks availability and price before checkout',()=>{
 const cart=new Map([['a',{id:'a',price:10,quantity:2}],['b',{id:'b',price:5,quantity:1}]]);
 assert.equal(reconcileCart(cart,[{id:'a',name:'A',price:12,stockUnits:10}]),true);
 assert.equal(cart.has('b'),false);assert.equal(cart.get('a').price,12);assert.equal(cart.get('a').quantity,2);
 assert.equal(reconcileCart(cart,[{id:'a',name:'A',price:12,stockUnits:10}]),false);
});

test('delivery address is included in WhatsApp draft with line breaks',()=>{
 const text=orderMessage([{name:'Skol',price:15,quantity:2}],' Rua A, 123\nCentro, Manaus - AM\nCasa 2 ');
 assert.match(text,/Total a pagar:.*30,00/);
 assert.match(text,/\*Endereço de entrega\*\nRua A, 123\nCentro, Manaus - AM\nCasa 2$/);
});

test('typed quantities can exceed 99 and share the available stock across units and packages',()=>{
 const cart=new Map(),unit={id:'a:unit',productId:'a',stockUnits:240,units:1,price:5},pack={...unit,id:'a:pack',units:12,price:50};
 assert.equal(setCartQuantity(cart,unit,120),true);assert.equal(cart.get(unit.id).quantity,120);
 assert.equal(cartCapacity(cart,pack),10);assert.equal(setCartQuantity(cart,pack,10),true);
 assert.equal(setCartQuantity(cart,unit,121),false);assert.equal(setCartQuantity(cart,pack,11),false);
 for(const quantity of [-1,1.5,NaN,Infinity])assert.equal(setCartQuantity(cart,unit,quantity),false);
 assert.equal(setCartQuantity(cart,unit,0),true);assert.equal(cart.has(unit.id),false);
 assert.equal(cartCapacity(cart,pack),20);
});

test('WhatsApp order includes the chosen payment method together with address and total',()=>{
 for(const payment of ['Pix','Dinheiro','Cartão de débito','Cartão de crédito']){
  const text=orderMessage([{name:'Bebida',price:5,quantity:3}],'Bairro: Centro\nRua: A\nNúmero: 10',payment);
  assert.ok(text.endsWith('💳 *Forma de pagamento*\n'+payment));
  assert.match(text,/15,00/);assert.match(text,/Bairro: Centro/);
 }
});
