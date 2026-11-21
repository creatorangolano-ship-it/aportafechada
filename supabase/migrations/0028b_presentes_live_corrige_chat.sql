-- Corrige a 0028: na versão aplicada primeiro faltava a linha «insert into live_chat» em fulfill_order.
-- (O ficheiro 0028 já está corrigido; esta migração reaplica só a função, como foi feito em produção.)

create or replace function public.fulfill_order(p_order uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  o       orders;
  v_buyer text;
  v_end   timestamptz;
  v_gift  text;
begin
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'Pedido não existe.'; end if;
  if o.status = 'paid' then return; end if;
  update orders set status = 'paid', paid_at = now() where id = o.id;
  select coalesce(nullif(name,''), handle::text) into v_buyer from profiles where id = o.user_id;

  if o.kind = 'topup' then
    update profiles set wallet_balance = wallet_balance + o.amount where id = o.user_id;
    insert into wallet_tx (user_id, amount, description, order_id) values (o.user_id, o.amount, 'Carregamento da carteira', o.id);
    perform notify(o.user_id, 'A tua carteira foi carregada com ' || o.amount || ' Kz.', 'carteira');
    return;
  end if;

  perform split_revenue(o);

  if o.kind = 'subscription' then
    select greatest(current_period_end, now()) + interval '1 month' into v_end
      from subscriptions where fan_id = o.user_id and creator_id = o.creator_id;
    insert into subscriptions (fan_id, creator_id, price, status, auto_renew, current_period_end)
    values (o.user_id, o.creator_id, o.amount, 'active', true, coalesce(v_end, now() + interval '1 month'))
    on conflict (fan_id, creator_id) do update set status = 'active', price = excluded.price,
      current_period_end = excluded.current_period_end;
    perform sync_sub_count(o.creator_id);
    perform notify(o.creator_id, v_buyer || ' subscreveu o teu perfil.', 'estudio');
  elsif o.kind in ('post','message','ticket') then
    insert into purchases (user_id, kind, ref_id, amount) values (o.user_id, o.kind, o.target_id, o.amount)
      on conflict do nothing;
    perform notify(o.creator_id, v_buyer || case o.kind when 'post' then ' comprou uma publicação tua.'
      when 'message' then ' desbloqueou uma mensagem tua.' else ' comprou bilhete para a tua live.' end, 'estudio');
  elsif o.kind = 'tip' then
    v_gift := o.meta->>'gift';
    if v_gift is not null then
      perform notify(o.creator_id, v_buyer || ' enviou-te ' || coalesce((select icon || ' ' || name from live_gifts where key = v_gift), 'um presente')
        || ' (' || o.amount || ' Kz) na live.', 'estudio');
    else
      perform notify(o.creator_id, v_buyer || ' enviou-te uma gorjeta de ' || o.amount || ' Kz.', 'estudio');
    end if;
    if o.meta ? 'live_id' then
      insert into live_chat (live_id, user_id, body, tip_amount, gift)
      -- Num presente, o valor não vai para o chat: quem está a ver só vê o presente e quem o enviou.
      values ((o.meta->>'live_id')::uuid, o.user_id, left(coalesce(o.meta->>'message',''),300),
              case when v_gift is null then o.amount end, v_gift);
    end if;
  end if;
end $function$;
