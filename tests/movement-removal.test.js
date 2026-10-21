import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

test('movement removal reverses stock once, protects dependent receipts and isolates accounts',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;`);
  for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const a=randomUUID(),b=randomUUID();await db.query('insert into auth.users values($1),($2)',[a,b]);
  const asUser=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const command=async(action,payload)=>(await db.query('select public.adega_command($1,$2::jsonb,$3) as result',[action,JSON.stringify(payload),randomUUID()])).rows[0].result;
  const remove=async(id,request=randomUUID())=>(await db.query('select public.adega_delete_movement($1,$2) as result',[id,request])).rows[0].result;
  await asUser(a);
  let state=await command('create_product',{name:'Bebida',brand:'',code:'',category:'Cervejas',cost:5,price:9,stock:24,min:1,pack_size:12,pack_price:90});
  const id=state.products[0].id,opening=state.movements[0].id;
  state=await command('movement',{id,type:'purchase',mode:'pack',quantity:1,price:120});const receipt=state.movements.find(m=>m.type==='purchase').id;
  state=await command('movement',{id,type:'sale',mode:'pack',quantity:1,price:90});const sale=state.movements.find(m=>m.type==='sale').id;
  await assert.rejects(remove(receipt),/posteriores/);
  await asUser(b);await assert.rejects(remove(sale),/não encontrada/);
  await asUser(a);const request=randomUUID();state=await remove(sale,request);
  assert.equal(state.products[0].stock,36);assert.equal(state.movements.some(m=>m.id===sale),false);
  assert.equal((await remove(sale,request)).products[0].stock,36);
  await assert.rejects(remove(receipt,request),/Identificador/);
  await assert.rejects(db.query('select public.adega_cancel_sale($1,$2)',[sale,randomUUID()]),/já foi cancelada/);
  state=await remove(receipt);assert.equal(state.products[0].stock,24);assert.equal(state.products[0].cost,5);
  state=await command('movement',{id,type:'sale',quantity:2,price:9});const cancelled=state.movements.find(m=>m.type==='sale').id;
  await db.query('select public.adega_cancel_sale($1,$2)',[cancelled,randomUUID()]);
  state=await remove(cancelled);assert.equal(state.products[0].stock,24);
  state=await remove(opening);assert.equal(state.products[0].stock,0);assert.equal(state.movements.length,0);
  await db.exec('set role anon');await assert.rejects(remove(opening),/permission denied/);
 }finally{await db.close();}
});
