begin;
alter table public.adega_movements add column cancelled_at timestamptz;
create or replace function public.adega_state() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'products',coalesce((select jsonb_agg(to_jsonb(p)-'owner_id'-'created_at' order by p.created_at,p.id) from public.adega_products p where p.owner_id=auth.uid()),'[]'::jsonb),
 'movements',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'productId',m.product_id,'name',m.name,'type',m.type,'quantity',m.quantity,'price',m.price,'cost',m.cost,'party',m.party,'payment',m.payment,'date',m.created_at,'cancelledAt',m.cancelled_at) order by m.created_at,m.id) from public.adega_movements m where m.owner_id=auth.uid()),'[]'::jsonb));
$$;
create function public.adega_cancel_sale(p_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); sale public.adega_movements%rowtype; previous public.adega_commands%rowtype;
begin
 if actor is null or p_request_id is null then raise exception 'Autenticação obrigatória.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
 select * into previous from public.adega_commands where owner_id=actor and request_id=p_request_id;
 if found then
  if previous.action<>'cancel_sale' or previous.payload<>jsonb_build_object('id',p_id) then raise exception 'Identificador de operação já utilizado.'; end if;
  return public.adega_state();
 end if;
 select * into sale from public.adega_movements where id=p_id and owner_id=actor for update;
 if not found then raise exception 'Venda não encontrada.'; end if;
 if sale.type<>'sale' then raise exception 'Somente vendas podem ser canceladas.'; end if;
 if sale.cancelled_at is not null then raise exception 'Esta venda já foi cancelada.'; end if;
 update public.adega_products set cost=(stock*cost+sale.quantity*sale.cost)/(stock+sale.quantity),stock=stock+sale.quantity
 where id=sale.product_id and owner_id=actor;
 update public.adega_movements set cancelled_at=now() where id=p_id and owner_id=actor;
 insert into public.adega_commands(owner_id,request_id,action,payload) values(actor,p_request_id,'cancel_sale',jsonb_build_object('id',p_id));
 return public.adega_state();
end;
$$;
revoke all on function public.adega_cancel_sale(uuid,uuid) from public,anon;
grant execute on function public.adega_cancel_sale(uuid,uuid) to authenticated;
commit;
