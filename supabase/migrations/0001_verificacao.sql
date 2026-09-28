-- =============================================================================
-- 0002_verificacao.sql — DIAGNÓSTICO. Não altera nada. Corre isto primeiro.
-- =============================================================================
-- Painel do Supabase → SQL Editor → cola tudo isto → Run.
--
-- Responde a três perguntas que não consigo responder sem uma conta:
--   1. admin_users e admin_threads verificam o papel de quem chama?
--   2. create-order / pay_with_wallet recalculam o preço no servidor?
--   3. Alguma função SECURE (SECURITY DEFINER) não fixa search_path?
--
-- É só leitura. Podes correr quantas vezes quiseres.


-- -----------------------------------------------------------------------------
-- 1. TODAS AS FUNÇÕES, com o código-fonte e uma marca de "verifica o papel?"
-- -----------------------------------------------------------------------------
-- A coluna `verifica` é uma heurística: procura no corpo por referências a papel
-- ou a auth.uid(). Serve para te apontar as suspeitas, não para as condenar.
-- As linhas marcadas como SUSPEITA são as que tinhas de ler à mão.

select
  p.proname                                        as funcao,
  pg_get_function_arguments(p.oid)                 as argumentos,
  p.prosecdef                                      as security_definer,
  case when p.proconfig is null then 'NAO FIXA'
       else array_to_string(p.proconfig, ' ') end  as search_path,
  case
    when p.prosrc ~* 'sem permiss|permiss|apenas|só .* pode'
      or p.prosrc ~* 'role\s*(=|in|=~|like).*(admin|moderator|staff)'
      or p.prosrc ~* '(admin|moderator|staff).*(role)\s*(=|in|=~|like)'
      or p.prosrc ~* 'is_(admin|staff|moderator)'
      then 'verificacao aparente'
    else '>>> SUSPEITA: sem verificacao visivel'
  end                                              as verifica,
  left(regexp_replace(p.prosrc, '\s+', ' ', 'g'), 300) as inicio_do_corpo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname not in ('is_admin', 'is_staff', 'is_moderator')  -- ignoradas se ja as criares
order by (p.prosrc ~* 'sem permiss|permiss|role|is_admin|is_staff|is_moderator'), p.proname;


-- -----------------------------------------------------------------------------
-- 1b. As duas que preciso de confirmar. Lê o corpo na mão e responde:
--       - filtra por auth.uid()?  -> provavelmente segura
--       - tem 'sem permiss'/'role in (admin,moderator)'? -> segura
--       - nenhum dos dois?        -> QUALQUER CONTA AUTENTICADA CHAMA-A
-- -----------------------------------------------------------------------------

select proname, prosrc
from pg_proc
where proname in ('admin_users', 'admin_threads');


-- -----------------------------------------------------------------------------
-- 2. O PREÇO É CALCULADO NO SERVIDOR?
-- -----------------------------------------------------------------------------
-- Procura as funções de dinheiro. O que quero ver dentro do corpo:
--   - uma leitura a creators.price / posts.price / messages.ppv_price / lives.price
--   - e NÃO um 'amount' ou 'p_amount' que venha direito do cliente
-- Se o corpo usar o amount recebido sem reler a tabela, o frontend pode ser
-- contornado com um curl e o comprador paga o que o atacante disser.

select proname, pg_get_function_arguments(oid) as argumentos,
       left(regexp_replace(prosrc, '\s+', ' ', 'g'), 600) as corpo
from pg_proc
join pg_namespace n on n.oid = pronamespace
where n.nspname = 'public'
  and (proname = 'pay_with_wallet' or proname like '%order%' or proname like '%capture%');


-- -----------------------------------------------------------------------------
-- 3. FUNÇÕES QUE NÃO FIXAM search_path
-- -----------------------------------------------------------------------------
-- Uma função SECURITY DEFINER sem search_path fixo pode ser sequestrada: um
-- utilizador cria um objeto com o mesmo nome no seu schema e a função usa o dele
-- em vez do oficial. Exige o dono da função — a tua service_role.

select proname, pg_get_function_identity_arguments(oid) as argumentos
from pg_proc
join pg_namespace n on n.oid = pronamespace
where n.nspname = 'public'
  and prosecdef
  and (proconfig is null
       or not exists (select 1 from unnest(proconfig) c where c like 'search\_path=%'));

-- Correcção para cada uma:  alter function <nome>(<args>) set search_path = public, pg_temp;


-- -----------------------------------------------------------------------------
-- 4. TABELAS SEM NENHUMA POLÍTICA  (a consulta da razão social, outra vez)
-- -----------------------------------------------------------------------------
-- Uma tabela sem policies, com RLS ligado, é tabela fechada — é isso que queremos.
-- Uma tabela sem policies e com RLS DESLIGADO é aberta a toda a gente.

select
  c.relname                                   as tabela,
  c.relrowsecurity                            as rls_ativa,
  (select count(*) from pg_policies p
    where p.tablename = c.relname and p.schemaname = 'public') as politicas,
  case
    when not c.relrowsecurity and not exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid and a.attname in ('wallet_balance','earnings_balance','role')
    ) then '>>> PERIGO: sem RLS e com coluna sensivel'
    when not c.relrowsecurity then 'sem RLS (verificar se e preenchida so por SECURITY DEFINER)'
    else 'ok'
  end                                         as veredicto
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;


-- -----------------------------------------------------------------------------
-- 5. SALDOS E PAPÉIS: SÃO ESCRIVÍVEIS DIRETAMENTE?
-- -----------------------------------------------------------------------------
-- Se estas colunas forem actualizáveis pelo dono da tabela, um utilizador
-- escreve-se a si próprio dinheiro. O saldo só pode mudar dentro de uma função.

select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and column_name in ('wallet_balance','earnings_balance','role','creator_status',
                      'status','amount','price','ppv_price')
order by table_name, column_name;
