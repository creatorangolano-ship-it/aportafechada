-- Levantamentos (pedido do dono, 2026-11-12):
-- * mínimo de 10 000 Kz;
-- * o que se ganha só pode ser levantado 24 horas depois (ajuda a gestão: estornos, revisões);
-- * o dinheiro chega à conta em até 48 horas (só texto no site).

update settings set value = '10000'::jsonb where key = 'min_payout';

/** Saldo que já pode ser levantado: o saldo de ganhos menos o que entrou nas últimas 24 h. */
create or replace function public.saldo_levantavel(p_user uuid default auth.uid())
returns jsonb
language sql stable security definer set search_path = public
as $$
  with b as (
    select coalesce((select earnings_balance from profiles where id = p_user), 0) as total,
           coalesce((select sum(amount) from ledger
                      where user_id = p_user and account in ('creator', 'affiliate')
                        and amount > 0 and created_at > now() - interval '24 hours'), 0) as recente
  )
  select jsonb_build_object(
    'total', total,
    'disponivel', greatest(0, total - recente),
    'a_libertar', least(total, recente),
    'proximo', (select min(created_at) + interval '24 hours' from ledger
                 where user_id = p_user and account in ('creator', 'affiliate')
                   and amount > 0 and created_at > now() - interval '24 hours'))
  from b
  where p_user = auth.uid() or is_admin();
$$;
revoke all on function public.saldo_levantavel(uuid) from public, anon;
grant execute on function public.saldo_levantavel(uuid) to authenticated;

create or replace function public.request_payout(p_amount bigint)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); b payout_info; v_id uuid; v_bal bigint; v_rec bigint;
begin
  if v_uid is null then raise exception 'Sessão expirada.'; end if;
  if p_amount < setting_int('min_payout') then raise exception 'O levantamento mínimo é % Kz.', setting_int('min_payout'); end if;
  select * into b from payout_info where user_id = v_uid;
  if b.user_id is null then raise exception 'Adiciona primeiro os dados bancários.'; end if;
  if exists (select 1 from creators where id = v_uid and status <> 'approved') then raise exception 'A tua conta ainda não foi verificada.'; end if;
  select earnings_balance into v_bal from profiles where id = v_uid for update;
  select coalesce(sum(amount), 0) into v_rec from ledger
   where user_id = v_uid and account in ('creator', 'affiliate') and amount > 0 and created_at > now() - interval '24 hours';
  if v_bal - v_rec < p_amount then
    if v_bal >= p_amount then raise exception 'Parte deste valor foi ganha há menos de 24 horas. Só fica disponível para levantar 24 horas depois de o ganhares.'; end if;
    raise exception 'O valor é maior do que o saldo disponível.';
  end if;
  update profiles set earnings_balance = earnings_balance - p_amount where id = v_uid;
  insert into payouts (user_id, amount, bank, holder, iban) values (v_uid, p_amount, b.bank, b.holder, b.iban) returning id into v_id;
  return v_id;
end $$;
