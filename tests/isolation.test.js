import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('two stores: direct RLS, ownership injection, all commands, reports and idempotency stay isolated', async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;`);
    for(const file of ['001_adega.sql','002_account_isolation.sql','003_company_profile.sql','004_public_catalog.sql','005_catalog_whatsapp.sql','006_delete_product.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    const a=randomUUID(),b=randomUUID(),request=randomUUID();
    await db.query('insert into auth.users values($1),($2)',[a,b]);
    const asUser=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
    const command=async(action,payload,id=randomUUID())=>(await db.query('select public.adega_command($1,$2::jsonb,$3) as result',[action,JSON.stringify(payload),id])).rows[0].result;
    const state=async()=>(await db.query('select public.adega_state() as result')).rows[0].result;
    const data={name:'Bebida A',brand:'',code:'MESMO-CODIGO',category:'Vinhos',cost:10,price:30,stock:10,min:2};
    await asUser(a);
    await db.query("select public.adega_profile_save('Loja A','')");
    const sa=await command('create_product',{...data,owner_id:b,user_id:b},request);
    const pa=sa.products[0].id;
    const catalogA=(await db.query('select public.adega_catalog_configure(true) as result')).rows[0].result;
    await command('movement',{id:pa,type:'sale',quantity:2,price:30,owner_id:b});
    await asUser(b);
    await assert.rejects(db.query('select public.adega_delete_product($1,$2)',[pa,randomUUID()]),/não encontrado/);
    assert.deepEqual((await db.query('select public.adega_profile_get() as profile')).rows[0].profile,{companyName:'',logo:''});
    await db.query("select public.adega_profile_save('Loja B','')");
    assert.equal((await db.query('select * from public.adega_profiles where owner_id=$1',[a])).rows.length,0);
    await assert.rejects(db.query("insert into public.adega_profiles(owner_id,company_name) values($1,'Intruso')",[a]),/row-level security/);
    assert.deepEqual(await state(),{products:[],movements:[]});
    assert.equal((await db.query('select * from public.adega_products where id=$1',[pa])).rows.length,0);
    assert.equal((await db.query('select * from public.adega_movements')).rows.length,0);
    for(const [action,payload] of [
      ['update_product',{...data,id:pa,name:'Ataque'}],
      ['set_active',{id:pa,active:false}],
      ['movement',{id:pa,type:'sale',quantity:1,price:1}],
      ['movement',{id:pa,type:'purchase',quantity:1,price:1}]
    ])await assert.rejects(command(action,{...payload,owner_id:a}),/não encontrado/);
    const sb=await command('create_product',{...data,name:'Bebida B',owner_id:a},request);
    const pb=sb.products[0].id;
    assert.equal((await db.query('select public.adega_catalog_settings() as result')).rows[0].result.slug,null);
    const catalogB=(await db.query('select public.adega_catalog_configure(true) as result')).rows[0].result;
    assert.notEqual(catalogA.slug,catalogB.slug);
    assert.equal(sb.products.length,1);
    assert.equal(sb.products[0].name,'Bebida B');
    assert.equal(sb.movements.length,1);
    assert.equal(sb.movements.filter(m=>m.type==='sale').length,0,'B cannot inherit A revenue');
    await assert.rejects(db.query('select * from public.adega_commands'),/permission denied/);
    await assert.rejects(db.query('update public.adega_products set stock=100 where id=$1',[pa]),/permission denied/);
    await assert.rejects(db.query('delete from public.adega_movements'),/permission denied/);
    await asUser(a);
    assert.equal((await db.query('select public.adega_profile_get() as profile')).rows[0].profile.companyName,'Loja A');
    const finalA=await state();
    assert.equal(finalA.products.length,1);assert.equal(finalA.products[0].stock,8);
    assert.equal(finalA.movements.filter(m=>m.type==='sale').reduce((n,m)=>n+m.quantity*m.price,0),60);
    assert.ok(finalA.movements.every(m=>m.productId===pa));
    await assert.rejects(db.query('select public.adega_delete_product($1,$2)',[pa,randomUUID()]),/possui movimentações/);
    const temporary=await command('create_product',{...data,name:'Cadastro vazio',code:'',stock:0});
    const emptyId=temporary.products.find(p=>p.name==='Cadastro vazio').id;
    const deleteRequest=randomUUID();
    await db.query('select public.adega_delete_product($1,$2)',[emptyId,deleteRequest]);
    await db.query('select public.adega_delete_product($1,$2)',[emptyId,deleteRequest]);
    assert.equal((await state()).products.some(p=>p.id===emptyId),false);
    await assert.rejects(command('movement',{id:pb,type:'sale',quantity:1,price:30}),/não encontrado/);
    await db.exec('reset role');
    await assert.rejects(db.query("insert into public.adega_movements(owner_id,product_id,name,type,quantity,price,cost) values($1,$2,'invalid','sale',1,1,1)",[b,pa]),/adega_movements_same_account/);
    await db.exec('set role anon');
    const publicA=(await db.query('select public.adega_public_catalog($1) as result',[catalogA.slug])).rows[0].result;
    assert.equal(publicA.name,'Loja A');assert.equal(publicA.products.length,1);
    assert.deepEqual(Object.keys(publicA.products[0]).sort(),['brand','category','id','name','price']);
    assert.equal(publicA.products[0].name,'Bebida A');
    await assert.rejects(db.query('select * from public.adega_catalogs'),/permission denied/);
    await assert.rejects(db.query('select public.adega_catalog_configure(true)'),/permission denied/);
    await assert.rejects(state(),/permission denied/);
    await assert.rejects(command('create_product',data),/permission denied/);
    await assert.rejects(db.query('select * from public.adega_products'),/permission denied/);
    await asUser(a);await db.query('select public.adega_catalog_configure(false)');
    await db.exec('set role anon');
    assert.equal((await db.query('select public.adega_public_catalog($1) as result',[catalogA.slug])).rows[0].result,null);
  }finally{await db.close();}
});
