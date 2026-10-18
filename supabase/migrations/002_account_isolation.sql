begin;

-- A movement must belong to the same account as its product, even if a future
-- server implementation accidentally supplies a mismatched owner.
create unique index adega_products_owner_id on public.adega_products(owner_id, id);
alter table public.adega_movements add constraint adega_movements_same_account
  foreign key (owner_id, product_id) references public.adega_products(owner_id, id);

-- Read functions need no elevated rights. Direct reads must pass RLS too.
alter function public.adega_state() security invoker;

revoke all on public.adega_products, public.adega_movements, public.adega_commands from public, anon;
revoke all on public.adega_commands from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.adega_products, public.adega_movements from authenticated;
grant select on public.adega_products, public.adega_movements to authenticated;
revoke all on function public.adega_state() from public, anon;
revoke all on function public.adega_command(text,jsonb,uuid) from public, anon;
grant execute on function public.adega_state() to authenticated;
grant execute on function public.adega_command(text,jsonb,uuid) to authenticated;

commit;
