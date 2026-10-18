begin;

create table public.adega_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 100),
  brand text not null default '' check (length(brand) <= 150),
  code text not null default '' check (length(code) <= 150),
  category text not null check (category in ('Cervejas','Vinhos','Destilados','Espumantes','Refrigerantes','Águas','Energéticos','Sucos','Outros')),
  cost numeric(16,6) not null check (cost >= 0 and cost < 10000000000),
  price numeric(14,2) not null check (price > 0 and price < 10000000000),
  stock integer not null default 0 check (stock >= 0),
  min integer not null default 5 check (min >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index adega_product_code on public.adega_products(owner_id, code) where code <> '';
create index adega_products_owner on public.adega_products(owner_id);

create table public.adega_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  product_id uuid not null references public.adega_products(id),
  name text not null,
  type text not null check (type in ('sale','purchase','opening')),
  quantity integer not null check (quantity > 0),
  price numeric(16,6) not null check (price >= 0 and price < 10000000000),
  cost numeric(16,6) not null check (cost >= 0 and cost < 10000000000),
  party text not null default '' check (length(party) <= 150),
  payment text not null default '' check (payment in ('','Pix','Dinheiro','Cartão de débito','Cartão de crédito')),
  created_at timestamptz not null default now()
);
create index adega_movements_owner_date on public.adega_movements(owner_id, created_at);

create table public.adega_commands (
  owner_id uuid not null references auth.users(id),
  request_id uuid not null,
  action text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, request_id)
);

alter table public.adega_products enable row level security;
alter table public.adega_movements enable row level security;
alter table public.adega_commands enable row level security;
create policy products_read on public.adega_products for select to authenticated using (owner_id = (select auth.uid()));
create policy movements_read on public.adega_movements for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.adega_products, public.adega_movements, public.adega_commands from anon, authenticated;
grant select on public.adega_products, public.adega_movements to authenticated;

-- No direct writes: all mutations use the transaction below.
create function public.adega_state() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'products', coalesce((select jsonb_agg(to_jsonb(p) - 'owner_id' - 'created_at' order by p.created_at, p.id)
      from public.adega_products p where p.owner_id = auth.uid()), '[]'::jsonb),
    'movements', coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'productId',m.product_id,'name',m.name,'type',m.type,
      'quantity',m.quantity,'price',m.price,'cost',m.cost,'party',m.party,'payment',m.payment,'date',m.created_at
    ) order by m.created_at, m.id) from public.adega_movements m where m.owner_id = auth.uid()), '[]'::jsonb)
  );
$$;

create function public.adega_command(p_action text, p_payload jsonb, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  product public.adega_products%rowtype;
  previous public.adega_commands%rowtype;
  qty integer;
  unit numeric;
  movement_type text;
begin
  if actor is null then raise exception 'Autenticação obrigatória.'; end if;
  if p_request_id is null or p_payload is null then raise exception 'Operação inválida.'; end if;
  -- Serialize this account's commands, including duplicate requests.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text, 0));
  select * into previous from public.adega_commands where owner_id = actor and request_id = p_request_id;
  if found then
    if previous.action <> p_action or previous.payload <> p_payload then raise exception 'Identificador de operação já utilizado.'; end if;
    return public.adega_state();
  end if;

  if p_action = 'create_product' then
    insert into public.adega_products(owner_id,name,brand,code,category,cost,price,stock,min)
    values(actor,trim(p_payload->>'name'),coalesce(trim(p_payload->>'brand'),''),coalesce(trim(p_payload->>'code'),''),
      p_payload->>'category',(p_payload->>'cost')::numeric,(p_payload->>'price')::numeric,
      (p_payload->>'stock')::integer,(p_payload->>'min')::integer)
    returning * into product;
    if product.stock > 0 then
      insert into public.adega_movements(owner_id,product_id,name,type,quantity,price,cost)
      values(actor,product.id,product.name,'opening',product.stock,product.cost,product.cost);
    end if;
  elsif p_action in ('update_product','set_active','movement') then
    select * into product from public.adega_products where id = (p_payload->>'id')::uuid and owner_id = actor for update;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if p_action = 'update_product' then
      update public.adega_products set name=trim(p_payload->>'name'),brand=coalesce(trim(p_payload->>'brand'),''),
        code=coalesce(trim(p_payload->>'code'),''),category=p_payload->>'category',
        cost=(p_payload->>'cost')::numeric,price=(p_payload->>'price')::numeric,min=(p_payload->>'min')::integer
      where id=product.id and owner_id=actor;
    elsif p_action = 'set_active' then
      update public.adega_products set active=(p_payload->>'active')::boolean where id=product.id and owner_id=actor;
    else
      if not product.active then raise exception 'Este produto está inativo.'; end if;
      qty := (p_payload->>'quantity')::integer;
      unit := (p_payload->>'price')::numeric;
      movement_type := p_payload->>'type';
      if qty is null or qty <= 0 or unit is null or unit <= 0 or unit >= 10000000000 or movement_type is null or movement_type not in ('sale','purchase') then
        raise exception 'Quantidade ou preço inválidos.';
      end if;
      if movement_type='sale' and product.stock < qty then raise exception 'Estoque insuficiente. Atualize e confira o saldo disponível.'; end if;
      if movement_type='purchase' then
        update public.adega_products set cost=(stock*cost+qty*unit)/(stock+qty),stock=stock+qty where id=product.id and owner_id=actor;
      else
        update public.adega_products set stock=stock-qty where id=product.id and owner_id=actor;
      end if;
      insert into public.adega_movements(owner_id,product_id,name,type,quantity,price,cost,party,payment)
      values(actor,product.id,product.name,movement_type,qty,unit,product.cost,coalesce(p_payload->>'party',''),
        case when movement_type='sale' then coalesce(p_payload->>'payment','') else '' end);
    end if;
  else raise exception 'Operação inválida.';
  end if;
  insert into public.adega_commands(owner_id,request_id,action,payload) values(actor,p_request_id,p_action,p_payload);
  return public.adega_state();
end;
$$;

revoke all on function public.adega_state() from public, anon;
revoke all on function public.adega_command(text,jsonb,uuid) from public, anon;
grant execute on function public.adega_state() to authenticated;
grant execute on function public.adega_command(text,jsonb,uuid) to authenticated;

commit;
