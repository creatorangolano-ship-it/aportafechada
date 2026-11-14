-- Levantamento das comissões de afiliado (pedido do dono, 14/11/2026):
-- * cada comissão só pode ser levantada 30 dias depois da venda
--   (setting affiliate_hold_days), para dar tempo a reembolsos e fraudes;
-- * só quem tem a identidade verificada (pedido de verificação aprovado)
--   pode levantar comissões de afiliado. Até lá ficam retidas.
-- Os ganhos de criador mantêm a regra das 24 horas.

insert into settings (key, value) values ('affiliate_hold_days', '30'::jsonb)
  on conflict (key) do update set value = excluded.value;

create or replace function public.identidade_verificada(p_user uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from kyc_requests where user_id = p_user and status = 'approved');
$function$;

-- Quando cada ganho fica livre. null = retido até a identidade ser verificada.
create or replace function public.ganhos_retidos(p_user uuid)
 returns table (amount bigint, account text, liberta timestamptz)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with v as (select identidade_verificada(p_user) as ok)
  select l.amount, l.account,
         case when l.account = 'creator' then l.created_at + interval '24 hours'
              when v.ok then l.created_at + make_interval(days => coalesce(setting_int('affiliate_hold_days'), 30))
              else null end
    from ledger l, v
   where l.user_id = p_user and l.amount > 0
     and (   (l.account = 'creator' and l.created_at > now() - interval '24 hours')
          or (l.account = 'affiliate' and (not v.ok
               or l.created_at > now() - make_interval(days => coalesce(setting_int('affiliate_hold_days'), 30)))));
$function$;
revoke all on function public.ganhos_retidos(uuid) from public, anon, authenticated;
revoke all on function public.identidade_verificada(uuid) from public, anon, authenticated;

create or replace function public.saldo_levantavel(p_user uuid default auth.uid())
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with b as (
    select coalesce((select earnings_balance from profiles where id = p_user), 0) as total,
           coalesce((select sum(amount) from ganhos_retidos(p_user)), 0) as retido,
           coalesce((select sum(amount) from ganhos_retidos(p_user) where liberta is null), 0) as por_verificar
  )
  select jsonb_build_object(
    'total', total,
    'disponivel', greatest(0, total - retido),
    'a_libertar', least(total, retido - por_verificar),
    'por_verificar', least(total, por_verificar),
    'proximo', (select min(liberta) from ganhos_retidos(p_user)))
  from b
  where p_user = auth.uid() or is_admin();
$function$;

create or replace function public.request_payout(p_amount bigint)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); b payout_info; v_id uuid; v_bal bigint; v_ret bigint; v_ver bigint;
begin
  if v_uid is null then raise exception 'Sessão expirada.'; end if;
  if p_amount < setting_int('min_payout') then raise exception 'O levantamento mínimo é % Kz.', setting_int('min_payout'); end if;
  select * into b from payout_info where user_id = v_uid;
  if b.user_id is null then raise exception 'Adiciona primeiro os dados bancários.'; end if;
  if exists (select 1 from creators where id = v_uid and status <> 'approved') then raise exception 'A tua conta ainda não foi verificada.'; end if;
  select earnings_balance into v_bal from profiles where id = v_uid for update;
  select coalesce(sum(amount), 0), coalesce(sum(amount) filter (where liberta is null), 0)
    into v_ret, v_ver from ganhos_retidos(v_uid);
  if v_bal - v_ret < p_amount then
    if v_bal - (v_ret - v_ver) >= p_amount and v_ver > 0 then
      raise exception 'As comissões de afiliado só podem ser levantadas depois de verificares a tua identidade.';
    end if;
    if v_bal >= p_amount then
      raise exception 'Parte deste valor ainda não está disponível: os ganhos libertam-se 24 horas depois e as comissões de afiliado % dias depois da venda.', coalesce(setting_int('affiliate_hold_days'), 30);
    end if;
    raise exception 'O valor é maior do que o saldo disponível.';
  end if;
  update profiles set earnings_balance = earnings_balance - p_amount where id = v_uid;
  insert into payouts (user_id, amount, bank, holder, iban) values (v_uid, p_amount, b.bank, b.holder, b.iban) returning id into v_id;
  return v_id;
end $function$;
