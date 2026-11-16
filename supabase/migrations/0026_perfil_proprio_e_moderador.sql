-- Revisão de segurança de 16/11/2026 (pedido do dono), 1.ª parte. Só acrescenta; não esconde nada ainda.
--
-- 1) meu_perfil(): a linha completa do próprio perfil (saldo, ganhos, nascimento…).
--    Prepara a 0027, que deixa de mostrar essas colunas dos perfis dos outros.
-- 2) admin_nascimentos(ids): datas de nascimento para a fila de verificação de identidade
--    (só equipa). A fila deixa de as ler directamente da tabela.
-- 3) admin_resolve_report: um moderador podia suspender qualquer criador ao fechar uma
--    denúncia (até uma feita por ele próprio). Agora suspender um perfil é só do admin;
--    o moderador continua a poder esconder publicações, apagar mensagens e terminar lives.

create or replace function public.meu_perfil()
returns setof public.profiles
language sql stable security definer set search_path = public, pg_temp
as $$ select * from public.profiles where id = auth.uid() $$;
revoke all on function public.meu_perfil() from public, anon;
grant execute on function public.meu_perfil() to authenticated;

create or replace function public.admin_nascimentos(p_users uuid[])
returns table (id uuid, birthdate date)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  if not is_staff() then raise exception 'Sem permissão.'; end if;
  return query select p.id, p.birthdate from public.profiles p where p.id = any(p_users);
end $$;
revoke all on function public.admin_nascimentos(uuid[]) from public, anon;
grant execute on function public.admin_nascimentos(uuid[]) to authenticated;

create or replace function public.admin_resolve_report(p_report uuid, p_remove boolean)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare r reports;
begin
  if not is_staff() then raise exception 'Sem permissão.'; end if;
  select * into r from reports where id = p_report for update;
  if r.id is null then raise exception 'Denúncia não encontrada.'; end if;
  if p_remove and r.target_type = 'creator' and not is_admin() then
    raise exception 'Só o admin pode suspender perfis. Pede o banimento ao admin.';
  end if;
  update reports set status = case when p_remove then 'removed' else 'kept' end, resolved_by = auth.uid(), resolved_at = now() where id = p_report;
  if p_remove then
    if r.target_type = 'post' then update posts set status = 'hidden' where id = r.target_id;
    elsif r.target_type = 'creator' then update creators set status = 'suspended' where id = r.target_id;
    elsif r.target_type = 'message' then delete from messages where id = r.target_id;
    elsif r.target_type = 'live' then update lives set status = 'ended' where id = r.target_id;
    end if;
  end if;
end $function$;

-- 4) complete_profile podia ser chamada outra vez depois do registo, para trocar o nome de
--    utilizador ou a data de nascimento (a idade é verificada só aqui). Depois de o perfil
--    estar completo, essas duas ficam fixas; repetir o mesmo pedido continua a funcionar.
create or replace function public.complete_profile(p_handle text, p_name text, p_birthdate date, p_interests text[], p_country text default 'Angola'::text, p_ref text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
 if auth.uid() is null then raise exception 'Sessão expirada.'; end if;
 if exists (select 1 from profiles where id = auth.uid() and onboarded
            and (handle::text is distinct from p_handle or birthdate is distinct from p_birthdate)) then
 raise exception 'O teu perfil já está completo. O nome de utilizador e a data de nascimento não se mudam por aqui.';
 end if;
 if p_birthdate is null or p_birthdate > (current_date - interval '18 years') then
 raise exception 'A plataforma só está disponível para maiores de 18 anos.';
 end if;
 if p_handle !~ '^[a-zA-Z0-9._]{3,20}$' then raise exception 'Nome de utilizador inválido.'; end if;
 if exists (select 1 from profiles where handle = p_handle and id <> auth.uid()) then
 raise exception 'Esse nome de utilizador já existe.';
 end if;
 update profiles set handle = p_handle, name = left(p_name, 60), birthdate = p_birthdate,
 interests = coalesce(p_interests, '{}'), country = coalesce(p_country, country), onboarded = true
 where id = auth.uid();
 -- código de afiliado (também para quem entrou pelo Google)
 if nullif(p_ref,'') is not null then
 update profiles set referred_by = (select id from profiles where handle = p_ref and id <> auth.uid())
 where id = auth.uid() and referred_by is null;
 end if;
end $function$;
