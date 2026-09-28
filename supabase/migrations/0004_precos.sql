-- =============================================================================
-- 0005_precos.sql — a fronteira que falta
-- =============================================================================
-- Esta é a que mais pesa, e a que NÃO consigo corrigir de fora: as edge
-- functions create-order e paypal-capture, e a função pay_with_wallet, vivem no
-- teu painel. Não estão no Git.
--
-- O problema que resolve:
--
--   O browser pede uma subscrição de 5000 e manda amount = 1.
--   Se o servidor acredita no amount, paga-se 1 e fica subscrito.
--   O js/pay.js já relê o preço na base de dados e ignora o amount que lhe dão
--   — mas isso é o cliente. Um curl não passa pelo cliente.
--
-- A regra: o amount que vem de fora é um PALpite. O preço é o que está na
-- linha da tabela, lido dentro da transacção que debita o dinheiro.
--
-- CORRE 0002_verificacao.sql §2 PRIMEIRO. Se o corpo da função já relê a
-- tabela, este ficheiro é só documentação. Se não relê, é a correcção.


-- -----------------------------------------------------------------------------
-- 1. Preço de cada tipo de compra, lido da fonte
-- -----------------------------------------------------------------------------
-- Uma função só, chamada pelas duas pontas (create-order e pay_with_wallet),
-- para que não possam divergir. Devolve o preço em Kwanzas já resolvido, ou
-- levanta excepção se o alvo não estiver comprável — que é o que impede comprar
-- uma publicação despublicada, um perfil suspenso ou uma live já terminada.

create or replace function public.resolve_price(
  p_kind   text,
  p_target uuid
) returns bigint
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v bigint;
begin
  if p_kind = 'subscription' then
    select c.price into v from public.creators c
      where c.id = p_target and c.status = 'approved';
    if v is null then raise exception ' subscritor indisponível.'; end if;

  elsif p_kind = 'post' then
    select p.price into v from public.posts p
      where p.id = p_target and p.status = 'published'
        and exists (select 1 from public.creators c
                    where c.id = p.creator_id and c.status = 'approved');
    if v is null then raise exception 'Publicação indisponível.'; end if;

  elsif p_kind = 'message' then
    select m.ppv_price into v from public.messages m
      where m.id = p_target and m.ppv_price is not null
        and not exists (select 1 from public.messages x
                        where x.id = m.id and x.sender_id = auth.uid());
    if v is null then raise exception 'Mensagem indisponível.'; end if;

  elsif p_kind = 'ticket' then
    select l.price into v from public.lives l
      where l.id = p_target and l.status <> 'ended';
    if v is null then raise exception 'Live indisponível.'; end if;

  else
    raise exception 'Tipo de compra desconhecido: %', p_kind;
  end if;

  if v < coalesce((select (value::bigint) from public.settings where key = 'min_price'), 0) then
    raise exception 'Abaixo do mínimo.';
  end if;

  return v;
end;
$$;

revoke execute on function public.resolve_price(text, uuid) from public, anon;


-- -----------------------------------------------------------------------------
-- 2. Como usar, dentro de pay_with_wallet
-- -----------------------------------------------------------------------------
-- A carteira é debitada pelo que a função calculou, não pelo que veio no
-- pedido. O resto do corpo (debitar, criar a compra, notificar) fica igual.
--
--   -- no início, antes de qualquer escrita:
--   perform public.assert_authenticated();   -- ou o teu "Sessão expirada."
--   v_preco := public.resolve_price(p_kind, p_target);
--
--   -- tip e topup não têm linha na tabela: validam-se contra settings
--   if p_kind = 'tip' then
--     v_preco := greatest(p_amount,
--              (select (value::bigint) from public.settings where key = 'min_tip'));
--   elsif p_kind = 'topup' then
--     v_preco := greatest(p_amount,
--              (select (value::bigint) from public.settings where key = 'min_topup'));
--   end if;
--
--   -- debitar pelo valor resolvido, e nunca pelo p_amount
--   update public.profiles
--      set wallet_balance = wallet_balance - v_preco
--    where id = auth.uid() and wallet_balance >= v_preco;
--   if not found then raise exception 'Salde insuficiente.'; end if;
--
-- A condição `wallet_balance >= v_preco` faz duas coisas de uma vez: recusa quem
-- não tem saldo, e torna a operação atómica. Duas compras em simultâneo não
-- podem gastar o mesmo Kwanza: o segundo UPDATE não encontra a linha e falha.
--
-- NOTA sobre tip e topup: aqui o valor vem mesmo do cliente, e não há tabela
-- donde o reler. A protecção é o piso: o valor nunca desce abaixo do mínimo. Se
-- o valor máximo também importa (um topup de mil milhões), acrescenta um teto
-- aqui — o frontend já limita a 2 000 000, mas isso é o cliente outra vez.


-- -----------------------------------------------------------------------------
-- 3. create-order, para PayPal
-- -----------------------------------------------------------------------------
-- A mesma ideia. O corpo da edge function tem de fazer:
--
--   const { data: preco } = await admin.rpc('resolve_price', {
--     p_kind: body.kind, p_target: body.target,
--   })
--   // e depois construir o pedido do PayPal com `preco`, nunca com body.amount
--
-- O `body.amount` pode continuar a ser aceite e ignorado, ou rejeitado com um
-- erro claro. Recusá-lo é melhor: se alguém mandar amount, recebe um erro em vez
-- de um preço diferente, e o erro é um sinal claro de que algo vai errado.
--
-- E a ordem tem de expirar a sério. O frontend mostra "válida até", mas quem
-- expira é a base de dados. Sem expiração, um link de pagamento continua a
-- valer dentro de uma semana e o preço pode já ter mudado.


-- -----------------------------------------------------------------------------
-- 4. paypal-capture tem de ser idempotente
-- -----------------------------------------------------------------------------
-- O utilizador pode recarregar a página três vezes enquanto o PayPal responde.
-- Se a captura não for idempotente, três chamadas criam três compras, ou debitam
-- três vezes.
--
-- O padrão é uma restrição única:
--
--   alter table public.orders
--     add constraint orders_paypal_capture_unico
--     unique (paypal_order_id, status) ;
--
-- Ou uma coluna capturada_em e um guarda no início da função:
--
--   update orders set captured_at = now()
--    where paypal_order_id = body.order_id and captured_at is null;
--   if not found then return { ok: true, already: true }; end if;  -- já estava
--
-- O segundo devolve o mesmo resultado ao chamador, que é o que a interface
-- espera. Devolver um erro faria o segundo clique mostrar "falhou" num pagamento
-- que na verdade deu certo.


-- -----------------------------------------------------------------------------
-- 5. Uma compra só dá acesso depois de estar paga
-- -----------------------------------------------------------------------------
-- O frontend já filtra por status = 'paid' em todo o lado. A RLS tem de fazer o
-- mesmo, senão um pedido directo ao PostgREST lê o conteúdo pago sem pagar.
--
-- O teste que fecha a porta:
--
--   --(body de uma publicação que NÃO compraste, com um token teu)
--   curl "$SUPABASE/rest/v1/post_bodies?post_id=eq.<id>" \
--     -H "apikey: <a tua anon key>" -H "Authorization: Bearer <o teu token>"
--
-- Se voltar o corpo da publicação, a RLS está aberta. Se voltar [], está fechada.
