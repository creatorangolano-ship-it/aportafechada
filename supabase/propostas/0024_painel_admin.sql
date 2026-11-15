-- Painel da «Visão geral» da consola: números, gráficos e filtros (pedido pelo dono, 15/11/2026).
--
-- Uma só função de leitura, só para o admin completo (assert_admin). Não escreve nada.
--
-- Parâmetros (todos opcionais, excepto as datas):
--   p_de, p_ate  dias do período, inclusive, na hora de Luanda
--   p_kind       'subscription' | 'post' | 'tip' | 'message' | 'ticket'   (vendas só desse tipo)
--   p_creator    id do criador                                           (vendas só desse criador)
--   p_contas     'fas' | 'criadores'                                      (novas contas só desse tipo)
--   p_origem     'afiliado' | 'sem_convite'                               (contas e compradores por origem)
--
-- Regras:
--   * vendas = pedidos pagos (`orders.status = 'paid'`), sem carregamentos da carteira (`topup`);
--   * receita da plataforma = linhas `platform` do `ledger` desses pedidos (já sem a comissão do afiliado);
--   * períodos com mais de 120 dias agrupam por mês; os outros por dia;
--   * o período anterior tem a mesma duração e acaba no dia antes de `p_de`;
--   * «criador» = conta com perfil de criador aprovado (`creators.status = 'approved'`).
--
-- Visitas não estão na base de dados (são da Vercel Analytics), por isso o funil começa nas contas criadas.

create or replace function public.admin_painel(
  p_de date,
  p_ate date,
  p_kind text default null,
  p_creator uuid default null,
  p_contas text default null,
  p_origem text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  tz constant text := 'Africa/Luanda';
  v_dias int;
  v_mensal boolean;
  v_ini timestamptz;
  v_fim timestamptz;
  v_aini timestamptz;
  v_afim timestamptz;
  v_hold int := coalesce(setting_int('affiliate_hold_days'), 30);
  r jsonb;
begin
  perform assert_admin();

  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'Período inválido.' using errcode = 'P0001'; end if;
  if p_ate - p_de > 731 then raise exception 'O período não pode passar de 2 anos.' using errcode = 'P0001'; end if;
  if p_kind is not null and p_kind not in ('subscription', 'post', 'tip', 'message', 'ticket') then raise exception 'Tipo de venda inválido.' using errcode = 'P0001'; end if;
  if p_contas is not null and p_contas not in ('fas', 'criadores') then raise exception 'Tipo de conta inválido.' using errcode = 'P0001'; end if;
  if p_origem is not null and p_origem not in ('afiliado', 'sem_convite') then raise exception 'Origem inválida.' using errcode = 'P0001'; end if;

  v_dias := p_ate - p_de + 1;
  v_mensal := v_dias > 120;
  v_ini := p_de::timestamp at time zone tz;
  v_fim := (p_ate + 1)::timestamp at time zone tz;
  v_aini := (p_de - v_dias)::timestamp at time zone tz;
  v_afim := v_ini;

  with
  -- Vendas pagas com os filtros, dos dois períodos (actual e anterior).
  vendas as (
    select o.id, o.kind, o.amount, o.creator_id, o.created_at,
           (o.created_at >= v_ini) as actual,
           coalesce((select sum(l.amount) from ledger l where l.order_id = o.id and l.account = 'platform'), 0) as receita
      from orders o
      left join profiles comp on comp.id = o.user_id
     where o.status = 'paid'
       and o.kind <> 'topup'
       and o.created_at >= v_aini and o.created_at < v_fim
       and (p_kind is null or o.kind = p_kind)
       and (p_creator is null or o.creator_id = p_creator)
       and (p_origem is null
            or (p_origem = 'afiliado' and comp.referred_by is not null)
            or (p_origem = 'sem_convite' and comp.referred_by is null))
  ),
  -- Contas criadas no período, já com o tipo (fã/criador) e os filtros.
  contas as (
    select p.id, p.created_at, p.onboarded,
           exists (select 1 from creators c where c.id = p.id and c.status = 'approved') as criador,
           (p.created_at >= v_ini) as actual
      from profiles p
     where p.created_at >= v_aini and p.created_at < v_fim
       and (p_origem is null
            or (p_origem = 'afiliado' and p.referred_by is not null)
            or (p_origem = 'sem_convite' and p.referred_by is null))
  ),
  contas_f as (
    select * from contas
     where p_contas is null or (p_contas = 'criadores' and criador) or (p_contas = 'fas' and not criador)
  ),
  -- Os intervalos do eixo (dia ou mês), para os dias sem vendas aparecerem a zero.
  eixo as (
    select g::date as d, (row_number() over (order by g) - 1)::int as i
      from generate_series(
             case when v_mensal then date_trunc('month', p_de)::date else p_de end,
             p_ate,
             case when v_mensal then interval '1 month' else interval '1 day' end) g
  ),
  balde as (
    select case when v_mensal then date_trunc('month', (x.created_at at time zone tz))::date
                else (x.created_at at time zone tz)::date end as d, x.amount, x.receita
      from vendas x where x.actual
  ),
  balde_contas as (
    select case when v_mensal then date_trunc('month', (c.created_at at time zone tz))::date
                else (c.created_at at time zone tz)::date end as d, c.criador
      from contas_f c where c.actual
  ),
  -- Período anterior, alinhado pela posição (1.º dia com 1.º dia).
  anterior as (
    select case when v_mensal then (extract(year from age(date_trunc('month', (created_at at time zone tz)), date_trunc('month', (v_aini at time zone tz))))::int * 12
                                    + extract(month from age(date_trunc('month', (created_at at time zone tz)), date_trunc('month', (v_aini at time zone tz))))::int)
                else ((created_at at time zone tz)::date - (p_de - v_dias)) end as i,
           amount
      from vendas where not actual
  ),
  serie as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'd', e.d,
             'vendas', coalesce((select sum(b.amount) from balde b where b.d = e.d), 0),
             'receita', coalesce((select sum(b.receita) from balde b where b.d = e.d), 0),
             'fas', (select count(*) from balde_contas c where c.d = e.d and not c.criador),
             'criadores', (select count(*) from balde_contas c where c.d = e.d and c.criador),
             'anterior', coalesce((select sum(a.amount) from anterior a where a.i = e.i), 0)
           ) order by e.d), '[]'::jsonb) as v
      from eixo e
  )
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate, 'mensal', v_mensal,
    'serie', (select v from serie),
    'totais', jsonb_build_object(
      'vendas',           (select coalesce(sum(amount), 0) from vendas where actual),
      'vendas_ant',       (select coalesce(sum(amount), 0) from vendas where not actual),
      'receita',          (select coalesce(sum(receita), 0) from vendas where actual),
      'receita_ant',      (select coalesce(sum(receita), 0) from vendas where not actual),
      'contas',           (select count(*) from contas_f where actual),
      'contas_ant',       (select count(*) from contas_f where not actual),
      'criadores_vendas',     (select count(distinct creator_id) from vendas where actual),
      'criadores_vendas_ant', (select count(distinct creator_id) from vendas where not actual),
      'subs_activas',     (select count(*) from subscriptions s
                            where s.started_at < v_fim and s.current_period_end >= v_fim
                              and (p_creator is null or s.creator_id = p_creator)),
      'subs_activas_ant', (select count(*) from subscriptions s
                            where s.started_at < v_afim and s.current_period_end >= v_afim
                              and (p_creator is null or s.creator_id = p_creator))
    ),
    'tipos', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'total', total) order by total desc), '[]'::jsonb)
                from (select kind, sum(amount) as total from vendas where actual group by kind) t),
    'funil', jsonb_build_object(
      'contas',    (select count(*) from contas_f where actual),
      'perfil',    (select count(*) from contas_f where actual and onboarded),
      -- Das contas criadas no período: quantas pediram para ser criador e quantas foram aprovadas.
      'pedidos',   (select count(distinct k.user_id) from kyc_requests k join contas_f c on c.id = k.user_id and c.actual
                     where k.created_at >= v_ini),
      'aprovados', (select count(distinct k.user_id) from kyc_requests k join contas_f c on c.id = k.user_id and c.actual
                     where k.created_at >= v_ini and k.status = 'approved')
    ),
    'top', (select coalesce(jsonb_agg(t order by t.vendas desc), '[]'::jsonb) from (
              select v.creator_id as id, p.handle, p.name, p.avatar_url, sum(v.amount) as vendas,
                     (select count(*) from subscriptions s where s.creator_id = v.creator_id
                        and s.status = 'active' and s.current_period_end > now()) as subscritores
                from vendas v join profiles p on p.id = v.creator_id
               where v.actual and v.creator_id is not null
               group by v.creator_id, p.handle, p.name, p.avatar_url
               order by sum(v.amount) desc
               limit 6) t),
    'dinheiro', jsonb_build_object(
      'saldos',        (select coalesce(sum(earnings_balance), 0) from profiles where earnings_balance > 0),
      'retido',        (select coalesce(sum(l.amount), 0) from ledger l join orders o on o.id = l.order_id
                         where l.account = 'affiliate' and o.created_at > now() - make_interval(days => v_hold)),
      'pedidos',       (select coalesce(sum(amount), 0) from payouts where status in ('pending', 'review')),
      'pedidos_n',     (select count(*) from payouts where status in ('pending', 'review')),
      'pago',          (select coalesce(sum(amount), 0) from payouts where status = 'paid' and created_at >= v_ini and created_at < v_fim),
      'pago_n',        (select count(*) from payouts where status = 'paid' and created_at >= v_ini and created_at < v_fim)
    ),
    'criadores', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'handle', p.handle, 'name', p.name) order by lower(coalesce(p.name, p.handle))), '[]'::jsonb)
                    from creators c join profiles p on p.id = c.id where c.status = 'approved')
  ) into r;

  return r;
end $$;

revoke execute on function public.admin_painel(date, date, text, uuid, text, text) from public, anon;
grant execute on function public.admin_painel(date, date, text, uuid, text, text) to authenticated;
