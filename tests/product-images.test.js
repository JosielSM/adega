import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {catalogVariants} from '../cart.js';

test('product photos are separate, private until publication, and omitted from stock snapshots',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;`);
  for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  const a=randomUUID(),b=randomUUID();await db.query('insert into auth.users values($1),($2)',[a,b]);
  const asUser=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const command=async(action,payload,request=randomUUID())=>(await db.query('select public.adega_command($1,$2::jsonb,$3) as result',[action,JSON.stringify(payload),request])).rows[0].result;
  const image=async(id,mode)=>(await db.query('select public.adega_product_image($1,$2) as result',[id,mode])).rows[0].result;
  const publicImage=async(slug,id,mode)=>(await db.query('select public.adega_catalog_image($1,$2,$3) as result',[slug,id,mode])).rows[0].result;
  const unit='data:image/jpeg;base64,/9j/AA==',pack='data:image/jpeg;base64,/9j/AQ==';
  await asUser(a);
  const product={name:'Bebida',brand:'',code:'',category:'Cervejas',cost:5,price:8,stock:24,min:1,pack_size:12,pack_price:84,pack_name:'Caixa',unit_image:unit,pack_image:pack};
  const request=randomUUID();let state=await command('create_product',product,request);const id=state.products[0].id;
  assert.equal(state.products[0].has_unit_image,true);assert.equal(state.products[0].unit_image,undefined);assert.equal(state.products[0].pack_image,undefined);
  assert.equal(await image(id,'unit'),unit);assert.equal(await image(id,'pack'),pack);
  assert.equal((await command('create_product',product,request)).products.length,1);
  await asUser(b);assert.equal(await image(id,'unit'),null);
  await assert.rejects(command('update_product',{...product,id}),/Produto não encontrado/);
  const other=(await db.query('select public.adega_catalog_configure(true) as result')).rows[0].result;
  assert.equal(await publicImage(other.slug,id,'unit'),null);
  await asUser(a);const settings=(await db.query('select public.adega_catalog_configure(true) as result')).rows[0].result;
  const published=(await db.query('select public.adega_public_catalog($1) as result',[settings.slug])).rows[0].result;
  const variants=catalogVariants(published.products);assert.match(variants[0].image,/mode=unit/);assert.match(variants[1].image,/mode=pack/);
  await db.exec('set role anon');assert.equal(await publicImage(settings.slug,id,'pack'),pack);await assert.rejects(image(id,'unit'),/permission denied/);
  await asUser(a);const {unit_image,pack_image,...withoutPhotos}=product;
  await command('update_product',{...withoutPhotos,id});assert.equal(await image(id,'unit'),unit);
  await assert.rejects(command('update_product',{...withoutPhotos,id,unit_image:'data:image/svg+xml;base64,AAAA'}),/Imagem da unidade inválida/);
  state=await command('update_product',{...withoutPhotos,id,unit_image:''});assert.equal(state.products[0].has_unit_image,false);assert.equal(state.products[0].image_version,1);assert.equal(await image(id,'pack'),pack);
  await db.query('select public.adega_catalog_configure(false)');assert.equal(await publicImage(settings.slug,id,'pack'),null);
  await db.exec('reset role');const history=(await db.query("select payload->>'unit_image' as image from public.adega_commands where request_id=$1",[request])).rows[0];
  assert.match(history.image,/^md5:/);assert.notEqual(history.image,unit);
 }finally{await db.close();}
});
