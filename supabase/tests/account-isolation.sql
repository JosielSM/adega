-- Disposable identities and records exist only inside this transaction.
-- Run in the SQL Editor as postgres. No real user's data is changed.
begin;
select set_config('adega.test.a',gen_random_uuid()::text,true);
select set_config('adega.test.b',gen_random_uuid()::text,true);
insert into auth.users(id) values(current_setting('adega.test.a')::uuid),(current_setting('adega.test.b')::uuid);
set local role authenticated;
do $$
declare a uuid:=current_setting('adega.test.a')::uuid; b uuid:=current_setting('adega.test.b')::uuid;
  pa uuid; pb uuid; s jsonb; rejected boolean;
begin
  perform set_config('request.jwt.claim.sub',a::text,true);
  s:=public.adega_command('create_product',jsonb_build_object('name','ISOLAMENTO A','brand','','code','ISOLAMENTO','category','Vinhos','cost',10,'price',30,'stock',10,'min',2,'owner_id',b),gen_random_uuid());
  pa:=(s->'products'->0->>'id')::uuid;
  perform set_config('adega.test.product',pa::text,true);
  perform public.adega_command('movement',jsonb_build_object('id',pa,'type','sale','quantity',2,'price',30),gen_random_uuid());
  perform set_config('request.jwt.claim.sub',b::text,true);
  if public.adega_state()<>'{"products":[],"movements":[]}'::jsonb then raise exception 'Vazamento de dados no snapshot.';end if;
  if exists(select 1 from public.adega_products where id=pa) or exists(select 1 from public.adega_movements) then raise exception 'Vazamento de dados por acesso direto.';end if;
  rejected:=false;
  begin perform public.adega_command('set_active',jsonb_build_object('id',pa,'active',false),gen_random_uuid());
  exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception 'Alteração entre contas permitida.';end if;
  rejected:=false;
  begin perform public.adega_command('movement',jsonb_build_object('id',pa,'type','purchase','quantity',1,'price',10),gen_random_uuid());
  exception when raise_exception then rejected:=true;end;
  if not rejected then raise exception 'Movimentação entre contas permitida.';end if;
  s:=public.adega_command('create_product',jsonb_build_object('name','ISOLAMENTO B','brand','','code','ISOLAMENTO','category','Vinhos','cost',20,'price',50,'stock',3,'min',1,'owner_id',a),gen_random_uuid());
  pb:=(s->'products'->0->>'id')::uuid;
  if jsonb_array_length(s->'products')<>1 or jsonb_array_length(s->'movements')<>1 then raise exception 'Dados misturados entre contas.';end if;
  if s->'products'->0->>'name'<>'ISOLAMENTO B' then raise exception 'Proprietário informado pelo cliente foi aceito.';end if;
  rejected:=false;
  begin perform * from public.adega_commands;exception when insufficient_privilege then rejected:=true;end;
  if not rejected then raise exception 'Comandos internos expostos.';end if;
  perform set_config('request.jwt.claim.sub',a::text,true);
  s:=public.adega_state();
  if jsonb_array_length(s->'products')<>1 or (s->'products'->0->>'stock')::integer<>8 then raise exception 'Dados da primeira conta alterados.';end if;
end;$$;
reset role;
do $$begin
  begin
    insert into public.adega_movements(owner_id,product_id,name,type,quantity,price,cost)
    values(current_setting('adega.test.b')::uuid,current_setting('adega.test.product')::uuid,'invalido','sale',1,1,1);
    raise exception 'Banco aceitou produto de outra conta.';
  exception when foreign_key_violation then null;end;
  if has_function_privilege('anon','public.adega_state()','execute') or has_function_privilege('anon','public.adega_command(text,jsonb,uuid)','execute') then raise exception 'Acesso anônimo exposto.';end if;
end;$$;
rollback;
select 'OK: contas isoladas por RLS, funções e integridade. Testes revertidos.' as resultado;
