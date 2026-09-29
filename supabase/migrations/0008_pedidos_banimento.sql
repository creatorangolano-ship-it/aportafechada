-- =============================================================================
-- 0008_pedidos_banimento.sql — 3 advertências = banimento; moderadores pedem, admin decide
-- =============================================================================
-- 1. Motivos fixos (código) + explicação escrita, em advertências, banimentos e pedidos:
--      suspeito · multiplas_contas · desrespeito · perfil_falso · outro
-- 2. À 3.ª advertência a conta é banida automaticamente, de forma permanente (só o
--    admin a pode reactivar).
-- 3. Moderadores não banem: criam um pedido (public.ban_requests), que avisa todos
--    os admins. O admin decide — banir (com a duração que escolher) ou rejeitar — e
--    quem pediu é avisado da decisão.
-- Idempotente.
-- =============================================================================

alter table public.warnings add column if not exists reason_code text;
alter table public.bans add column if not exists reason_code text;

create table if not exists public.ban_requests (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  reason_code   text not null check (reason_code in ('suspeito','multiplas_contas','desrespeito','perfil_falso','outro')),
  details       text not null check (char_length(details) between 5 and 300),
  requested_by  uuid references public.profiles(id) on delete set null,
  status        text not null default 'open' check (status in ('open','approved','rejected')),
  decided_by    uuid references public.profiles(id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now()
);
create index if not exists ban_requests_open_idx on public.ban_requests (status, created_at);
alter table public.ban_requests enable row level security;
drop policy if exists ban_requests_read on public.ban_requests;
create policy ban_requests_read on public.ban_requests for select using (public.is_staff());

-- Texto legível de um motivo.
create or replace function public.motivo_texto(p_code text, p_details text)
 returns text language sql immutable as $$
  select case p_code
    when 'suspeito' then 'Comportamento suspeito'
    when 'multiplas_contas' then 'Múltiplas contas'
    when 'desrespeito' then 'Comportamento desrespeitoso'
    when 'perfil_falso' then 'Perfil falso'
    else 'Outra razão' end || ': ' || btrim(p_details)
$$;

-- Banimento em si (sem verificação de permissões — só é chamado pelas funções abaixo).
create or replace function public._banir(p_user uuid, p_code text, p_reason text, p_until timestamptz, p_by uuid)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update profiles set banned_at = now(), banned_until = p_until where id = p_user;
  if not found then raise exception 'Conta não encontrada.'; end if;
  insert into bans (user_id, reason, reason_code, until, created_by) values (p_user, p_reason, p_code, p_until, p_by)
    on conflict (user_id) do update set reason = excluded.reason, reason_code = excluded.reason_code, until = excluded.until,
      created_by = excluded.created_by, created_at = now();
  update auth.users set banned_until = coalesce(p_until, 'infinity'::timestamptz) where id = p_user;
  delete from auth.sessions where user_id = p_user;
  update creators set status = 'suspended' where id = p_user and status = 'approved';
  -- Pedidos de banimento abertos sobre esta conta ficam resolvidos.
  update ban_requests set status = 'approved', decided_by = p_by, decided_at = now(),
    decision_note = coalesce(decision_note, 'Conta banida.') where user_id = p_user and status = 'open';
end $$;
revoke all on function public._banir(uuid, text, text, timestamptz, uuid) from public, anon, authenticated;

create or replace function public._validar_alvo(p_user uuid, p_code text, p_details text)
 returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if p_user = auth.uid() then raise exception 'Não podes fazer isto à tua própria conta.'; end if;
  if exists (select 1 from profiles where id = p_user and is_owner) then raise exception 'O perfil principal não pode ser banido nem advertido.'; end if;
  if p_code not in ('suspeito','multiplas_contas','desrespeito','perfil_falso','outro') then raise exception 'Escolhe o motivo.'; end if;
  if char_length(coalesce(btrim(p_details), '')) < 5 then raise exception 'Explica o motivo (pelo menos 5 caracteres).'; end if;
end $$;
revoke all on function public._validar_alvo(uuid, text, text) from public, anon, authenticated;

-- Banir (admin). Substitui a versão de 0007 (que não tinha código de motivo).
drop function if exists public.admin_ban_user(uuid, text, integer);
create or replace function public.admin_ban_user(p_user uuid, p_code text, p_details text, p_days integer default null)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'Sem permissão.'; end if;
  perform public._validar_alvo(p_user, p_code, p_details);
  if p_days is not null and p_days not in (1, 7, 30, 90) then raise exception 'Duração inválida.'; end if;
  perform public._banir(p_user, p_code, public.motivo_texto(p_code, p_details),
    case when p_days is null then null else now() + make_interval(days => p_days) end, auth.uid());
end $$;

-- Advertir (admin). À 3.ª advertência, banimento permanente automático.
-- Devolve true quando a advertência baniu a conta.
drop function if exists public.admin_warn_user(uuid, text);
create or replace function public.admin_warn_user(p_user uuid, p_code text, p_details text)
 returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_txt text; v_total int;
begin
  if not public.is_admin() then raise exception 'Sem permissão.'; end if;
  perform public._validar_alvo(p_user, p_code, p_details);
  v_txt := public.motivo_texto(p_code, p_details);
  insert into warnings (user_id, reason, reason_code, created_by) values (p_user, v_txt, p_code, auth.uid());
  select count(*) into v_total from warnings where user_id = p_user;
  if v_total >= 3 and not exists (select 1 from profiles where id = p_user and banned_at is not null
                                  and (banned_until is null or banned_until > now())) then
    perform public._banir(p_user, p_code, '3 advertências — ' || v_txt, null, auth.uid());
    return true;
  end if;
  insert into notifications (user_id, text, link)
    values (p_user, 'Recebeste uma advertência (' || v_total || ' de 3) — ' || v_txt || '. À 3.ª a conta é banida.', 'conta');
  return false;
end $$;

-- Moderador (ou admin) pede um banimento: alerta para os admins.
create or replace function public.mod_request_ban(p_user uuid, p_code text, p_details text)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare v_handle text; v_quem text;
begin
  if not public.is_staff() then raise exception 'Sem permissão.'; end if;
  perform public._validar_alvo(p_user, p_code, p_details);
  if exists (select 1 from ban_requests where user_id = p_user and status = 'open') then
    raise exception 'Já há um pedido de banimento aberto para esta conta.';
  end if;
  insert into ban_requests (user_id, reason_code, details, requested_by) values (p_user, p_code, btrim(p_details), auth.uid());
  select handle into v_handle from profiles where id = p_user;
  select handle into v_quem from profiles where id = auth.uid();
  insert into notifications (user_id, text, link)
    select id, 'Pedido de banimento de @' || v_handle || ' (por @' || v_quem || '): ' || public.motivo_texto(p_code, p_details), 'admin'
    from profiles where role = 'admin';
end $$;

-- Admin decide um pedido: banir (com duração) ou rejeitar. Quem pediu é avisado.
create or replace function public.admin_decide_ban_request(p_request bigint, p_approve boolean, p_days integer default null, p_note text default null)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare r ban_requests; v_handle text;
begin
  if not public.is_admin() then raise exception 'Sem permissão.'; end if;
  select * into r from ban_requests where id = p_request for update;
  if not found or r.status <> 'open' then raise exception 'Este pedido já foi decidido.'; end if;
  select handle into v_handle from profiles where id = r.user_id;
  if p_approve then
    if exists (select 1 from profiles where id = r.user_id and is_owner) then raise exception 'O perfil principal não pode ser banido.'; end if;
    if p_days is not null and p_days not in (1, 7, 30, 90) then raise exception 'Duração inválida.'; end if;
    perform public._banir(r.user_id, r.reason_code, public.motivo_texto(r.reason_code, r.details),
      case when p_days is null then null else now() + make_interval(days => p_days) end, auth.uid());
  end if;
  update ban_requests set status = case when p_approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(coalesce(p_note, '')), '')
    where id = p_request;
  if r.requested_by is not null then
    insert into notifications (user_id, text, link) values (r.requested_by,
      case when p_approve then 'O teu pedido de banimento de @' || v_handle || ' foi aprovado: a conta foi banida.'
           else 'O teu pedido de banimento de @' || v_handle || ' foi rejeitado' || coalesce(': ' || nullif(btrim(coalesce(p_note, '')), ''), '.') end,
      'admin');
  end if;
end $$;

-- Lista de pedidos (equipa).
create or replace function public.admin_ban_requests(p_status text default 'open')
 returns table(id bigint, user_id uuid, handle text, name text, role text, reason_code text, details text, status text,
               requested_by_handle text, created_at timestamptz, decided_by_handle text, decided_at timestamptz,
               decision_note text, warnings_count bigint)
 language sql stable security definer set search_path to 'public' as $$
  select r.id, r.user_id, p.handle::text, p.name, p.role, r.reason_code, r.details, r.status,
         q.handle::text, r.created_at, d.handle::text, r.decided_at, r.decision_note,
         (select count(*) from warnings w where w.user_id = r.user_id)
  from ban_requests r
  join profiles p on p.id = r.user_id
  left join profiles q on q.id = r.requested_by
  left join profiles d on d.id = r.decided_by
  where public.is_staff() and (p_status = 'all' or r.status = p_status)
  order by case when r.status = 'open' then 0 else 1 end, case when r.status = 'open' then r.created_at end asc, r.created_at desc
  limit 200
$$;

revoke all on function public.admin_ban_user(uuid, text, text, integer) from public, anon;
revoke all on function public.admin_warn_user(uuid, text, text) from public, anon;
revoke all on function public.mod_request_ban(uuid, text, text) from public, anon;
revoke all on function public.admin_decide_ban_request(bigint, boolean, integer, text) from public, anon;
revoke all on function public.admin_ban_requests(text) from public, anon;
grant execute on function public.admin_ban_user(uuid, text, text, integer) to authenticated;
grant execute on function public.admin_warn_user(uuid, text, text) to authenticated;
grant execute on function public.mod_request_ban(uuid, text, text) to authenticated;
grant execute on function public.admin_decide_ban_request(bigint, boolean, integer, text) to authenticated;
grant execute on function public.admin_ban_requests(text) to authenticated;
