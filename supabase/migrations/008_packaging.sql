begin;
alter table public.adega_products add column pack_size integer not null default 1 check(pack_size between 1 and 10000), add column pack_price numeric(14,2) check(pack_price>0 and pack_price<10000000000),add column pack_name text not null default 'Caixa' check(length(pack_name) between 1 and 40);
alter table public.adega_movements add column pack_count integer,add column pack_units integer,add column pack_label text,add column line_total numeric(18,2);
create or replace function public.adega_state() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'products',coalesce((select jsonb_agg(to_jsonb(p)-'owner_id'-'created_at' order by p.created_at,p.id) from public.adega_products p where p.owner_id=auth.uid()),'[]'::jsonb),
 'movements',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'productId',m.product_id,'name',m.name,'type',m.type,'quantity',m.quantity,'price',m.price,'cost',m.cost,'party',m.party,'payment',m.payment,'date',m.created_at,'cancelledAt',m.cancelled_at,'packCount',m.pack_count,'packUnits',m.pack_units,'packLabel',m.pack_label,'lineTotal',m.line_total) order by m.created_at,m.id) from public.adega_movements m where m.owner_id=auth.uid()),'[]'::jsonb));
$$;

create or replace function public.adega_command(p_action text, p_payload jsonb, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  product public.adega_products%rowtype;
  previous public.adega_commands%rowtype;
  qty integer;
  unit numeric;
  movement_type text;
  factor integer;
  amount integer;
  packaging integer;
  box_price numeric;
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

  packaging:=coalesce((p_payload->>'pack_size')::integer,1);
  box_price:=nullif(p_payload->>'pack_price','')::numeric;
  if packaging<1 or packaging>10000 or (box_price is not null and (box_price<=0 or box_price>=10000000000)) then raise exception 'Embalagem ou preço inválido.'; end if;
  if p_action = 'create_product' then
    insert into public.adega_products(owner_id,name,brand,code,category,cost,price,stock,min,pack_size,pack_price,pack_name)
    values(actor,trim(p_payload->>'name'),coalesce(trim(p_payload->>'brand'),''),coalesce(trim(p_payload->>'code'),''),
      p_payload->>'category',(p_payload->>'cost')::numeric,(p_payload->>'price')::numeric,
      (p_payload->>'stock')::integer * case when p_payload->>'stock_mode'='pack' then packaging else 1 end,(p_payload->>'min')::integer,packaging,box_price,coalesce(nullif(trim(p_payload->>'pack_name'),''),'Caixa'))
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
        cost=(p_payload->>'cost')::numeric,price=(p_payload->>'price')::numeric,min=(p_payload->>'min')::integer,pack_size=case when p_payload?'pack_size' then packaging else product.pack_size end,pack_price=case when p_payload?'pack_price' then box_price else product.pack_price end,pack_name=case when p_payload?'pack_name' then coalesce(nullif(trim(p_payload->>'pack_name'),''),'Caixa') else product.pack_name end
      where id=product.id and owner_id=actor;
    elsif p_action = 'set_active' then
      update public.adega_products set active=(p_payload->>'active')::boolean where id=product.id and owner_id=actor;
    else
      if not product.active then raise exception 'Este produto está inativo.'; end if;
      if coalesce(p_payload->>'mode','unit') not in ('unit','pack') then raise exception 'Forma de movimentação inválida.'; end if;
      factor:=case when p_payload->>'mode'='pack' then product.pack_size else 1 end;
      if p_payload->>'mode'='pack' and factor<=1 then raise exception 'Configure as unidades por embalagem.'; end if;
      amount := (p_payload->>'quantity')::integer;
      qty := amount*factor;
      unit := (p_payload->>'price')::numeric;
      movement_type := p_payload->>'type';
      if qty is null or qty <= 0 or unit is null or unit <= 0 or unit >= 10000000000 or movement_type is null or movement_type not in ('sale','purchase') then
        raise exception 'Quantidade ou preço inválidos.';
      end if;
      if movement_type='sale' and product.stock < qty then raise exception 'Estoque insuficiente. Atualize e confira o saldo disponível.'; end if;
      if movement_type='purchase' then
        update public.adega_products set cost=(stock*cost+amount*unit)/(stock+qty),stock=stock+qty where id=product.id and owner_id=actor;
      else
        update public.adega_products set stock=stock-qty where id=product.id and owner_id=actor;
      end if;
      insert into public.adega_movements(owner_id,product_id,name,type,quantity,price,cost,party,payment,pack_count,pack_units,pack_label,line_total)
      values(actor,product.id,product.name,movement_type,qty,unit/factor,product.cost,coalesce(p_payload->>'party',''),
        case when movement_type='sale' then coalesce(p_payload->>'payment','') else '' end,amount,factor,case when factor>1 then product.pack_name else 'Unidade' end,amount*unit);
    end if;
  else raise exception 'Operação inválida.';
  end if;
  insert into public.adega_commands(owner_id,request_id,action,payload) values(actor,p_request_id,p_action,p_payload);
  return public.adega_state();
end;
$$;


create or replace function public.adega_public_catalog(p_slug uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',coalesce(nullif(p.company_name,''),'Adega'),'logo',coalesce(p.logo,''),'whatsapp',c.whatsapp,
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'brand',b.brand,'category',b.category,'price',b.price,'packSize',b.pack_size,'packPrice',b.pack_price,'packName',b.pack_name,'availableUnits',b.stock,'availablePacks',b.stock/b.pack_size) order by b.category,b.name)
 from public.adega_products b where b.owner_id=c.owner_id and b.active and b.stock>0),'[]'::jsonb))
 from public.adega_catalogs c left join public.adega_profiles p on p.owner_id=c.owner_id
 where c.slug=p_slug and c.enabled;
$$;

commit;
