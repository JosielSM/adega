import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

test('remove products with stock and sales without erasing history or crossing accounts',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;`);
  for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const a=randomUUID(),b=randomUUID();await db.query('insert into auth.users values($1),($2)',[a,b]);
  const asUser=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const command=async(action,payload)=>(await db.query('select public.adega_command($1,$2::jsonb,$3) as result',[action,JSON.stringify(payload),randomUUID()])).rows[0].result;
  const remove=async(id,request=randomUUID())=>(await db.query('select public.adega_delete_product($1,$2) as result',[id,request])).rows[0].result;
  const product={name:'Bebida',brand:'',code:'SKU1',category:'Cervejas',cost:5,price:8,stock:24,min:12,pack_size:12,pack_price:84};
  await asUser(a);let state=await command('create_product',product);const id=state.products[0].id;
  state=await command('movement',{id,type:'sale',mode:'pack',quantity:1,price:84});const movements=state.movements;
  const settings=(await db.query('select public.adega_catalog_configure(true) as result')).rows[0].result;
  await asUser(b);await assert.rejects(remove(id),/Produto não encontrado/);
  await asUser(a);const request=randomUUID();state=await remove(id,request);
  assert.deepEqual(state.products,[]);assert.deepEqual(state.movements,movements);
  assert.deepEqual((await remove(id,request)).movements,movements);
  await assert.rejects(remove(id),/Produto não encontrado/);
  await assert.rejects(command('set_active',{id,active:true}),/Produto não encontrado/);
  await assert.rejects(command('update_product',{...product,id}),/Produto não encontrado/);
  await assert.rejects(command('movement',{id,type:'purchase',quantity:1,price:5}),/Produto não encontrado/);
  const catalog=(await db.query('select public.adega_public_catalog($1) as result',[settings.slug])).rows[0].result;
  assert.deepEqual(catalog.products,[]);
  state=await command('create_product',product);assert.equal(state.products.length,1);assert.notEqual(state.products[0].id,id);
  assert.equal(state.movements.filter(m=>m.productId===id).length,movements.length,'reusing the code must not change the old product history');
  const sale=movements.find(m=>m.type==='sale');
  state=(await db.query('select public.adega_cancel_sale($1,$2) as result',[sale.id,randomUUID()])).rows[0].result;
  assert.equal(state.products.length,1);assert.notEqual(state.products[0].id,id,'cancelling an old sale must not reactivate a removed product');
  assert.equal(state.products[0].stock,24,'a new product with the reused code must not receive stock from the old sale');
  await db.exec('set role anon');await assert.rejects(remove(id),/permission denied/);
 }finally{await db.close();}
});
