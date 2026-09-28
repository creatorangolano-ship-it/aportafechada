-- =============================================================================
-- 0003_rate_limit.sql — lacuna 2: login-handle sem limite de tentativas
-- =============================================================================
-- VERIFICADO: 6 tentativas seguidas à edge function `login-handle` devolvem
-- sempre a mesma resposta, sem contador, sem bloqueio e sem atraso.
--
-- O login por email do Supabase tem rate limit próprio. O login por handle NÃO
-- passa por ele — é uma edge function tua, à parte. Por isso um atacante tem
-- tentativas ilimitadas contra um endpoint de handle + senha.
--
-- COMO CORRER: esta migração cria as tabelas de controlo. A parte que falta é
-- uma linha na própria edge function (no fim do ficheiro) — o código da função
-- não está no Git, portanto não a posso aplicar sozinha.


-- -----------------------------------------------------------------------------
-- Tabela de tentativas
-- -----------------------------------------------------------------------------
-- Guarda a chave (o handle normalizado, ou o IP) e quando foi a última
-- tentativa. Uma linha por chave. Limpar não é preciso: o UPSERT substitui.

create table if not exists public.login_attempts (
  key        text primary key,
  tries      int  not null default 1,
  first_at   timestamptz not null default now(),
  last_at    timestamptz not null default now(),
  blocked_until timestamptz
);

alter table public.login_attempts enable row level security;

-- Ninguém lê nem escreve esta tabela pela API. A edge function é que a mexe,
-- com a service_role, que ignora a RLS. Duas políticas vazias bastam para
-- calar o PostgREST; a segurança real é não estar acessível.
create policy "login_attempts: sem acesso" on public.login_attempts
  for all to anon, authenticated using (false) with check (false);

revoke all on public.login_attempts from anon, authenticated;


-- -----------------------------------------------------------------------------
-- Registo e verificação de tentativas
-- -----------------------------------------------------------------------------
-- Devolve true se a tentativa for permitida, false se a chave está bloqueada.
-- Bloqueia ao fim de max_tries dentro da janela, durante block_minutes.
--
-- max_tries = 5: generoso para uma pessoa a trocar a palavra-passe três vezes
-- seguidas, e curto demais para ser útil a um ataque.
-- A janela e o bloqueio escalam com as tentativas: quem insiste, espera mais.

create or replace function public.login_rate_ok(
  p_key      text,
  max_tries  int      default 5,
  window_min int      default 15,
  block_min  int      default 15
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n    int;
  blo  timestamptz;
  pri  timestamptz;
begin
  select tries, blocked_until, first_at into n, blo, pri
    from login_attempts where key = p_key
    for update;

  -- Ainda bloqueada?
  if blo is not null and blo > now() then
    return false;
  end if;

  -- Janela expirada: recomeça a contar.
  if n is null or pri < now() - make_interval(mins => window_min) then
    insert into login_attempts (key, tries, first_at, last_at, blocked_until)
    values (p_key, 1, now(), now(), null)
    on conflict (key) do update
      set tries = 1, first_at = now(), last_at = now(), blocked_until = null;
    return true;
  end if;

  -- Dentro da janela: soma e escala o bloqueio se passar do limite.
  n := n + 1;
  insert into login_attempts (key, tries, first_at, last_at, blocked_until)
  values (p_key, n, now(), now(),
          case when n > max_tries
               then now() + make_interval(mins => block_min * (n - max_tries))
               else null end)
  on conflict (key) do update
    set tries = n, last_at = now(),
        blocked_until = excluded.blocked_until;

  return n <= max_tries;
end;
$$;

-- Limpar tentativas antigas. Chamar do cron, uma vez por dia.
create or replace function public.login_rate_cleanup()
returns int language sql security definer set search_path = public, pg_temp as $$
  with apagadas as (
    delete from login_attempts
    where last_at < now() - interval '2 days'
    returning 1
  ) select count(*)::int from apagadas;
$$;

revoke execute on function public.login_rate_ok    (text, int, int, int) from public, anon;
revoke execute on function public.login_rate_cleanup() from public, anon;


-- =============================================================================
-- A PARTE QUE FALTA — dentro da edge function `login-handle`
-- =============================================================================
-- O código da função não está no Git, por isso não a posso corrigir daqui.
-- No topo da função, ANTES de qualquer consulta à base de dados:
--
--   import { createClient } from 'jsr:@supabase/supabase-js@2'
--   const admin = createClient(
--     Deno.env.get('SUPABASE_URL')!,
--     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,   // service_role, nunca a anon
--   )
--
--   // A chave é o handle normalizado E o IP. Quem alterna handles a partir do
--   // mesmo IP não escapa; o mesmo handle de IPs diferentes também não.
--   const ip = Deno.serveConn?.info?.remoteAddr?.hostname ?? 'desconhecido'
--   const chave = `${String(handle).trim().toLowerCase()}|${ip}`
--
--   const { data: pode } = await admin.rpc('login_rate_ok', { p_key: chave })
--   if (!pode) {
--     return json({ error: 'Demasiadas tentativas. Espera 15 minutos.' }, 429)
--   }
--
-- E no fim, para limpar o contador quando o login é correcto — senão um
-- utilizador legítimo que erra a senha duas vezes fica perto do limite:
--
--   await admin.from('login_attempts').delete().eq('key', chave)
--
-- NOTA: a resposta de 429 é diferente da de credenciais erradas, o que permite
-- a um atacante distinguir "handle existe e está bloqueado" de "handle não
-- existe". Para não reintroduzir a enumeração, devolve a MESMA mensagem de
-- erro de sempre e só muda o código HTTP. Assim o texto não serve de oráculo.
