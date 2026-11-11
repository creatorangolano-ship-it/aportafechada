// kursiPay (Angola): Multicaixa Express, Referência, PayPay, cartão Visa/Mastercard (USD) e Pix (BRL).
// Documentação: https://www.kursipay.com/docs  (versão para máquinas: https://www.kursipay.com/llms.txt)
//
// - A chave secreta (KURSIPAY_SECRET_KEY, kp_test_sk_… ou kp_live_sk_…) decide o ambiente.
// - Valores em cêntimos: 2 500 Kz = { amount: 250000, currency: "AOA" }.
// - Multicaixa Express e Referência usam a cobrança direta (o comprador fica no site).
//   Em produção a cobrança direta tem de ser ativada pela kursiPay; enquanto não estiver,
//   a API responde 403 e caímos no checkout hospedado, que funciona sempre.
// - PayPay, cartão e Pix usam sempre o checkout hospedado.
import { env } from "./util.ts";

const API = "https://api.kursipay.com/v1";
const SITE = "https://kursipay.com";

export type MetodoKp = "multicaixa_express" | "reference" | "paypay" | "card" | "pix";
export type PagamentoKp = {
  id: string;
  status: string;
  outcome?: string;
  amount?: { amount: number; currency: string };
  method?: string;
  externalReference?: string;
  checkoutUrl?: string;
  methodDetails?: { type?: string; entity?: string; reference?: string; dueAt?: string };
  expiresAt?: string;
};

export class ErroKp extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

async function pedido<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env("KURSIPAY_SECRET_KEY")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const txt = await res.text();
  let body: any = null;
  try { body = txt ? JSON.parse(txt) : null; } catch { /* sem JSON */ }
  if (!res.ok) throw new ErroKp(res.status, body?.error?.code ?? "http_" + res.status, body?.error?.message ?? txt.slice(0, 200));
  return body as T;
}

type Base = { orderId: string; amountKz: number; description: string };

/** Checkout hospedado com um só método permitido. */
export function criarCheckout(o: Base & { metodo: MetodoKp }): Promise<PagamentoKp> {
  return pedido<PagamentoKp>("/payments", {
    method: "POST",
    headers: { "Idempotency-Key": `apf-${o.orderId}-checkout` },
    body: JSON.stringify({
      amount: { amount: Math.round(o.amountKz) * 100, currency: "AOA" },
      description: o.description.slice(0, 200),
      allowedMethods: [o.metodo],
      externalReference: o.orderId,
      metadata: { order_id: o.orderId },
    }),
  });
}

/** Cobrança direta: Multicaixa Express (sem esperar pela resposta) ou Referência. */
export function cobrarDireto(o: Base & { metodo: "multicaixa_express" | "reference"; telefone?: string }): Promise<PagamentoKp> {
  return pedido<PagamentoKp>("/payments", {
    method: "POST",
    headers: { "Idempotency-Key": `apf-${o.orderId}-direto` },
    body: JSON.stringify({
      amount: { amount: Math.round(o.amountKz) * 100, currency: "AOA" },
      description: o.description.slice(0, 200),
      externalReference: o.orderId,
      metadata: { order_id: o.orderId },
      method: o.metodo,
      ...(o.metodo === "multicaixa_express" ? { payer: { phone: "+244" + o.telefone }, wait: false } : {}),
    }),
  });
}

/** Lê o pagamento na kursiPay (fonte da verdade para entregar o conteúdo). */
export function obterPagamento(id: string): Promise<PagamentoKp> {
  return pedido<PagamentoKp>(`/payments/${encodeURIComponent(id)}`);
}

export const urlCheckout = (p: PagamentoKp): string => new URL(p.checkoutUrl ?? "", SITE).toString();
