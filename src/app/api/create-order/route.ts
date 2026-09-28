/**
 * `POST /api/create-order` — cria um pagamento e devolve o que o browser precisa
 * para seguir o método escolhido.
 *
 * O `pay.ts` chama isto para tudo o que não seja carteira (`p.method === 'wallet'`
 * vai directo ao RPC `pay_with_wallet`), e o corpo é sempre:
 *
 *   { kind, target_id, amount, method, phone, meta }
 *
 * `method` decide o formato da resposta, e o `pay.ts` consome um campo diferente
 * em cada caso:
 *
 *  - `paypal`     → `{ order_id, approve_url }` e o browser navega para o
 *                   `approve_url`, guardando `order_id` em `sessionStorage`.
 *  - `reference`  → `{ order_id, entity, reference, amount, expires }` para
 *                   mostrar a referência de transferência.
 *  - o resto      → `{ order_id }` e o browser fica a vigiar com `watch(order_id)`.
 *
 * **O preço tem de ser relido do servidor.** O `amount` que vem no corpo é o que
 * o browser *disse*; a `PRICE_TABLE` em `pay.ts` é só para mostrar o valor
 * enquanto o utilizador escolhe. Se esta rota confiar no `amount`, qualquer
 * pessoa paga 1 Kz por uma subscrição anual — basta abrir o DevTools e mudar o
 * número. A fonte da verdade é a tabela (`subscriptions`, `posts`, `purchases`),
 * lida com a `service_role`, e o que o corpo manda é *qual* coisa, não
 * *quanto* custa.
 *
 * Esta é a rota mais atacada das cinco. Vale a pena reler
 * `supabase/AUDITORIA.md` antes de a implementar.
 */

import { exigeSessao, erro } from '@/infrastructure/server/guarda';
import { porImplementar } from '@/infrastructure/server/porImplementar';

export const dynamic = 'force-dynamic';

/** Os mesmos valores que `PayKind`, em `types.ts`. */
const METODOS = ['paypal', 'reference', 'multibanco', 'transferencia', 'app'] as const;
const TIPOS = ['subscription', 'post', 'message', 'ticket', 'tip', 'topup'] as const;

export async function POST(pedido: Request): Promise<Response> {
  const sessao = await exigeSessao(pedido);
  if (sessao instanceof Response) return sessao;
  const { user, corpo } = sessao;

  const { kind, target_id, amount, method, phone, meta } = corpo;

  if (typeof kind !== 'string' || !(TIPOS as readonly string[]).includes(kind)) {
    return erro('Tipo de compra desconhecido.', 400);
  }
  if (typeof method !== 'string' || !(METODOS as readonly string[]).includes(method)) {
    return erro('Método de pagamento desconhecido.', 400);
  }
  if (target_id !== null && typeof target_id !== 'string') {
    return erro('Alvo inválido.', 400);
  }
  // `amount` só é válido para `tip` e `topup` — as demais coisas têm preço fixo
  // na tabela. Mesmo aqui, é o valor *pedido*, não o valor cobrado.
  if (amount !== null && amount !== undefined && typeof amount !== 'number') {
    return erro('Valor inválido.', 400);
  }
  if (kind !== 'tip' && kind !== 'topup' && amount) {
    return erro('Este tipo de compra não aceita valor livre.', 400);
  }

  // TODO(pagina): colar aqui a implementação da edge function `create-order`.
  // A ordem das operações não é livre:
  //   1. reler o preço do servidor (a `PRICE_TABLE` de `pay.ts` é só de ecrã);
  //   2. validar limites da tabela `settings` (`min_price`, `min_tip`,
  //      `min_topup`) e o saldo, se for `tip` com a carteira;
  //   3. inserir em `orders` com o `user_id` do token — **nunca** com um
  //      `user_id` do corpo;
  //   4. chamar o PayPal (`/v2/checkout/orders`) se for `paypal`;
  //   5. devolver só o que o `pay.ts` lê para este `method`.
  //
  // `PAYPAL_CLIENT_ID` e `PAYPAL_SECRET` leem-se do `process.env`.
  void user;
  void phone;
  void meta;
  return porImplementar(
    'create-order',
    '{ order_id, approve_url?, entity?, reference?, amount?, expires? } — o pay.ts lê approve_url para paypal, e entity/reference/amount/expires para referência',
  );
}
