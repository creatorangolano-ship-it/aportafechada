/**
 * Casos de uso dos pagamentos.
 *
 * - `cotar`: quanto custa, relido do catálogo (nunca do ecrã) e validado pelo domínio;
 * - `iniciar`: escolhe a estratégia do método e arranca o fluxo;
 * - `observar` / `capturarPaypal`: acompanham o pedido até ficar pago.
 */
import {
  ErroDeCompra, TEM_PRECO_FIXO, metodosPara, precoDeVenda, telefoneMcx, valorLivre,
  type MetodoPagamento, type PayKind,
} from '../../domain/commerce/purchase.ts';
import type { CatalogoDePrecos, EstrategiaDePagamento, InicioDePagamento, Pedido, SeguimentoDePedidos } from './ports.ts';

export class Pagamentos {
  readonly #catalogo: CatalogoDePrecos;
  readonly #estrategias: Map<MetodoPagamento, EstrategiaDePagamento>;
  readonly #seguimento: SeguimentoDePedidos;

  constructor(catalogo: CatalogoDePrecos, estrategias: EstrategiaDePagamento[], seguimento: SeguimentoDePedidos) {
    this.#catalogo = catalogo;
    this.#estrategias = new Map(estrategias.map((e) => [e.metodo, e]));
    this.#seguimento = seguimento;
  }

  /** Preço a cobrar. `valorPedido` só é respeitado em gorjetas e carregamentos. */
  async cotar(kind: PayKind, targetId: string | null | undefined, valorPedido: number | null | undefined,
    minimos: { min_tip: number; min_topup: number }): Promise<number> {
    if (TEM_PRECO_FIXO.has(kind)) {
      if (!targetId) throw new ErroDeCompra('Falta o alvo da compra.');
      return precoDeVenda(kind, await this.#catalogo.item(kind, targetId));
    }
    return valorLivre(kind, Number(valorPedido), minimos);
  }

  /** Métodos disponíveis para esta compra, pela ordem em que foram registados. */
  metodos(kind: PayKind): MetodoPagamento[] {
    return metodosPara(kind, [...this.#estrategias.keys()]);
  }

  async iniciar(metodo: MetodoPagamento, pedido: Pedido): Promise<InicioDePagamento> {
    const estrategia = this.#estrategias.get(metodo);
    if (!estrategia || !this.metodos(pedido.kind).includes(metodo)) throw new ErroDeCompra('Método de pagamento indisponível.');
    if (metodo === 'mcx') {
      const tel = telefoneMcx(pedido.telefone ?? '');
      if (!tel) throw new ErroDeCompra('Escreve um número angolano com 9 dígitos, a começar por 9.');
      pedido = { ...pedido, telefone: tel };
    }
    return estrategia.iniciar(pedido);
  }

  observar(orderId: string, aoMudar: (estado: string) => void): () => void {
    return this.#seguimento.observar(orderId, aoMudar);
  }

  capturarPaypal(orderId: string): Promise<string> {
    return this.#seguimento.capturarPaypal(orderId);
  }
}
