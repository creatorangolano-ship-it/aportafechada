-- Comissão progressiva para criadores novos (decisão do dono, 2026-11-12, «opção B").
-- A mesma regra para todos, contada a partir da data de aprovação do criador:
--   1.º mês (dias 0–29):  10 %
--   2.º mês (dias 30–59): 15 %
--   depois:               20 % (fee_pct, a comissão normal)
--
-- Não há marcas nem listas especiais: a percentagem calcula-se no momento de cada venda e
-- o valor exacto fica escrito no ledger. Saldos e levantamentos não mudam em nada.

create or replace function public.comissao_criador(p_creator uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with c as (
    select coalesce(approved_at, created_at) as desde from creators where id = p_creator
  ), d as (
    select desde, floor(extract(epoch from (now() - desde)) / 86400)::int as dias from c
  )
  select jsonb_build_object(
    'pct', case when dias < 30 then 10 when dias < 60 then 15 else setting_int('fee_pct') end,
    'normal', setting_int('fee_pct'),
    'proxima_mudanca', case when dias < 30 then desde + interval '30 days'
                            when dias < 60 then desde + interval '60 days' end,
    'proximo_pct', case when dias < 30 then 15 when dias < 60 then setting_int('fee_pct') end)
  from d;
$$;
revoke all on function public.comissao_criador(uuid) from public, anon;
grant execute on function public.comissao_criador(uuid) to authenticated;

create or replace function public.split_revenue(o orders)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_pct  int := coalesce((comissao_criador(o.creator_id) ->> 'pct')::int, setting_int('fee_pct'));
  v_fee  bigint := round(o.amount * v_pct / 100.0);
  v_net  bigint := o.amount - v_fee;
  v_aff  uuid;
  v_affv bigint := 0;
begin
  if o.creator_id is null then return; end if;
  -- afiliado: quem convidou o comprador; se não houver, quem convidou o criador
  select referred_by into v_aff from profiles where id = o.user_id;
  if v_aff is null or v_aff = o.creator_id then select referred_by into v_aff from profiles where id = o.creator_id; end if;
  if v_aff is not null and v_aff <> o.user_id then
    v_affv := least(round(o.amount * setting_int('affiliate_pct') / 100.0), v_fee);
  end if;

  update profiles set earnings_balance = earnings_balance + v_net where id = o.creator_id;
  insert into ledger (order_id, account, user_id, amount) values (o.id, 'creator', o.creator_id, v_net);
  if v_affv > 0 then
    update profiles set earnings_balance = earnings_balance + v_affv where id = v_aff;
    insert into ledger (order_id, account, user_id, amount) values (o.id, 'affiliate', v_aff, v_affv);
  end if;
  insert into ledger (order_id, account, user_id, amount) values (o.id, 'platform', null, v_fee - v_affv);
end $$;
