-- =============================================================================
-- 0004_guardas.sql — lacuna 1: admin_users e admin_threads
-- =============================================================================
-- VERIFICADO: 8 das 10 funções admin levantam "Sem permissão." para o anónimo.
-- `admin_users` e `admin_threads` devolvem [] em vez de recusar. Não consigo
-- distinguir, sem sessão, entre "filtram por auth.uid(), logo seguras" e
-- "não verificam nada, logo qualquer conta autenticada as pode chamar".
--
-- `admin_users` devolve email, papel, saldo e ganhos de todas as contas.
-- `admin_threads` devolve o índice de conversas privadas.
--
-- CORRE 0002_verificacao.sql PRIMEIRO. Este ficheiro dá-te as peças; a
-- aplicação ao corpo das duas funções depende do que o 0002 te mostrar.


-- -----------------------------------------------------------------------------
-- 1. As funções de papel
-- -----------------------------------------------------------------------------
-- profiles.role ∈ ('fan','creator','moderator','admin')
--
-- SECURITY DEFINER porque a RLS de profiles não deixa um fã ler as linhas dos
-- outros — a verificação tem de conseguir ler o próprio perfil. search_path
-- fixo porque uma função que não o fixa pode ser sequestrada por um objeto com
-- o mesmo nome criado por outra pessoa.
--
-- stable: só lê, não escreve. Pode ser usada dentro de políticas e índices.

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'moderator')
  );
$$;

-- Sem argumentos, para usar dentro de políticas:  using (public.is_staff())
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_staff() from public;


-- -----------------------------------------------------------------------------
-- 2. As guardas, com a mesma mensagem que o resto do painel já usa
-- -----------------------------------------------------------------------------
-- "Sem permissão." — a mesma string que admin_stats e companhia já devolvem.
-- Assim o comportamento é uniforme e um teste de intrusão futuro não se
-- assusta com um segundo formato de erro.

create or replace function public.assert_staff()
returns void language plpgsql security definer set search_path = public, pg_temp
as $$ begin
  if not public.is_staff() then raise exception 'Sem permissão.' using errcode = 'P0001'; end if;
end; $$;

create or replace function public.assert_admin()
returns void language plpgsql security definer set search_path = public, pg_temp
as $$ begin
  if not public.is_admin() then raise exception 'Sem permissão.' using errcode = 'P0001'; end if;
end; $$;

revoke execute on function public.assert_staff() from public;
revoke execute on function public.assert_admin() from public;


-- =============================================================================
-- 3. APLICAR ÀS DUAS FUNÇÕES
-- =============================================================================
-- NÃO corras o bloco seguinte sem ter lido o corpo actual em 0002. Precisas
-- da assinatura exacta, que o 0002 imprime na coluna `argumentos`.
--
-- A forma é: manter o nome e os argumentos, pôr a guarda como PRIMEIRA
-- instrução, e devolver a lista filtrada. Exemplo para admin_users, que
-- devolve email e saldos — esses só o admin os vê:
--
--   create or replace function public.admin_users(
--     <os mesmos argumentos que o 0002 imprimiu>
--   )
--   returns <o mesmo tipo de retorno>
--   language sql stable security definer
--   set search_path = public, pg_temp
--   as $$
--     select ...
--       -- as colunas sensíveis ficam para o admin completo
--       case when public.is_admin() then u.email  else null end as email,
--       case when public.is_admin() then u.wallet_balance else null end as wallet_balance,
--       case when public.is_admin() then u.earnings_balance else null end as earnings_balance
--     from ...
--     where <os filtros que já lá estavam>
--     order by created_at desc
--     limit <o limite que já lá estava>
--   $$;
--
-- Repara que o frontend JÁ está preparado para isto: em js/views/admin.js a
-- lista de utilizadores avisa "é sem saldos nem ganhos, isso só o admin
-- completo vê". Ou seja, o painel já desenha a tabela assumindo que um
-- moderator recebe email e saldos a null. O que falta é o servidor honorsar.
--
-- Para admin_threads (índice de conversas) a guarda pode ser só de staff, e
-- deve EMITIR o subject e o preview, que também são privados:
--
--   create or replace function public.admin_threads(<argumentos>)
--   returns <tipo> language sql stable security definer
--   set search_path = public, pg_temp
--   as $$
--     select t.*, <sem o conteúdo das mensagens>
--     from public.threads t
--     where public.is_staff()
--     order by t.updated_at desc
--     limit <limite>
--   $$;
--
-- E o conteúdo das mensagens fica para assert_admin(), como já está hoje em
-- admin_thread_messages.


-- -----------------------------------------------------------------------------
-- 4. AS POLÍTICAS DAS TABELAS, que é a parte que não depende de nenhuma função
-- -----------------------------------------------------------------------------
-- As tabelas que o painel de staff tem de ler, restritas a staff. Se alguma
-- destas não existe com esta forma, o `drop policy if exists` não faz mal.

do $$
declare t text;
begin
  foreach t in array array['purchases','orders','wallet_tx','payouts','payout_info',
                          'reports','kyc_requests','contact_messages']
  loop
    execute format('drop policy if exists "staff: leitura" on public.%I', t);
    execute format(
      'create policy "staff: leitura" on public.%I for select to authenticated using (public.is_staff())', t);
  end loop;
end $$;

-- O dinheiro é só do admin completo. Um moderator vê a lista para investigar,
-- mas não mexe em saldos nem confirma levantamentos.
do $$
declare t text;
begin
  foreach t in array array['payouts','payout_info']
  loop
    execute format('drop policy if exists "admin: escrita" on public.%I', t);
    execute format(
      'create policy "admin: escrita" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Confirmar um levantamento é a operação que não tem volta: diz ao sistema que
-- a transferência bancária foi feita. Um moderator não a faz.
drop policy if exists "admin: confirmar levantamento" on public.payouts;
create policy "admin: confirmar levantamento" on public.payouts
  for update to authenticated
  using      (public.is_admin())
  with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- 5. As promoções
-- -----------------------------------------------------------------------------
-- A linha de `promos` que a auditoria encontrou tem html = null, mas o campo
-- existe e é HTML cru injectado no site inteiro. Quem escreve naquele campo
-- escreve o que toda a gente vê.
--
-- Leitura pública: mantém-se. É o banner do site, e anónimo tem de o ver.
-- Escrita: só o admin completo, sem excepção para o moderator.

drop policy if exists "admin: escreve promocoes" on public.promos;
create policy "admin: escreve promocoes" on public.promos
  for all to authenticated
  using      (public.is_admin())
  with check (public.is_admin());

-- Se a política de leitura se perder ao reescrever a de escrita, repõe-a:
drop policy if exists "anon: le promocoes" on public.promos;
create policy "anon: le promocoes" on public.promos
  for select to anon, authenticated using (true);
