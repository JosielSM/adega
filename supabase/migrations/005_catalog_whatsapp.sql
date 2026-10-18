begin;
alter table public.adega_catalogs add column whatsapp text not null default ''
 check(whatsapp='' or whatsapp ~ '^55[0-9]{10,11}$');
create or replace function public.adega_catalog_settings() returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object('slug',slug,'enabled',enabled,'whatsapp',whatsapp) from public.adega_catalogs where owner_id=auth.uid()),jsonb_build_object('slug',null,'enabled',false,'whatsapp',''));
$$;
create function public.adega_catalog_contact(p_whatsapp text) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
 insert into public.adega_catalogs(owner_id,whatsapp) values(auth.uid(),p_whatsapp)
 on conflict(owner_id) do update set whatsapp=excluded.whatsapp;
 return public.adega_catalog_settings();
end;
$$;
revoke all on function public.adega_catalog_contact(text) from public,anon;
grant execute on function public.adega_catalog_contact(text) to authenticated;
create or replace function public.adega_public_catalog(p_slug uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',coalesce(nullif(p.company_name,''),'Adega'),'logo',coalesce(p.logo,''),'whatsapp',c.whatsapp,
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'brand',b.brand,'category',b.category,'price',b.price) order by b.category,b.name)
 from public.adega_products b where b.owner_id=c.owner_id and b.active and b.stock>0),'[]'::jsonb))
 from public.adega_catalogs c left join public.adega_profiles p on p.owner_id=c.owner_id
 where c.slug=p_slug and c.enabled;
$$;
commit;
