import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {catalogVariants,reconcileCart} from '../cart.js';

test('packages share unit stock, preserve exact prices, costs, cancellations and account isolation',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;`);
  for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const a=randomUUID(),b=randomUUID();await db.query('insert into auth.users values($1),($2)',[a,b]);
  const asUser=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const command=async(action,payload,request=randomUUID())=>(await db.query('select public.adega_command($1,$2::jsonb,$3) as result',[action,JSON.stringify(payload),request])).rows[0].result;
  await asUser(a);
  const product={name:'Cerveja',brand:'',code:'',category:'Cervejas',cost:5,price:8,stock:3,stock_mode:'pack',min:12,pack_size:12,pack_price:84,pack_name:'Caixa'};
  let state=await command('create_product',product);const id=state.products[0].id;
  assert.equal(state.products[0].stock,36);
  state=await command('movement',{id,type:'sale',quantity:1,price:8});
  assert.equal(state.products[0].stock,35);
  const request=randomUUID(),payload={id,type:'sale',mode:'pack',quantity:2,price:84};
  state=await command('movement',payload,request);assert.equal(state.products[0].stock,11);
  const sale=state.movements.find(m=>m.packUnits===12);
  assert.equal(sale.quantity,24);assert.equal(sale.packCount,2);assert.equal(sale.lineTotal,168);assert.equal(sale.price,7);
  assert.equal((await command('movement',payload,request)).products[0].stock,11);
  await assert.rejects(command('movement',{...payload,quantity:1}),/Estoque insuficiente/);
  const settings=(await db.query('select public.adega_catalog_configure(true) as result')).rows[0].result;
  const catalog=async()=>(await db.query('select public.adega_public_catalog($1) as result',[settings.slug])).rows[0].result;
  assert.equal((await catalog()).products[0].availablePacks,0);
  assert.equal(catalogVariants((await catalog()).products).length,1);
  state=await command('movement',{id,type:'purchase',mode:'pack',quantity:3,price:60});
  assert.equal(state.products[0].stock,47);assert.equal(state.products[0].cost,5);
  assert.equal((await catalog()).products[0].availablePacks,3);
  await asUser(b);await assert.rejects(command('movement',{...payload,quantity:1}),/Produto não encontrado/);
  assert.equal((await db.query('select public.adega_state() as result')).rows[0].result.products.length,0);
  await asUser(a);
  state=(await db.query('select public.adega_cancel_sale($1,$2) as result',[sale.id,randomUUID()])).rows[0].result;
  assert.equal(state.products[0].stock,71);assert.ok(state.movements.find(m=>m.id===sale.id).cancelledAt);
  // Changing the package size later cannot rewrite the original sale or cancellation.
  await command('update_product',{...product,id,pack_size:6,pack_price:40});
  state=await command('movement',{id,type:'sale',mode:'pack',quantity:1,price:40});
  assert.equal(state.products[0].stock,65);assert.equal(state.movements.find(m=>m.id===sale.id).packUnits,12);
  assert.equal(state.movements.filter(m=>m.type==='sale'&&!m.cancelledAt).reduce((n,m)=>n+m.lineTotal,0),48);
  // A package bought for R$ 40 has a repeating unit cost; the paid total stays exact.
  state=await command('movement',{id,type:'purchase',mode:'pack',quantity:1,price:40});
  assert.equal(state.products[0].stock,71);assert.ok(Math.abs(state.products[0].cost-365/71)<0.000001);
  assert.equal(state.movements.filter(m=>m.type==='purchase').at(-1).lineTotal,40);
  state=await command('update_product',{id,name:'Cerveja',brand:'',code:'',category:'Cervejas',cost:state.products[0].cost,price:8,min:12});
  assert.equal(state.products[0].pack_size,6);assert.equal(state.products[0].pack_price,40,'an older browser must not erase package settings');
  await assert.rejects(command('movement',{id,type:'sale',mode:'pack',quantity:-1,price:40}),/Quantidade ou preço/);
  await assert.rejects(command('movement',{id,type:'sale',mode:'invalid',quantity:1,price:40}),/Forma de movimentação/);
  await assert.rejects(command('create_product',{...product,pack_size:0}),/Embalagem ou preço/);
  await db.exec('set role anon');await assert.rejects(command('movement',payload),/permission denied/);
  const published=await catalog();assert.equal(published.products.length,1);
  assert.equal(published.products[0].cost,undefined);assert.equal(published.products[0].owner_id,undefined);
 }finally{await db.close();}
});

test('unit and package cart options cannot consume the same units twice',()=>{
 const product={id:'a',name:'Cerveja',price:8,packSize:12,packPrice:84,packName:'Caixa',availableUnits:24,availablePacks:2};
 const [unit,pack]=catalogVariants([product]);assert.equal(pack.price,84);assert.equal(pack.units,12);
 const cart=new Map([[pack.id,{...pack,quantity:1}],[unit.id,{...unit,quantity:13}]]);
 assert.equal(reconcileCart(cart,[unit,pack]),true);assert.equal(cart.get(unit.id).quantity,12);
 const updated=catalogVariants([{...product,availableUnits:11,availablePacks:0}]);
 assert.equal(reconcileCart(cart,updated),true);assert.equal(cart.has(pack.id),false);assert.equal(cart.get(unit.id).quantity,11);
});
