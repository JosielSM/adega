begin;
create function public.adega_delete_product(p_id uuid,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); previous public.adega_commands%rowtype;
begin
 if actor is null or p_request_id is null then raise exception 'Autenticação obrigatória.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,0));
 select * into previous from public.adega_commands where owner_id=actor and request_id=p_request_id;
 if found then
  if previous.action<>'delete_product' or previous.payload<>jsonb_build_object('id',p_id) then raise exception 'Identificador de operação já utilizado.'; end if;
  return public.adega_state();
 end if;
 if not exists(select 1 from public.adega_products where id=p_id and owner_id=actor) then raise exception 'Produto não encontrado.'; end if;
 if exists(select 1 from public.adega_movements where product_id=p_id and owner_id=actor) then raise exception 'Este produto possui movimentações. Inative-o para preservar o histórico.'; end if;
 delete from public.adega_products where id=p_id and owner_id=actor;
 insert into public.adega_commands(owner_id,request_id,action,payload) values(actor,p_request_id,'delete_product',jsonb_build_object('id',p_id));
 return public.adega_state();
end;
$$;
revoke all on function public.adega_delete_product(uuid,uuid) from public,anon;
grant execute on function public.adega_delete_product(uuid,uuid) to authenticated;
commit;
