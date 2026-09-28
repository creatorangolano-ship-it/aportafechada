-- =============================================================================
-- 0001b_verificacao_papeis.sql — DIAGNÓSTICO. Não altera nada. Corre isto.
-- =============================================================================
-- Pergunta: um MODERADOR consegue banir alguém, ou mexer no dinheiro, chamando
-- as funções do painel directamente da consola do browser?
--
-- Porque a pergunta é séria, e não é teoria:
--   O frontend tem duas camadas de guarda e ambas estão correctas.
--     · a UI não desenha o botão (admin.ts:71  — "só o admin suspende")
--     · o handler volta a verificar (admin.ts:149 — guard('admin'))
--   MAS o comentário no próprio código diz o que importa:
--     "RLS é a fronteira real; isto garante que um handler nunca executa por
--      um clique sintético" (admin.ts:147)
--   Ou seja: as guardas do cliente servem para o botão não aparecer. Não
--   servem para o botão ser impossível. Um moderador com o DevTools aberto
--   escreve na consola:
--
--     sb.rpc('admin_resolve_report', { p_report: 42, p_remove: true })
--     sb.rpc('admin_set_creator_status', { p_creator: 7, p_status: 'suspended' })
--     sb.rpc('admin_set_payout', { p_payout: 3, p_status: 'paid' })
--     sb.rpc('admin_set_role', { p_user: 9, p_role: 'admin' })
--
--   Se essas funções só pedirem "és staff?", o moderador passa todas e o
--   problema é teu — não meu, e não do frontend.
--
-- A auditoria anterior (0001) provou que o ANÓNIMO é rejeitado. Isso não
-- responde a nada: o anónimo falha porque auth.uid() é null, e um moderador
-- tem auth.uid(). São caminhos de código diferentes dentro da mesma função.
-- Esta migração é a que separa os dois.
--
-- COMO CORRER: painel do Supabase → SQL Editor → cola tudo → Run.
-- Só leitura. Podes correr quantas vezes quiseres.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. AS FUNÇÕES DO PAINEL, com veredicto
-- -----------------------------------------------------------------------------
-- Lista TODAS as admin_* e friends, não só as que o frontend chama — pode haver
-- uma aí que ninguém usa e que mesmo assim está exposta.
--
-- Duas colunas a comparar, e a diferença entre elas é o buraco:
--
--   exigida    o que o PAINEL exige. Lido de admin.ts: cada acção chama
--              guard('admin') ou guard('staff'). É o contrato declarado.
--   veredicto  o que a FUNÇÃO aceita, lido do corpo dela.
--
-- Se exigida = 'admin' e o veredicto não for 'OK, só admin', o frontend está a
-- mentir: esconde o botão ao moderador mas deixa a função aberta a ele.
--
-- Uma função exigida='staff' que diga "moderador passa" está CORRECTA — é o que
-- se quer. Não é alarme. Por isso a coluna `problema` é a única a ler em
-- primeiro lugar: vem null quando está tudo bem.

with f as (
  select
    p.proname                                      as funcao,
    pg_get_function_arguments(p.oid)               as argumentos,
    p.prosecdef                                    as security_definer,
    lower(p.prosrc)                                as corpo,
    -- o que o painel exige, segundo admin.ts
    case when p.proname in (
           'admin_resolve_report', 'admin_set_payout', 'admin_set_creator_status',
           'admin_set_role', 'admin_stats', 'admin_threads', 'admin_thread_messages'
         ) then 'admin' else 'staff' end          as exigida,
    -- cita 'admin' como exclusivo? (is_admin, role='admin', assert_admin…)
    (p.prosrc ~* 'is_admin'
      or p.prosrc ~* 'assert_admin'
      or p.prosrc ~* 'admin_completo'
      or p.prosrc ~* 'role\s*=\s*''?admin'
      or p.prosrc ~* 'role\s+in\s*\([^)]*admin')  as tem_guard_admin,
    -- cita staff/moderator como quem pode?
    (p.prosrc ~* 'is_staff'
      or p.prosrc ~* 'assert_staff'
      or p.prosrc ~* 'moderator'
      or p.prosrc ~* 'staff')                      as tem_guard_staff,
    -- tem alguma guarda, seja qual for?
    (p.prosrc ~* 'auth\.uid'
      or p.prosrc ~* 'is_admin'
      or p.prosrc ~* 'is_staff'
      or p.prosrc ~* 'permiss'
      or p.prosrc ~* 'moderator'
      or p.prosrc ~* 'role\s*(=|in)')              as tem_guard_algum
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (p.proname like 'admin%' or p.proname like '%review_kyc%')
)
select
  funcao,
  argumentos,
  exigida,
  case when security_definer then 'definer' else 'invoker' end as modo,
  case
    when tem_guard_admin     then 'OK, só admin'
    when tem_guard_staff     then 'moderador passa'
    when not tem_guard_algum then 'moderador passa (e qualquer conta autenticada)'
    else                     'moderador passa (guarda ilegível, lê à mão)'
  end                                              as veredicto,
  case
    when tem_guard_admin                            then null
    when exigida = 'staff' and tem_guard_staff      then null
    when exigida = 'staff'                           then '>>> nenhuma guarda de papel'
    else '>>> BURACO: o painel esconde isto ao moderador, a função não barra'
  end                                              as problema,
  corpo
from f
order by (problema is null), funcao;


-- -----------------------------------------------------------------------------
-- 2. AS TRÊS TABELAS QUE O MODERADOR NÃO DEVERIA PODER ESCREVER
-- -----------------------------------------------------------------------------
-- O painel escreve nisto com a sessão do utilizador, sem RPC pelo meio
-- (admin.ts:299 promos, admin.ts:395 settings, admin.ts:234 contact_messages).
-- Se alguma tiver política de escrita que aceite staff, o moderador escreve
-- dela com um fetch e a guarda do frontend não interfere.
--
-- settings é a mais grave: tem fee_pct, usd_rate, min_payout, min_price.
-- Quem escreve ali controla o dinheiro de toda a gente.
--
-- Lê a coluna `ao_verificar`. Se disser is_staff() ou moderator, é MODERADOR PASSA.

select
  tablename                                          as tabela,
  policyname                                         as politica,
  cmd                                                as comando,
  roles                                              as quem,
  coalesce(qual, '(sem using)')                      as usando,
  coalesce(with_check, '(sem with check: INSERT passa)') as ao_verificar,
  case
    when coalesce(qual,'') ~* 'is_admin' or coalesce(with_check,'') ~* 'is_admin'
      then 'OK, só admin'
    when coalesce(qual,'') ~* 'is_staff' or coalesce(with_check,'') ~* 'is_staff'
      or coalesce(qual,'') ~* 'moderator' or coalesce(with_check,'') ~* 'moderator'
      then '>>> MODERADOR PASSA'
    when coalesce(with_check,'') is null and cmd = 'SELECT'
      then null
    else 'ver à mão'
  end                                                as veredicto
from pg_policies
where schemaname = 'public'
  and tablename in ('promos', 'settings', 'contact_messages')
order by veredicto nulls last, tabela, cmd, policyname;


-- -----------------------------------------------------------------------------
-- 3. A TABELA profiles: dá para um moderador auto-elevar-se?
-- -----------------------------------------------------------------------------
-- admin_set_role é admin-gated na UI (admin.ts:347) e recusa auto-mudança.
-- Mas se a coluna role for actualizável na tabela, o moderador não precisa
-- da função: faz sb.from('profiles').update({role:'admin'}).eq('id', o meu id).
-- Esta consulta diz se pode.
--
-- Se não houver NENHUMA linha aqui, é bom sinal: ou a tabela não tem política
-- de escrita nenhuma (fechada, é o que se quer), ou RLS está desligada — e aí
-- é o teste 4 do 0001 que diz se está fechada ou aberta.

select
  policyname                                         as politica_em_profiles,
  cmd                                                as comando,
  coalesce(qual, '(sem using)')                      as usando,
  coalesce(with_check, '(sem check)')                 as ao_verificar,
  case
    when coalesce(qual,'') ~* 'is_admin' or coalesce(with_check,'') ~* 'is_admin'
      then 'OK, só admin'
    when coalesce(qual,'') ~* 'is_staff' or coalesce(with_check,'') ~* 'is_staff'
      or coalesce(qual,'') ~* 'moderator' or coalesce(with_check,'') ~* 'moderator'
      then '>>> MODERADOR ESCREVE, incluindo na própria linha se for uid=id'
    when coalesce(qual,'') ~* 'auth\.uid\(\)\s*=\s*id'
      or coalesce(with_check,'') ~* 'auth\.uid\(\)\s*=\s*id'
      then 'OK no nome, VERIFICA: deixa editar o role de si próprio?'
    else 'ver à mão'
  end                                                as veredicto
from pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
  and cmd in ('UPDATE', 'ALL')
order by policyname;


-- -----------------------------------------------------------------------------
-- 4. IS_STAFF E IS_ADMIN: O QUE ELAS PROMETEM
-- -----------------------------------------------------------------------------
-- 0003_guardas.sql cria-as assim (is_staff: role in ('admin','moderator')),
-- mas 0003 NÃO FOI APLICADA — é uma proposta. Se no teu esquema is_staff()
-- aceitar 'creator', o 'staff' que toda a gente usa no código é mais largo
-- do que pensas. Lê os corpos reais.
--
-- Confirma também que não aceitam argumentos: se is_admin(a, b) aceitar
-- argumentos, outra função pode estar a chamar com os seus e a executar em
-- nome dela. É o truque clássico do search_path.

select
  proname                                            as guarda,
  pg_get_function_arguments(oid)                    as argumentos,
  case when prosecdef then 'definer' else 'invoker'  end as modo,
  case when proconfig is null then 'NAO FIXA'
       else array_to_string(proconfig, ' ') end      as search_path,
  lower(prosrc)                                      as corpo
from pg_proc
where proname in ('is_admin', 'is_staff', 'is_moderator', 'assert_admin', 'assert_staff')
order by proname;
