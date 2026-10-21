begin;
alter table public.adega_movements add column deleted_at timestamptz;

create or replace function public.adega_state() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'products',coalesce((select jsonb_agg((to_jsonb(p)-'owner_id'-'created_at'-'unit_image'-'pack_image')||jsonb_build_object('has_unit_image',p.unit_image<>'','has_pack_image',p.pack_image<>'') order by p.created_at,p.id) from public.adega_products p where p.owner_id=auth.uid() and p.deleted_at is null),'[]'::jsonb),
 'movements',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'productId',m.product_id,'name',m.name,'type',m.type,'quantity',m.quantity,'price',m.price,'cost',m.cost,'party',m.party,'payment',m.payment,'date',m.created_at,'cancelledAt',m.cancelled_at,'packCount',m.pack_count,'packUnits',m.pack_units,'packLabel',m.pack_label,'lineTotal',m.line_total) order by m.created_at,m.id) from public.adega_movements m where m.owner_id=auth.uid() and m.deleted_at is null),'[]'::jsonb));
$$;

create function public.adega_delete_movement(p_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); movement public.adega_movements%rowtype; product public.adega_products%rowtype; previous public.adega_commands%rowtype;
begin
 if actor is null or p_request_id is null then raise exception 'Autenticação obrigatória.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
 select * into previous from public.adega_commands where owner_id=actor and request_id=p_request_id;
 if found then
  if previous.action<>'delete_movement' or previous.payload<>jsonb_build_object('id',p_id) then raise exception 'Identificador de operação já utilizado.'; end if;
  return public.adega_state();
 end if;
 select * into movement from public.adega_movements where id=p_id and owner_id=actor and deleted_at is null for update;
 if not found then raise exception 'Movimentação não encontrada.'; end if;
 select * into product from public.adega_products where id=movement.product_id and owner_id=actor for update;
 if not found then raise exception 'Produto não encontrado.'; end if;
 if movement.cancelled_at is null then
  if movement.type='sale' then
   -- Same historical-cost reversal as cancelling a sale. Mark cancelled too so
   -- an older browser cannot restore the units again through cancel_sale.
   update public.adega_products set cost=(stock*cost+movement.quantity*movement.cost)/(stock+movement.quantity),stock=stock+movement.quantity where id=product.id and owner_id=actor;
   update public.adega_movements set cancelled_at=now() where id=p_id and owner_id=actor;
  else
   -- Reversing an old receipt after subsequent consumption changes historical
   -- costs. Require undoing later operations first instead of rewriting sales.
   if exists(select 1 from public.adega_movements m where m.owner_id=actor and m.product_id=product.id and m.id<>p_id and m.deleted_at is null and ((m.cancelled_at is null and (m.created_at,m.id)>(movement.created_at,movement.id)) or m.cancelled_at>movement.created_at)) then
    raise exception 'Esta entrada possui movimentações posteriores. Exclua primeiro as movimentações posteriores deste produto.';
   end if;
   if product.stock<movement.quantity then raise exception 'Estoque insuficiente para excluir esta entrada.'; end if;
   if abs(product.cost-((product.stock-movement.quantity)*movement.cost+coalesce(movement.line_total,movement.quantity*movement.price))/product.stock)>0.00001 then
    raise exception 'O custo deste produto foi alterado após esta entrada. Confira os custos antes de excluir.';
   end if;
   update public.adega_products set stock=stock-movement.quantity,cost=movement.cost where id=product.id and owner_id=actor;
  end if;
 end if;
 update public.adega_movements set deleted_at=now() where id=p_id and owner_id=actor;
 insert into public.adega_commands(owner_id,request_id,action,payload) values(actor,p_request_id,'delete_movement',jsonb_build_object('id',p_id));
 return public.adega_state();
end;
$$;
revoke all on function public.adega_delete_movement(uuid,uuid) from public,anon;
grant execute on function public.adega_delete_movement(uuid,uuid) to authenticated;
commit;
