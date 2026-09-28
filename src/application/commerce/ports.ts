/**
 * Portas dos pagamentos.
 */
import type { ItemAVenda, MetodoPagamento, PayKind } from '../../domain/commerce/purchase.ts';

/** O que se está a pagar. `amount` só conta em gorjetas e carregamentos. */
export type Pedido = {
  kind: PayKind;
  target_id: string | null;
  amount: number | null;
  meta: Record<string, unknown>;
  /** Número Multicaixa Express já validado (9 dígitos). */
  telefone?: string;
};

export type Referencia = { entity: string; reference: string | number; amount: number; expires: string };

/** Como o pagamento continua depois de iniciado, conforme o método. */
export type InicioDePagamento =
  | { tipo: 'pago'; orderId: string }                          // carteira: já está pago
  | { tipo: 'aguardar'; orderId: string }                      // Multicaixa Express: aprovar na app
  | { tipo: 'referencia'; orderId: string; ref: Referencia }   // ATM / internet banking
  | { tipo: 'redirecionar'; orderId: string; url: string };    // PayPal

/** Um método de pagamento (padrão Strategy): cada um sabe iniciar o seu fluxo. */
export interface EstrategiaDePagamento {
  readonly metodo: MetodoPagamento;
  iniciar(p: Pedido): Promise<InicioDePagamento>;
}

/** Onde se relê o preço e o estado do que está à venda. */
export interface CatalogoDePrecos {
  item(kind: PayKind, id: string): Promise<ItemAVenda | null>;
}

/**
 * Acompanhamento de pedidos (padrão Observer): avisa sempre que o estado do
 * pedido muda. Devolve a função que deixa de observar.
 */
export interface SeguimentoDePedidos {
  observar(orderId: string, aoMudar: (estado: string) => void): () => void;
  /** Confirma um pagamento PayPal no regresso; devolve o estado real ('paid', 'pending'…). */
  capturarPaypal(orderId: string): Promise<string>;
}
