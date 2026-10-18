begin;
create table public.adega_profiles (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null default '' check (length(company_name) <= 80),
  logo text not null default '' check (length(logo) <= 65536 and (logo = '' or logo ~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$'))
);
alter table public.adega_profiles enable row level security;
revoke all on public.adega_profiles from public, anon, authenticated;
grant select, insert, update on public.adega_profiles to authenticated;
create policy profiles_own on public.adega_profiles for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create function public.adega_profile_get() returns jsonb
language sql stable security invoker set search_path = '' as $$
 select coalesce((select jsonb_build_object('companyName',company_name,'logo',logo)
 from public.adega_profiles where owner_id = auth.uid()), jsonb_build_object('companyName','','logo',''));
$$;
create function public.adega_profile_save(p_name text, p_logo text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Autenticação obrigatória.'; end if;
 insert into public.adega_profiles(owner_id,company_name,logo) values(auth.uid(),trim(p_name),p_logo)
 on conflict(owner_id) do update set company_name=excluded.company_name,logo=excluded.logo;
 return public.adega_profile_get();
end;
$$;
revoke all on function public.adega_profile_get(), public.adega_profile_save(text,text) from public, anon;
grant execute on function public.adega_profile_get(), public.adega_profile_save(text,text) to authenticated;
commit;
