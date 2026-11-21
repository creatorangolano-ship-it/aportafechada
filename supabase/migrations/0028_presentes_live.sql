-- Presentes nas lives (como no TikTok / Instagram): cada presente tem um preço fixo em Kz.
--
-- • `live_gifts` é o catálogo. O preço vive só aqui: o valor que o navegador envia é ignorado.
-- • Um presente é uma gorjeta (`orders.kind = 'tip'`) com `meta.gift` e `meta.live_id`:
--   entra na mesma divisão de receita (`split_revenue`) e no mesmo livro de movimentos.
-- • Só se paga com o saldo da carteira (um toque, sem sair da live), e só com a live no ar.
-- • A linha do chat ganha a coluna `gift`, para todos verem a animação em tempo real.
--   A política de escrita do chat passa a recusar `gift` vindo do navegador (como já fazia com `tip_amount`).

create table if not exists public.live_gifts (
  key        text primary key,
  name       text not null,
  icon       text not null,
  price      integer not null check (price > 0),
  sort       integer not null default 0,
  active     boolean not null default true
);
alter table public.live_gifts enable row level security;
drop policy if exists live_gifts_read on public.live_gifts;
create policy live_gifts_read on public.live_gifts for select using (true);
grant select on public.live_gifts to anon, authenticated;

insert into public.live_gifts (key, name, icon, price, sort) values
  ('rosa',      'Rosa',        '🌹',    100, 1),
  ('beijo',     'Beijo',       '💋',    250, 2),
  ('gelada',    'Gelada',      '🍺',    500, 3),
  ('coracao',   'Coração',     '❤️‍🔥', 1000, 4),
  ('champanhe', 'Champanhe',   '🍾',   2500, 5),
  ('anel',      'Anel',        '💍',   5000, 6),
  ('coroa',     'Coroa',       '👑',  10000, 7),
  ('leao',      'Leão',        '🦁',  25000, 8),
  ('diamante',  'Diamante',    '💎',  50000, 9)
on conflict (key) do nothing;

alter table public.live_chat add column if not exists gift text references public.live_gifts(key);

drop policy if exists live_chat_insert on public.live_chat;
create policy live_chat_insert on public.live_chat for insert with check (
  user_id = auth.uid() and tip_amount is null and gift is null and can_join_live(live_id)
  and exists (select 1 from lives l where l.id = live_chat.live_id and l.status = 'live'));

-- Preço do presente lido no servidor; o resto dos pedidos continua a passar por order_price.
create or replace function public.create_order(p_user uuid, p_kind text, p_target uuid, p_amount integer, p_method text, p_meta jsonb default '{}'::jsonb)
 returns orders language plpgsql security definer set search_path to 'public'
as $function$
declare v_price record; v_order orders; v_gift live_gifts; v_live uuid;
begin
  if p_kind = 'tip' and coalesce(p_meta,'{}') ? 'gift' then
    select * into v_gift from live_gifts where key = p_meta->>'gift' and active;
    if v_gift.key is null then raise exception 'Este presente já não está disponível.'; end if;
    if p_method <> 'wallet' then raise exception 'Os presentes são pagos com o saldo da carteira.'; end if;
    begin v_live := (p_meta->>'live_id')::uuid; exception when others then v_live := null; end;
    if v_live is null or not exists (
        select 1 from lives l join creators c on c.id = l.creator_id
        where l.id = v_live and l.creator_id = p_target and l.status = 'live' and c.status = 'approved') then
      raise exception 'Esta live já não está no ar.';
    end if;
    if p_target = p_user then raise exception 'Não podes enviar presentes a ti próprio.'; end if;
    if not can_join_live(v_live) then raise exception 'Precisas de bilhete para esta live.'; end if;
    insert into orders (user_id, kind, target_id, creator_id, amount, method, meta)
    values (p_user, 'tip', p_target, p_target, v_gift.price, p_method,
            jsonb_build_object('gift', v_gift.key, 'live_id', v_live))
    returning * into v_order;
    return v_order;
  end if;
  select * into v_price from order_price(p_kind, p_target, p_amount, p_user);
  insert into orders (user_id, kind, target_id, creator_id, amount, method, meta)
  values (p_user, p_kind, p_target, v_price.creator, v_price.amount, p_method, coalesce(p_meta,'{}'))
  returning * into v_order;
  return v_order;
end $function$;

create or replace function public.pay_with_wallet(p_kind text, p_target uuid, p_amount integer default null::integer, p_meta jsonb default '{}'::jsonb)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); o orders; v_bal bigint;
begin
  if v_uid is null then raise exception 'Sessão expirada.'; end if;
  if p_kind = 'topup' then raise exception 'Não podes carregar a carteira com a própria carteira.'; end if;
  o := create_order(v_uid, p_kind, p_target, p_amount, 'wallet', p_meta);
  select wallet_balance into v_bal from profiles where id = v_uid for update;
  if v_bal < o.amount then raise exception 'Saldo insuficiente. Carrega a carteira ou escolhe outro método.'; end if;
  update profiles set wallet_balance = wallet_balance - o.amount where id = v_uid;
  insert into wallet_tx (user_id, amount, description, order_id) values (v_uid, -o.amount,
    case when o.meta ? 'gift' then 'Presente na live'
      else case p_kind when 'subscription' then 'Subscrição' when 'post' then 'Compra de publicação'
      when 'message' then 'Mensagem paga' when 'ticket' then 'Bilhete de live' else 'Gorjeta' end end, o.id);
  perform fulfill_order(o.id);
  return o.id;
end $function$;

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
