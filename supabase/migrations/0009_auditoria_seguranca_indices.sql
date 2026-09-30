-- =============================================================================
-- 0009_auditoria_seguranca_indices.sql — correcções da auditoria de 30/09/2026
-- =============================================================================
-- 1. is_subscribed(criador, utilizador) respondia a qualquer pessoa, até sem
--    sessão, se o utilizador X subscreve o criador Y. Passa a responder só ao
--    próprio, ao criador em causa, ao admin e ao servidor (service_role).
-- 2. Funções SECURITY DEFINER deixam de poder ser chamadas sem sessão (anon),
--    excepto as que as políticas RLS usam e o Top 10, que é público. As funções
--    de trigger deixam de ser chamáveis pela API de todo.
-- 3. motivo_texto com search_path fixo.
-- 4. Índices nas chaves estrangeiras que a app filtra a toda a hora.
-- Idempotente.
-- =============================================================================

-- ------------------------------------------------------------------ 1
create or replace function public.is_subscribed(p_creator uuid, p_user uuid default auth.uid())
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select (p_user = auth.uid() or p_creator = auth.uid() or public.is_admin()
          or coalesce(auth.role(), '') = 'service_role')
     and exists (select 1 from subscriptions
                 where fan_id = p_user and creator_id = p_creator and status = 'active' and current_period_end > now())
$$;

-- ------------------------------------------------------------------ 3
create or replace function public.motivo_texto(p_code text, p_details text)
 returns text language sql immutable set search_path to 'public' as $$
  select case p_code
    when 'suspeito' then 'Comportamento suspeito'
    when 'multiplas_contas' then 'Múltiplas contas'
    when 'desrespeito' then 'Comportamento desrespeitoso'
    when 'perfil_falso' then 'Perfil falso'
    else 'Outra razão' end || ': ' || btrim(p_details)
$$;

-- ------------------------------------------------------------------ 2
-- Precisam de sessão: sem ela não fazem nada de útil, por isso nem se deixam chamar.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
      and p.proname not in (
        -- usadas pelas políticas RLS (têm de ser executáveis por quem consulta as tabelas)
        'is_admin', 'is_staff', 'is_thread_member', 'can_view_post', 'can_view_message', 'can_join_live',
        -- página pública
        'top_creators')
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
  end loop;

  -- Funções de trigger e internas: ninguém as chama pela API (os triggers continuam a
  -- disparar — a permissão é verificada ao criar o trigger, não a cada linha).
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and (p.prorettype = 'trigger'::regtype or p.proname in ('_banir', '_validar_alvo'))
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
  end loop;
end $$;

-- ------------------------------------------------------------------ 4
create index if not exists follows_creator_idx        on public.follows (creator_id);
create index if not exists subscriptions_creator_idx  on public.subscriptions (creator_id);
create index if not exists threads_creator_idx        on public.threads (creator_id);
create index if not exists lives_creator_idx          on public.lives (creator_id);
create index if not exists orders_creator_idx         on public.orders (creator_id);
create index if not exists payouts_user_idx           on public.payouts (user_id);
create index if not exists wallet_tx_user_idx         on public.wallet_tx (user_id, created_at desc);
create index if not exists kyc_requests_user_idx      on public.kyc_requests (user_id);
create index if not exists live_chat_live_idx         on public.live_chat (live_id, created_at);
create index if not exists post_likes_user_idx        on public.post_likes (user_id);
create index if not exists saves_user_idx             on public.saves (user_id);
create index if not exists ledger_order_idx           on public.ledger (order_id);
create index if not exists ban_requests_user_idx      on public.ban_requests (user_id);
create index if not exists profiles_referred_by_idx   on public.profiles (referred_by) where referred_by is not null;
