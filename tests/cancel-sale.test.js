import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
test('cancel sale restores historical cost and stock once, with account isolation',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;`);
  for(const file of ['001_adega.sql','002_account_isolation.sql','007_cancel_sale.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const a=randomUUID(),b=randomUUID();await db.query('insert into auth.users values($1),($2)',[a,b]);
  const asUser=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const command=async(action,payload)=>(await db.query('select public.adega_command($1,$2::jsonb,$3) as result',[action,JSON.stringify(payload),randomUUID()])).rows[0].result;
  const cancel=async(id,request=randomUUID())=>(await db.query('select public.adega_cancel_sale($1,$2) as result',[id,request])).rows[0].result;
  await asUser(a);
  let state=await command('create_product',{name:'Bebida',brand:'',code:'',category:'Cervejas',cost:10,price:30,stock:10,min:1});const id=state.products[0].id;
  state=await command('movement',{id,type:'sale',quantity:4,price:30});const sale=state.movements.find(m=>m.type==='sale');
  await command('movement',{id,type:'purchase',quantity:6,price:20});
  await asUser(b);await assert.rejects(cancel(sale.id),/não encontrada/);
  await asUser(a);const request=randomUUID();state=await cancel(sale.id,request);
  assert.equal(state.products[0].stock,16);assert.equal(state.products[0].cost,13.75);
  assert.ok(state.movements.find(m=>m.id===sale.id).cancelledAt);
  assert.equal(state.movements.filter(m=>m.type==='sale'&&!m.cancelledAt).length,0);
  state=await cancel(sale.id,request);assert.equal(state.products[0].stock,16);
  await assert.rejects(cancel(sale.id),/já foi cancelada/);
  await assert.rejects(cancel(state.movements.find(m=>m.type==='purchase').id),/Somente vendas/);
  await db.exec('set role anon');await assert.rejects(cancel(sale.id),/permission denied/);
 }finally{await db.close();}
});
