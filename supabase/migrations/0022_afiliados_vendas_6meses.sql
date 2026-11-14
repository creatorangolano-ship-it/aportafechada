-- Afiliados: 5% das vendas dos criadores que convidaram, durante 6 meses.
--
-- Regra (pedida pelo dono, 14/11/2026):
-- * o afiliado recebe sobre o que os SEUS CONVIDADOS VENDEM (o criador convidado),
--   já não sobre o que um fã convidado gasta;
-- * só vendas de publicações pagas.
--   Subscrições (pagar o acesso ao perfil), gorjetas, mensagens pagas e bilhetes de live ficam de fora;
-- * só vendas confirmadas: split_revenue só corre quando o pedido passa a «paid»;
-- * durante 6 meses a contar da criação da conta do convidado;
-- * a comissão sai da parte da plataforma (nunca do criador) e nunca a ultrapassa.

insert into settings (key, value) values ('affiliate_pct', '5'::jsonb)
  on conflict (key) do update set value = excluded.value;
insert into settings (key, value) values ('affiliate_months', '6'::jsonb)
  on conflict (key) do update set value = excluded.value;

create or replace function public.split_revenue(o orders)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pct  int := coalesce((comissao_criador(o.creator_id) ->> 'pct')::int, setting_int('fee_pct'));
  v_fee  bigint := round(o.amount * v_pct / 100.0);
  v_net  bigint := o.amount - v_fee;
  v_aff  uuid;
  v_desde timestamptz;
  v_affv bigint := 0;
begin
  if o.creator_id is null then return; end if;

  -- Só vendas do criador convidado, dentro do prazo.
  if o.kind = 'post' then
    select referred_by, created_at into v_aff, v_desde from profiles where id = o.creator_id;
    if v_aff is not null and v_aff <> o.creator_id and v_aff <> o.user_id
       and now() < v_desde + make_interval(months => coalesce(setting_int('affiliate_months'), 6)) then
      v_affv := least(round(o.amount * setting_int('affiliate_pct') / 100.0), v_fee);
    end if;
  end if;

  update profiles set earnings_balance = earnings_balance + v_net where id = o.creator_id;
  insert into ledger (order_id, account, user_id, amount) values (o.id, 'creator', o.creator_id, v_net);
  if v_affv > 0 then
    update profiles set earnings_balance = earnings_balance + v_affv where id = v_aff;
    insert into ledger (order_id, account, user_id, amount) values (o.id, 'affiliate', v_aff, v_affv);
  end if;
  insert into ledger (order_id, account, user_id, amount) values (o.id, 'platform', null, v_fee - v_affv);
end $function$;
