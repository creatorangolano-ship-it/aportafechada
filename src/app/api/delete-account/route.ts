/**
 * `POST /api/delete-account` — apaga a conta e tudo o que lhe pertence.
 *
 * O `account.ts` chama isto depois de o utilizador escrever `ELIMINAR` no campo
 * de confirmação:
 *
 *   if (typed !== 'ELIMINAR') return showErr('#delErr', '...');
 *   await fn('delete-account', { confirm: typed });
 *   closeModal(); await sb.auth.signOut();
 *
 * Repara no que o browser **não** manda: o id do utilizador. Sai do token. É
 * por isso que a rota pode usar `exigeSessao()` — e é também por isso que a
 * sessão tem de morrer no servidor. Um `deleteUser()` só apaga a linha de
 * `auth.users`; o `profiles`, as publicações, as mensagens, as subscrições e o
 * saldo da carteira na base de dados continuam lá, órfãos e — no caso do saldo —
 * ainda associados ao id que já não existe.
 *
 * Duas coisas a não perder de vista na implementação:
 *
 *  1. **`confirm` tem de ser verificado aqui, não só no browser.** O campo de
 *     confirmação é do lado do cliente; escrevê-lo no `account.ts` não impede
 *     nada. Um `POST` directo com `{ confirm: 'ELIMINAR' }` tem de passar, e um
 *     sem ele tem de ser recusado — a verificação é o que separa um clique
 *     acidental de uma conta apagada.
 *  2. **O saldo da carteira tem de ser resolvido antes de a conta poder
 *     desaparecer.** Apagar o perfil de alguém com dinheiro por levantar é o
 *     pior resultado possível desta rota. Ou bloqueia, ou o `min_payout` é
 *     honrado primeiro.
 */

import { exigeSessao, erro } from '@/infrastructure/server/guarda';
import { porImplementar } from '@/infrastructure/server/porImplementar';

export const dynamic = 'force-dynamic';

/** A frase tem de bater certo: maiúsculas, sem espaços nas pontas. */
const FRASE = 'ELIMINAR';

export async function POST(pedido: Request): Promise<Response> {
  const sessao = await exigeSessao(pedido);
  if (sessao instanceof Response) return sessao;
  const { user, corpo } = sessao;
  const { confirm } = corpo;

  // O browser já verificou isto, mas o browser não é a fronteira. Um pedido sem
  // a frase tem de ser recusado aqui, senão basta um `fetch` e a conta vai-se.
  if (confirm !== FRASE) {
    return erro(`Escreve ${FRASE} em maiúsculas para confirmar.`, 400);
  }

  // TODO(pagina): colar aqui a implementação da edge function `delete-account`.
  // Por esta ordem, e por causa dela:
  //   1. com a `service_role`, ver `wallet_balance` e `earnings_balance` do
  //      `user.id`. Se houver saldo por levantar, recusar com uma mensagem
  //      clara em vez de o apagar — ou pedir o levantamento primeiro;
  //   2. apagar as linhas dependentes (posts, messages, purchases, subscriptions,
  //      promos, notificações, o que mais a auditoria apanhar) e os ficheiros
  //      nos buckets `content` e `messages`;
  //   3. só então `auth.admin.deleteUser(user.id)`.
  // Ao contrário — `deleteUser` primeiro — as linhas órfãs ficam sem dono
  // nenhum e não há como saber de quem eram.
  void user;
  return porImplementar(
    'delete-account',
    '{} — devolve sucesso e o browser faz signOut; apaga profile, posts, messages, purchases, subscriptions e ficheiros',
  );
}
