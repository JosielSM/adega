begin;
create table public.adega_cash_shifts (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 opened_at timestamptz not null default now(),
 opening numeric(14,2) not null check(opening>=0),
 closed_at timestamptz,
 expected numeric(14,2),
 counted numeric(14,2) check(counted>=0)
);
create unique index adega_one_open_cash_shift on public.adega_cash_shifts(owner_id) where closed_at is null;
create table public.adega_sale_payments (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 sale_id uuid not null,
 amount numeric(18,2) not null check(amount>0),
 method text not null check(method in ('Pix','Dinheiro','Cartão de débito','Cartão de crédito')),
 received_at timestamptz not null default now()
);
create index adega_payments_sale on public.adega_sale_payments(owner_id,sale_id);
create table public.adega_suspended_sales (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 payload jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.adega_cash_shifts enable row level security;
alter table public.adega_sale_payments enable row level security;
alter table public.adega_suspended_sales enable row level security;
revoke all on public.adega_cash_shifts,public.adega_sale_payments,public.adega_suspended_sales from public,anon,authenticated;
grant select on public.adega_cash_shifts,public.adega_sale_payments,public.adega_suspended_sales to authenticated;
create policy adega_cash_read on public.adega_cash_shifts for select to authenticated using(owner_id=auth.uid());
create policy adega_payments_read on public.adega_sale_payments for select to authenticated using(owner_id=auth.uid());
create policy adega_suspended_read on public.adega_suspended_sales for select to authenticated using(owner_id=auth.uid());

create function public.adega_cash_expected(p_opening numeric,p_opened_at timestamptz) returns numeric
language sql stable security invoker set search_path='' as $$
 select p_opening + coalesce((
  select sum(coalesce(m.line_total,m.quantity*m.price) *
   ((case when coalesce(m.paid_at,m.created_at)>=p_opened_at then 1 else 0 end) -
    (case when m.cancelled_at>=p_opened_at then 1 else 0 end)))
  from public.adega_movements m
  where m.owner_id=auth.uid() and m.type='sale' and m.payment='Dinheiro'
   and not exists(select 1 from public.adega_sale_payments p where p.owner_id=m.owner_id and p.sale_id=m.sale_id)
 ),0) + coalesce((
  select sum(p.amount *
   ((case when p.received_at>=p_opened_at then 1 else 0 end) -
    (case when s.cancelled_at>=p_opened_at then 1 else 0 end)))
  from public.adega_sale_payments p
  join lateral (select max(m.cancelled_at) as cancelled_at from public.adega_movements m where m.owner_id=p.owner_id and m.sale_id=p.sale_id) s on true
  where p.owner_id=auth.uid() and p.method='Dinheiro'
 ),0);
$$;
revoke all on function public.adega_cash_expected(numeric,timestamptz) from public,anon;
grant execute on function public.adega_cash_expected(numeric,timestamptz) to authenticated;

create function public.adega_counter_command(p_action text,p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous public.adega_commands%rowtype;
 shift public.adega_cash_shifts%rowtype;
 amount numeric;
 ticket uuid;
 method text;
 balance numeric;
begin
 if actor is null or p_request_id is null or p_payload is null then raise exception 'Operação inválida.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
 select * into previous from public.adega_commands where owner_id=actor and request_id=p_request_id;
 if found then
  if previous.action<>p_action or previous.payload<>p_payload then raise exception 'Identificador de operação já utilizado.'; end if;
  return public.adega_state();
 end if;
 case p_action
 when 'cash_open','cash_close' then
  amount:=(p_payload->>'amount')::numeric;
  if amount is null or amount<0 or amount>=1000000000000 or amount<>round(amount,2) then raise exception 'Informe um valor em reais válido.'; end if;
  select * into shift from public.adega_cash_shifts where owner_id=actor and closed_at is null;
  if p_action='cash_open' then
   if shift.id is not null then raise exception 'Já existe um caixa aberto.'; end if;
   insert into public.adega_cash_shifts(owner_id,opening) values(actor,amount);
  else
   if shift.id is null or shift.id is distinct from (p_payload->>'id')::uuid then raise exception 'O caixa mudou. Atualize a tela.'; end if;
   update public.adega_cash_shifts set counted=amount,expected=public.adega_cash_expected(shift.opening,shift.opened_at),closed_at=now() where id=shift.id;
  end if;
 when 'suspend_sale' then
  if jsonb_typeof(p_payload->'items') is distinct from 'array' then raise exception 'Confira os itens da pré-venda.'; end if;
  if jsonb_array_length(p_payload->'items') not between 1 and 100 then raise exception 'Confira os itens da pré-venda.'; end if;
  insert into public.adega_suspended_sales(id,owner_id,payload) values(p_request_id,actor,p_payload);
 when 'discard_suspended' then
  delete from public.adega_suspended_sales where id=(p_payload->>'id')::uuid and owner_id=actor;
  if not found then raise exception 'Pré-venda não encontrada.'; end if;
 when 'receive_sale' then
  ticket:=(p_payload->>'id')::uuid;
  method:=p_payload->>'payment';
  if method is null or method not in ('Pix','Dinheiro','Cartão de débito','Cartão de crédito') then raise exception 'Confira a forma de pagamento.'; end if;
  select sum(line_total) into balance from public.adega_movements where owner_id=actor and sale_id=ticket and payment='A receber' and cancelled_at is null and deleted_at is null;
  if balance is null then raise exception 'Venda em aberto não encontrada ou já recebida.'; end if;
  balance:=balance-coalesce((select sum(p.amount) from public.adega_sale_payments p where p.owner_id=actor and p.sale_id=ticket),0);
  amount:=coalesce((p_payload->>'amount')::numeric,balance);
  if amount<=0 or amount>balance or amount<>round(amount,2) then raise exception 'Informe um valor positivo até o saldo em aberto.'; end if;
  insert into public.adega_sale_payments(id,owner_id,sale_id,amount,method) values(p_request_id,actor,ticket,amount,method);
  if amount=balance then
   update public.adega_movements m set payment=method,paid_at=now() where m.owner_id=actor and m.sale_id=ticket;
  end if;
 else raise exception 'Operação inválida.';
 end case;
 insert into public.adega_commands(owner_id,request_id,action,payload) values(actor,p_request_id,p_action,p_payload);
 return public.adega_state();
end;
$$;
revoke all on function public.adega_counter_command(text,jsonb,uuid) from public,anon;
grant execute on function public.adega_counter_command(text,jsonb,uuid) to authenticated;

create or replace function public.adega_receive_sale(p_payload jsonb,p_request_id uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select public.adega_counter_command('receive_sale',p_payload,p_request_id);
$$;

create or replace function public.adega_state() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'cashShifts',coalesce((select jsonb_agg(to_jsonb(c)-'owner_id' order by c.opened_at desc) from (select * from public.adega_cash_shifts where owner_id=auth.uid() order by opened_at desc limit 30) c),'[]'::jsonb),
 'cashExpected',(select public.adega_cash_expected(opening,opened_at) from public.adega_cash_shifts where owner_id=auth.uid() and closed_at is null),
 'payments',coalesce((select jsonb_agg(to_jsonb(p)-'owner_id' order by p.received_at,p.id) from public.adega_sale_payments p where p.owner_id=auth.uid()),'[]'::jsonb),
 'suspended',coalesce((select jsonb_agg(to_jsonb(s)-'owner_id' order by s.created_at desc) from public.adega_suspended_sales s where s.owner_id=auth.uid()),'[]'::jsonb),
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
 suspended_id uuid:=nullif(p_payload->>'suspendedId','')::uuid;
 tender numeric:=nullif(p_payload->>'tender','')::numeric;
 sale_total numeric:=0;
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
 if suspended_id is not null and not exists(select 1 from public.adega_suspended_sales where id=suspended_id and owner_id=actor) then raise exception 'Pré-venda não encontrada.'; end if;
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
  sale_total:=sale_total+amount*unit_price;
  update public.adega_products set stock=stock-units::integer where id=product.id and owner_id=actor;
  insert into public.adega_movements(owner_id,product_id,name,type,quantity,price,cost,party,payment,pack_count,pack_units,pack_label,line_total,sale_id,customer_id)
  values(actor,product.id,product.name,'sale',units::integer,unit_price/factor,product.cost,customer,payment,amount,factor,
    case when factor>1 then product.pack_name else 'Unidade' end,amount*unit_price,p_request_id,customer_id);
 end loop;
 if tender is not null and (payment<>'Dinheiro' or tender<sale_total or tender>=1000000000000 or tender<>round(tender,2)) then raise exception 'Confira o valor recebido em dinheiro.'; end if;
 if suspended_id is not null then delete from public.adega_suspended_sales where id=suspended_id and owner_id=actor; end if;
 insert into public.adega_commands(owner_id,request_id,action,payload) values(actor,p_request_id,'checkout',p_payload);
 return public.adega_state();
end;
$$;
revoke all on function public.adega_checkout(jsonb,uuid) from public,anon;
grant execute on function public.adega_checkout(jsonb,uuid) to authenticated;



commit;
