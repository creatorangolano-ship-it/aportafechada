/**
 * Compras: o que se pode comprar, a que preço e com que método.
 *
 * O preço de subscrições, publicações, mensagens pagas e bilhetes vem sempre da
 * base de dados, nunca do ecrã. O servidor volta a confirmar (RLS +
 * create-order), mas o cliente deixa de oferecer o valor errado a quem adultere
 * o DOM.
 */
import { erroValorLivre } from '../shared/money.ts';
import { ErroDeRegra } from '../shared/errors.ts';

/** O que está a ser comprado. Determina de onde o preço é relido. */
export type PayKind = 'subscription' | 'post' | 'message' | 'ticket' | 'tip' | 'topup';
export type MetodoPagamento = 'wallet' | 'mcx' | 'reference' | 'paypal';

/** Tipos com preço fixo, guardado na base de dados. Gorjeta e carregamento têm valor livre. */
export const TEM_PRECO_FIXO: ReadonlySet<PayKind> = new Set(['subscription', 'post', 'message', 'ticket']);

/** Erro de regra de negócio: a mensagem é para o utilizador ler. */
export class ErroDeCompra extends ErroDeRegra {}

/** O que o catálogo devolve sobre o item a comprar (só os campos que a regra precisa). */
export type ItemAVenda = { status?: string | null; price?: number | null; ppv_price?: number | null };

/**
 * Decide se o item pode ser comprado e a que preço. Atira `ErroDeCompra` quando
 * não pode: comprar uma publicação em rascunho ou o bilhete de uma live terminada
 * cobrava o dinheiro e não entregava nada.
 */
export function precoDeVenda(kind: PayKind, item: ItemAVenda | null): number {
  if (!item) throw new ErroDeCompra('Este conteúdo já não existe.');
  if (kind === 'subscription' && item.status !== 'approved') throw new ErroDeCompra('Este perfil não está disponível para subscrição.');
  if (kind === 'post' && item.status !== 'published') throw new ErroDeCompra('Esta publicação não está disponível.');
  if (kind === 'message' && !item.ppv_price) throw new ErroDeCompra('Este conteúdo já não está à venda.');
  if (kind === 'ticket' && (item.status === 'ended' || !item.price)) throw new ErroDeCompra('Esta live já não está disponível.');
  const preco = Number(kind === 'message' ? item.ppv_price : item.price);
  if (!Number.isFinite(preco) || preco <= 0) throw new ErroDeCompra('O preço deste conteúdo não está disponível.');
  return Math.round(preco);
}

/** Valida o valor de uma gorjeta ou carregamento contra o mínimo das definições. */
export function valorLivre(kind: PayKind, valor: number, minimos: { min_tip: number; min_topup: number }): number {
  const erro = erroValorLivre(valor, kind === 'tip' ? minimos.min_tip : minimos.min_topup);
  if (erro) throw new ErroDeCompra(erro);
  return valor;
}

/** Métodos que fazem sentido para esta compra: carregar a carteira com a própria carteira não. */
export const metodosPara = (kind: PayKind, todos: readonly MetodoPagamento[]): MetodoPagamento[] =>
  todos.filter((m) => !(m === 'wallet' && kind === 'topup'));

/** Método sugerido ao abrir o pagamento: a carteira, se tiver saldo que chegue. */
export const metodoInicial = (kind: PayKind, saldo: number, valor: number): MetodoPagamento =>
  kind !== 'topup' && saldo >= valor ? 'wallet' : 'mcx';

/** Número Multicaixa Express: 9 dígitos a começar por 9, com ou sem o indicativo 244. */
export function telefoneMcx(raw: string): string | null {
  const v = raw.replace(/\D/g, '').replace(/^244/, '');
  return /^9\d{8}$/.test(v) ? v : null;
}
