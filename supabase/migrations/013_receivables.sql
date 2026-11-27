begin;
alter table public.adega_movements drop constraint adega_movements_payment_check,
 add constraint adega_movements_payment_check check (payment in ('','Pix','Dinheiro','Cartão de débito','Cartão de crédito','A receber'));
create table public.adega_customers (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 150),
 phone text not null default '' check (length(phone)<=30)
);
alter table public.adega_customers enable row level security;
revoke all on public.adega_customers from public, anon, authenticated;
grant select on public.adega_customers to authenticated;
create policy adega_customer_read on public.adega_customers for select to authenticated using (owner_id=auth.uid());
alter table public.adega_movements add column customer_id uuid references public.adega_customers(id) on delete set null, add column paid_at timestamptz;

create function public.adega_customer_save(p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous public.adega_commands%rowtype;
begin
 if actor is null or p_request_id is null then raise exception 'Operação inválida.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
 select * into previous from public.adega_commands where owner_id=actor and request_id=p_request_id;
 if found then
  if previous.action<>'customer_save' or previous.payload<>p_payload then raise exception 'Identificador de operação já utilizado.'; end if;
  return public.adega_state();
 end if;
 insert into public.adega_customers(owner_id,name,phone) values(actor,trim(coalesce(p_payload->>'name','')),trim(coalesce(p_payload->>'phone','')));
 insert into public.adega_commands(owner_id,request_id,action,payload) values(actor,p_request_id,'customer_save',p_payload);
 return public.adega_state();
end;
$$;

create function public.adega_receive_sale(p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();
 previous public.adega_commands%rowtype;
 ticket uuid:=(p_payload->>'id')::uuid;
 method text:=coalesce(p_payload->>'payment','');
begin
 if actor is null or p_request_id is null or ticket is null or method not in ('Pix','Dinheiro','Cartão de débito','Cartão de crédito') then
  raise exception 'Confira a forma de pagamento.';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
 select * into previous from public.adega_commands where owner_id=actor and request_id=p_request_id;
 if found then
  if previous.action<>'receive_sale' or previous.payload<>p_payload then raise exception 'Identificador de operação já utilizado.'; end if;
  return public.adega_state();
 end if;
 update public.adega_movements set payment=method,paid_at=now()
 where owner_id=actor and sale_id=ticket and type='sale' and payment='A receber' and cancelled_at is null and deleted_at is null;
 if not found then raise exception 'Venda em aberto não encontrada ou já recebida.'; end if;
 insert into public.adega_commands(owner_id,request_id,action,payload) values(actor,p_request_id,'receive_sale',p_payload);
 return public.adega_state();
end;
$$;
revoke all on function public.adega_customer_save(jsonb,uuid),public.adega_receive_sale(jsonb,uuid) from public,anon;
grant execute on function public.adega_customer_save(jsonb,uuid),public.adega_receive_sale(jsonb,uuid) to authenticated;

create or replace function public.adega_state() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'phone',c.phone) order by c.name,c.id) from public.adega_customers c where c.owner_id=auth.uid()),'[]'::jsonb),
 'products',coalesce((select jsonb_agg((to_jsonb(p)-'owner_id'-'created_at'-'unit_image'-'pack_image')||jsonb_build_object('has_unit_image',p.unit_image<>'','has_pack_image',p.pack_image<>'') order by p.created_at,p.id) from public.adega_products p where p.owner_id=auth.uid() and p.deleted_at is null),'[]'::jsonb),
 'movements',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'paidAt',m.paid_at,'customerId',m.customer_id,'saleId',m.sale_id,'productId',m.product_id,'name',m.name,'type',m.type,'quantity',m.quantity,'price',m.price,'cost',m.cost,'party',m.party,'payment',m.payment,'date',m.created_at,'cancelledAt',m.cancelled_at,'packCount',m.pack_count,'packUnits',m.pack_units,'packLabel',m.pack_label,'lineTotal',m.line_total) order by m.created_at,m.id) from public.adega_movements m where m.owner_id=auth.uid() and m.deleted_at is null),'[]'::jsonb));
$$;

create or replace function public.adega_checkout(p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid();
 previous public.adega_commands%rowtype;
 product public.adega_products%rowtype;
 item jsonb;
 customer text:=trim(coalesce(p_payload->>'party',''));
 payment text:=coalesce(p_payload->>'payment','');
 customer_id uuid:=nullif(p_payload->>'customerId','')::uuid;
 mode text;
 amount integer;
 factor integer;
 units bigint;
 unit_price numeric;
begin
 if actor is null or p_request_id is null then raise exception 'Operação inválida.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
 select * into previous from public.adega_commands where owner_id=actor and request_id=p_request_id;
 if found then
  if previous.action<>'checkout' or previous.payload<>p_payload then raise exception 'Identificador de operação já utilizado.'; end if;
  return public.adega_state();
 end if;
 if customer_id is not null then
  select c.name into customer from public.adega_customers c where c.id=customer_id and c.owner_id=actor;
  if not found then raise exception 'Cliente não encontrado.'; end if;
 end if;
 if length(customer) not between 1 and 150 or payment not in ('Pix','Dinheiro','Cartão de débito','Cartão de crédito','A receber') then
  raise exception 'Confira o nome do cliente e a forma de pagamento.';
 end if;
 if jsonb_typeof(p_payload->'items') is distinct from 'array' then raise exception 'Itens inválidos.'; end if;
 if jsonb_array_length(p_payload->'items') not between 1 and 100 then raise exception 'Inclua de 1 a 100 linhas na venda.'; end if;
 for item in select value from jsonb_array_elements(p_payload->'items')
 loop
  select * into product from public.adega_products
  where id=(item->>'id')::uuid and owner_id=actor and active and deleted_at is null for update;
  if not found then raise exception 'Produto indisponível.'; end if;
  mode:=coalesce(item->>'mode','');
  if mode not in ('unit','pack') or (mode='pack' and product.pack_size<=1) then raise exception 'Embalagem inválida.'; end if;
  factor:=case when mode='pack' then product.pack_size else 1 end;
  amount:=(item->>'quantity')::integer;
  units:=amount::bigint*factor;
  if units is null or units<1 or units>product.stock then raise exception 'Estoque insuficiente para %.',product.name; end if;
  unit_price:=case when mode='pack' then product.pack_price else product.price end;
  if unit_price is null or unit_price<=0 or unit_price is distinct from (item->>'price')::numeric then
   raise exception 'Confira o preço atualizado de %.',product.name;
  end if;
  update public.adega_products set stock=stock-units::integer where id=product.id and owner_id=actor;
  insert into public.adega_movements(owner_id,product_id,name,type,quantity,price,cost,party,payment,pack_count,pack_units,pack_label,line_total,sale_id,customer_id)
  values(actor,product.id,product.name,'sale',units::integer,unit_price/factor,product.cost,customer,payment,amount,factor,
    case when factor>1 then product.pack_name else 'Unidade' end,amount*unit_price,p_request_id,customer_id);
 end loop;
 insert into public.adega_commands(owner_id,request_id,action,payload) values(actor,p_request_id,'checkout',p_payload);
 return public.adega_state();
end;
$$;
revoke all on function public.adega_checkout(jsonb,uuid) from public,anon;
grant execute on function public.adega_checkout(jsonb,uuid) to authenticated;


commit;
