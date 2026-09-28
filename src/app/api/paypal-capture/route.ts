/**
 * `POST /api/paypal-capture` — confirma um pagamento quando o utilizador volta
 * do PayPal.
 *
 * O PayPal redirecciona para o site depois do approve, e o `handlePaypalReturn()`
 * em `pay.ts` chama esta rota com o `order_id` (tirado do `sessionStorage`) e
 * trata a resposta assim:
 *
 *   if (r.status === 'paid') { ...abrir o conteúdo... }
 *   else { ...watch(order_id) a cada X s, à espera que o PayPal confirme... }
 *
 * Isto quer dizer que **`status` tem de vir do PayPal, nunca ser gerado aqui**.
 * É a rota onde um valor inventado custaria dinheiro a sério: um `status: 'paid'`
 * falso, ou um `paid` devolvido sem o PayPal dizer que pagou, dava acesso ao
 * conteúdo pago sem ninguém ter pago.
 *
 * O caminho certo é: `GET /v2/checkout/orders/{id}` no PayPal, e só marcar como
 * paga a ordem se o `status` que o PayPal devolve for mesmo esse — o "captura"
 * é `/v2/checkout/orders/{id}/capture`, e convém capturá-la **uma vez só**
 * (idempotente, ou então o segundo `capture` devolve 422 e o browser fica à
 * espera para sempre).
 *
 * Deve devolver qualquer estado que não seja `paid` — `pending`, `created` — e
 * nunca um erro: o browser trata o erro como falha definitiva e o `pending`
 * como "ainda a processar", e um `403` do PayPal seria mal classificado.
 */

import { exigeSessao, erro } from '@/lib/server/guarda';
import { porImplementar } from '@/lib/server/porImplementar';

export const dynamic = 'force-dynamic';

export async function POST(pedido: Request): Promise<Response> {
  const sessao = await exigeSessao(pedido);
  if (sessao instanceof Response) return sessao;
  const { user, corpo } = sessao;

  const orderId = corpo.order_id;
  if (typeof orderId !== 'string' || !orderId) {
    return erro('Falta a referência da encomenda.', 400);
  }

  // TODO(pagina): colar aqui a implementação da edge function `paypal-capture`.
  //   1. ler a ordem por `order_id` e confirmar que `orders.user_id` é o do
  //      token — sem isto, o token de um utilizador confirmava a ordem de
  //      outro, que é o bypass mais directo desta rota;
  //   2. `GET /v2/checkout/orders/{orderId}` no PayPal;
  //   3. se o `status` do PayPal for `COMPLETED`, capturar (uma vez só) e marcar
  //      a ordem como paga no servidor;
  //   4. devolver `{ status: 'paid' }` só nesse caso, e o estado real do PayPal
  //      nos restantes — nunca um erro, para o `watch()` continuar a tentar.
  void user;
  return porImplementar(
    'paypal-capture',
    "{ status: string } — 'paid' quando o PayPal confirmou; qualquer outro estado (pending/created) faz o browser continuar a vigiar",
  );
}
