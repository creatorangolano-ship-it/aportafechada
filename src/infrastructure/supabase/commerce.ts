/**
 * Adaptadores Supabase dos pagamentos: catálogo de preços, uma estratégia por
 * método e o acompanhamento de pedidos (Realtime + verificação periódica).
 */
import { sb } from './client';
import { fn } from './functions';
import type { MetodoPagamento, PayKind } from '../../domain/commerce/purchase.ts';
import type {
  CatalogoDePrecos, EstrategiaDePagamento, InicioDePagamento, Pedido, Referencia, SeguimentoDePedidos,
} from '../../application/commerce/ports.ts';

/** Onde o preço de cada tipo de compra é guardado. */
const TABELA_DE_PRECOS: Partial<Record<PayKind, { table: string; cols: string }>> = {
  subscription: { table: 'creators', cols: 'id,price,status' },
  post: { table: 'posts', cols: 'id,price,status' },
  message: { table: 'messages', cols: 'id,ppv_price' },
  ticket: { table: 'lives', cols: 'id,price,status' },
};

export const catalogoSupabase: CatalogoDePrecos = {
  async item(kind, id) {
    const spec = TABELA_DE_PRECOS[kind];
    if (!spec) return null;
    const { data, error } = await sb.from(spec.table).select(spec.cols).eq('id', id).maybeSingle();
    if (error) throw error;
    return data as never;
  },
};

/** Carteira: o servidor debita o saldo e confirma logo. */
const carteira: EstrategiaDePagamento = {
  metodo: 'wallet',
  async iniciar(p) {
    const { data, error } = await sb.rpc('pay_with_wallet', { p_kind: p.kind, p_target: p.target_id, p_amount: p.amount, p_meta: p.meta });
    if (error) throw error;
    return { tipo: 'pago', orderId: data as string };
  },
};

type RespostaCreateOrder = { order_id: string; approve_url?: string } & Partial<Referencia>;

/** Métodos que passam pela função `create-order`; só muda como se lê a resposta. */
function viaCreateOrder(metodo: Exclude<MetodoPagamento, 'wallet'>, ler: (r: RespostaCreateOrder) => InicioDePagamento): EstrategiaDePagamento {
  return {
    metodo,
    async iniciar(p: Pedido) {
      const r = await fn<RespostaCreateOrder>('create-order', {
        kind: p.kind, target_id: p.target_id, amount: p.amount, method: metodo, phone: p.telefone, meta: p.meta,
      });
      return ler(r);
    },
  };
}

/** Ordem de apresentação no ecrã de pagamento. */
export const estrategiasSupabase: EstrategiaDePagamento[] = [
  carteira,
  viaCreateOrder('mcx', (r) => ({ tipo: 'aguardar', orderId: r.order_id })),
  viaCreateOrder('reference', (r) => ({
    tipo: 'referencia', orderId: r.order_id,
    ref: { entity: r.entity!, reference: r.reference!, amount: r.amount!, expires: r.expires! },
  })),
  viaCreateOrder('paypal', (r) => ({ tipo: 'redirecionar', orderId: r.order_id, url: r.approve_url! })),
];

/** Um pedido abandonado não pode ficar a ser vigiado para sempre. */
const VIGIAR_NO_MAXIMO_MS = 30 * 60 * 1000;
const VERIFICAR_A_CADA_MS = 6000;

export const seguimentoSupabase: SeguimentoDePedidos = {
  observar(orderId, aoMudar) {
    const canal = sb.channel('order-' + orderId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (x) => aoMudar(String((x.new as { status?: string }).status)))
      .subscribe();
    // Reserva para quando o Realtime falha (rede móvel, separador em segundo plano).
    const intervalo = setInterval(async () => {
      const { data } = await sb.from('orders').select('status').eq('id', orderId).maybeSingle();
      if (data) aoMudar(String((data as { status: string }).status));
    }, VERIFICAR_A_CADA_MS);
    const parar = () => { clearInterval(intervalo); clearTimeout(limite); void sb.removeChannel(canal); };
    const limite = setTimeout(parar, VIGIAR_NO_MAXIMO_MS);
    return parar;
  },
  async capturarPaypal(orderId) {
    const r = await fn<{ status: string }>('paypal-capture', { order_id: orderId });
    return r.status;
  },
};
