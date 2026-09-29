-- =============================================================================
-- 0007_moderacao_contas.sql — banir e advertir contas, perfil principal, seguir fãs
-- =============================================================================
-- 1. Perfil principal (is_owner): a conta dona da plataforma. Nenhum admin a pode
--    banir, advertir, nem mudar-lhe o papel. Só pode haver um.
-- 2. Banimento de qualquer conta (fã, criador, moderador, admin), temporário ou
--    permanente. O estado fica em profiles (público: serve para esconder perfis
--    banidos); o MOTIVO fica em public.bans, que só a equipa e a própria pessoa
--    lêem. O banimento vale também no Supabase Auth (auth.users.banned_until):
--    a pessoa deixa de conseguir entrar ou renovar a sessão.
-- 3. Advertências (public.warnings): registo + notificação à pessoa.
-- 4. Seguir fãs: follows.creator_id passa a apontar para qualquer perfil (o nome
--    da coluna mantém-se por compatibilidade: é «o perfil seguido»), e profiles
--    ganha follower_count.
--
-- Só o admin completo bane e adverte (is_admin()). Idempotente.
-- =============================================================================

-- ---------------------------------------------------------------- 1 e 2: colunas
alter table public.profiles add column if not exists is_owner boolean not null default false;
alter table public.profiles add column if not exists banned_at timestamptz;
alter table public.profiles add column if not exists banned_until timestamptz;
alter table public.profiles add column if not exists follower_count integer not null default 0;
create unique index if not exists profiles_um_so_dono on public.profiles (is_owner) where is_owner;
-- (Os utilizadores só podem alterar as colunas com permissão explícita — nome, avatar,
--  país, interesses, notificações. Estas colunas novas ficam de fora.)

create table if not exists public.bans (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  reason     text not null check (char_length(reason) between 5 and 300),
  until      timestamptz,                         -- null = permanente
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.bans enable row level security;
drop policy if exists bans_read on public.bans;
create policy bans_read on public.bans for select using (user_id = auth.uid() or public.is_staff());

-- ---------------------------------------------------------------- 3: advertências
create table if not exists public.warnings (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  reason     text not null check (char_length(reason) between 5 and 300),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists warnings_user_idx on public.warnings (user_id, created_at desc);
alter table public.warnings enable row level security;
drop policy if exists warnings_read on public.warnings;
create policy warnings_read on public.warnings for select using (user_id = auth.uid() or public.is_staff());
-- Sem políticas de escrita: só as funções abaixo (SECURITY DEFINER) escrevem.

-- ---------------------------------------------------------------- 4: seguir fãs
do $$
begin
  if exists (select 1 from pg_constraint c where c.conname = 'follows_creator_id_fkey'
             and c.confrelid = 'public.creators'::regclass) then
    alter table public.follows drop constraint follows_creator_id_fkey;
    alter table public.follows add constraint follows_creator_id_fkey
      foreign key (creator_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

create or replace function public.bump_follow()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    update creators set follower_count = follower_count + 1 where id = new.creator_id;
    update profiles set follower_count = follower_count + 1 where id = new.creator_id;
  else
    update creators set follower_count = greatest(follower_count - 1, 0) where id = old.creator_id;
    update profiles set follower_count = greatest(follower_count - 1, 0) where id = old.creator_id;
  end if;
  return null;
end $$;

update public.profiles p set follower_count = coalesce((select count(*) from public.follows f where f.creator_id = p.id), 0);

-- ---------------------------------------------------------------- funções
create or replace function public.admin_ban_user(p_user uuid, p_reason text, p_days integer default null)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare v_until timestamptz;
begin
  if not public.is_admin() then raise exception 'Sem permissão.'; end if;
  if p_user = auth.uid() then raise exception 'Não podes banir a tua própria conta.'; end if;
  if exists (select 1 from profiles where id = p_user and is_owner) then raise exception 'O perfil principal não pode ser banido.'; end if;
  if char_length(coalesce(btrim(p_reason), '')) < 5 then raise exception 'Escreve o motivo do banimento.'; end if;
  if p_days is not null and p_days not in (1, 7, 30, 90) then raise exception 'Duração inválida.'; end if;
  v_until := case when p_days is null then null else now() + make_interval(days => p_days) end;

  update profiles set banned_at = now(), banned_until = v_until where id = p_user;
  if not found then raise exception 'Conta não encontrada.'; end if;
  insert into bans (user_id, reason, until, created_by) values (p_user, btrim(p_reason), v_until, auth.uid())
    on conflict (user_id) do update set reason = excluded.reason, until = excluded.until, created_by = excluded.created_by, created_at = now();
  -- Impede entrar e renovar a sessão; as sessões abertas caem na próxima renovação.
  update auth.users set banned_until = coalesce(v_until, 'infinity'::timestamptz) where id = p_user;
  delete from auth.sessions where user_id = p_user;
  -- Um criador banido deixa de aparecer e de receber subscrições.
  update creators set status = 'suspended' where id = p_user and status = 'approved';
end $$;

create or replace function public.admin_unban_user(p_user uuid)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'Sem permissão.'; end if;
  update profiles set banned_at = null, banned_until = null where id = p_user;
  delete from bans where user_id = p_user;
  update auth.users set banned_until = null where id = p_user;
  insert into notifications (user_id, text, link) values (p_user, 'A tua conta foi reactivada.', 'conta');
end $$;

create or replace function public.admin_warn_user(p_user uuid, p_reason text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'Sem permissão.'; end if;
  if p_user = auth.uid() then raise exception 'Não podes advertir a tua própria conta.'; end if;
  if exists (select 1 from profiles where id = p_user and is_owner) then raise exception 'O perfil principal não pode ser advertido.'; end if;
  if char_length(coalesce(btrim(p_reason), '')) < 5 then raise exception 'Escreve o motivo da advertência.'; end if;
  insert into warnings (user_id, reason, created_by) values (p_user, btrim(p_reason), auth.uid());
  insert into notifications (user_id, text, link) values (p_user, 'Recebeste uma advertência da equipa: ' || btrim(p_reason), 'conta');
end $$;

-- Papéis: ninguém muda o próprio, e o do perfil principal não se muda.
create or replace function public.admin_set_role(p_user uuid, p_role text)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_admin() then raise exception 'Sem permissão.'; end if;
  if p_role not in ('fan','creator','admin','moderator') then raise exception 'Papel inválido.'; end if;
  if p_user = auth.uid() then raise exception 'Não podes mudar o teu próprio papel.'; end if;
  if exists (select 1 from profiles where id = p_user and is_owner) then raise exception 'O papel do perfil principal não pode ser alterado.'; end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

-- A lista de utilizadores passa a trazer o estado de moderação.
drop function if exists public.admin_users(text);
create function public.admin_users(p_search text default null)
 returns table(id uuid, handle text, name text, email text, role text, country text, created_at timestamptz,
               is_creator boolean, creator_status text, creator_price integer, wallet_balance bigint, earnings_balance bigint,
               is_owner boolean, banned_at timestamptz, banned_until timestamptz, ban_reason text, warnings_count bigint)
 language sql stable security definer set search_path to 'public' as $$
  select p.id, p.handle::text, p.name, u.email::text, p.role, p.country, p.created_at,
         (c.id is not null), c.status, c.price,
         case when public.is_admin() then p.wallet_balance else null end,
         case when public.is_admin() then p.earnings_balance else null end,
         p.is_owner,
         case when p.banned_at is not null and (p.banned_until is null or p.banned_until > now()) then p.banned_at end,
         p.banned_until, b.reason,
         (select count(*) from warnings w where w.user_id = p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.creators c on c.id = p.id
  left join public.bans b on b.user_id = p.id
  where public.is_staff()
    and (p_search is null or btrim(p_search) = ''
         or p.handle ilike '%'||p_search||'%' or p.name ilike '%'||p_search||'%' or u.email ilike '%'||p_search||'%')
  order by p.is_owner desc, p.created_at desc
  limit 300
$$;

revoke all on function public.admin_ban_user(uuid, text, integer) from public, anon;
revoke all on function public.admin_unban_user(uuid) from public, anon;
revoke all on function public.admin_warn_user(uuid, text) from public, anon;
revoke all on function public.admin_users(text) from public, anon;
grant execute on function public.admin_ban_user(uuid, text, integer) to authenticated;
grant execute on function public.admin_unban_user(uuid) to authenticated;
grant execute on function public.admin_warn_user(uuid, text) to authenticated;
grant execute on function public.admin_users(text) to authenticated;
