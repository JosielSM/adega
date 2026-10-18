begin;
create table public.adega_catalogs (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 slug uuid not null unique default gen_random_uuid(),
 enabled boolean not null default false
);
alter table public.adega_catalogs enable row level security;
revoke all on public.adega_catalogs from public,anon,authenticated;
grant select,insert,update on public.adega_catalogs to authenticated;
create policy catalogs_own on public.adega_catalogs for all to authenticated
 using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create function public.adega_catalog_settings() returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object('slug',slug,'enabled',enabled) from public.adega_catalogs where owner_id=auth.uid()),jsonb_build_object('slug',null,'enabled',false));
$$;
create function public.adega_catalog_configure(p_enabled boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or p_enabled is null then raise exception 'Autenticação obrigatória.'; end if;
 insert into public.adega_catalogs(owner_id,enabled) values(auth.uid(),p_enabled)
 on conflict(owner_id) do update set enabled=excluded.enabled;
 return public.adega_catalog_settings();
end;
$$;
-- Deliberately exposes only the explicitly published sales catalog. Never use
-- the private stock/state functions for public visitors.
create function public.adega_public_catalog(p_slug uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',coalesce(nullif(p.company_name,''),'Adega'),'logo',coalesce(p.logo,''),
 'products',coalesce((select jsonb_agg(jsonb_build_object('name',b.name,'brand',b.brand,'category',b.category,'price',b.price) order by b.category,b.name)
 from public.adega_products b where b.owner_id=c.owner_id and b.active and b.stock>0),'[]'::jsonb))
 from public.adega_catalogs c left join public.adega_profiles p on p.owner_id=c.owner_id
 where c.slug=p_slug and c.enabled;
$$;
revoke all on function public.adega_catalog_settings(),public.adega_catalog_configure(boolean),public.adega_public_catalog(uuid) from public,anon,authenticated;
grant execute on function public.adega_catalog_settings(),public.adega_catalog_configure(boolean) to authenticated;
grant execute on function public.adega_public_catalog(uuid) to anon,authenticated;
commit;
