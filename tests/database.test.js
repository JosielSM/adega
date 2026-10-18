import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';

test('Postgres migration: stock, cost, idempotency, rollback and account isolation', async () => {
  const db = new PGlite();
  try {
    // Emulate only Supabase's auth schema; execute the real migration unchanged.
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/001_adega.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/002_account_isolation.sql', import.meta.url), 'utf8'));
    const userA = randomUUID(), userB = randomUUID();
    await db.query('insert into auth.users values ($1),($2)', [userA, userB]);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userA]);
    const command = async (action, payload, id = randomUUID()) => (await db.query('select public.adega_command($1,$2::jsonb,$3) as state', [action, JSON.stringify(payload), id])).rows[0].state;
    const state = async () => (await db.query('select public.adega_state() as state')).rows[0].state;
    let result = await command('create_product', { name: 'Vinho', brand: '', code: 'V1', category: 'Vinhos', cost: 10, price: 30, stock: 10, min: 2 });
    const product = result.products[0];
    assert.equal(result.movements.length, 1);
    assert.equal(product.stock, 10);
    const purchase = { id: product.id, type: 'purchase', quantity: 10, price: 20, party: 'Fornecedor' };
    const requestId = randomUUID();
    result = await command('movement', purchase, requestId);
    assert.equal(result.products[0].stock, 20);
    assert.equal(result.products[0].cost, 15);
    result = await command('movement', purchase, requestId);
    assert.equal(result.products[0].stock, 20);
    assert.equal(result.movements.length, 2);
    await assert.rejects(command('movement', { ...purchase, quantity: 1 }, requestId), /Identificador/);
    result = await command('movement', { id: product.id, type: 'sale', quantity: 15, price: 30, payment: 'Pix' });
    assert.equal(result.products[0].stock, 5);
    assert.equal(result.movements.find(m => m.type === 'sale').cost, 15);
    await assert.rejects(command('movement', { id: product.id, type: 'sale', quantity: 6, price: 30 }), /Estoque insuficiente/);
    assert.equal((await state()).products[0].stock, 5);
    await assert.rejects(command('movement', { id: product.id, type: 'purchase', quantity: 1, price: 20, party: 'x'.repeat(151) }), /check constraint/);
    assert.equal((await state()).products[0].stock, 5, 'failed history insert rolls stock update back');
    await command('set_active', { id: product.id, active: false });
    await assert.rejects(command('movement', { id: product.id, type: 'sale', quantity: 1, price: 30 }), /inativo/);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userB]);
    assert.equal((await state()).products.length, 0);
    await assert.rejects(command('set_active', { id: product.id, active: true }), /não encontrado/);
    await db.exec('set role authenticated');
    assert.equal((await db.query('select * from public.adega_products')).rows.length, 0, 'RLS isolates direct reads');
    await assert.rejects(db.query('update public.adega_products set stock=999'), /permission denied/);
  } finally { await db.close(); }
});
