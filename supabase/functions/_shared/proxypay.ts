// ProxyPay (Angola): referências Multicaixa (RPS v2) e Multicaixa Express (OPG v1)
// Documentação: https://developer.proxypay.co.ao/rps/v2/  e  https://developer.proxypay.co.ao/opg/v1/
import { env } from "./util.ts";

function base(): string {
  return Deno.env.get("PROXYPAY_ENV") === "production"
    ? "https://api.proxypay.co.ao"
    : "https://api.sandbox.proxypay.co.ao";
}

function rpsHeaders(json = false): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Token ${env("PROXYPAY_API_KEY")}`,
    Accept: "application/vnd.proxypay.v2+json",
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

/** Cria uma referência Multicaixa para o valor indicado. Devolve o número da referência. */
export async function createReference(amountKz: number, orderId: string, days: number): Promise<{ reference: string; expires: string }> {
  const idRes = await fetch(`${base()}/reference_ids`, { method: "POST", headers: rpsHeaders() });
  if (!idRes.ok) throw new Error(`ProxyPay reference_ids ${idRes.status}: ${await idRes.text()}`);
  const reference = String(await idRes.json());

  const end = new Date(Date.now() + days * 86400000);
  const expires = end.toISOString().slice(0, 10); // AAAA-MM-DD
  const res = await fetch(`${base()}/references/${reference}`, {
    method: "PUT",
    headers: rpsHeaders(true),
    body: JSON.stringify({
      amount: amountKz.toFixed(2),
      end_datetime: expires,
      custom_fields: { order_id: orderId },
    }),
  });
  if (!res.ok) throw new Error(`ProxyPay references ${res.status}: ${await res.text()}`);
  return { reference, expires };
}

/** Confirma a receção de um pagamento (retira-o da fila da ProxyPay). */
export async function ackPayment(paymentId: string | number): Promise<void> {
  const res = await fetch(`${base()}/payments/${paymentId}`, { method: "DELETE", headers: rpsHeaders() });
  if (!res.ok && res.status !== 404) console.error("ProxyPay ack falhou", res.status, await res.text());
}

function opgHeaders(idempotencyKey?: string): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${env("PROXYPAY_OPG_TOKEN")}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (idempotencyKey) h["Idempotency-Key"] = idempotencyKey;
  return h;
}

/** Pede um pagamento Multicaixa Express para o número de telemóvel do cliente. */
export async function opgPayment(amountKz: number, mobile: string, orderId: string, callbackUrl: string): Promise<{ id: string }> {
  const prefix = Deno.env.get("PROXYPAY_MOBILE_PREFIX") ?? ""; // confirmar com a ProxyPay se o número leva 244
  const res = await fetch(`${base()}/opg/v1/transactions`, {
    method: "POST",
    headers: opgHeaders(orderId),
    body: JSON.stringify({
      type: "payment",
      pos_id: Number(env("PROXYPAY_POS_ID")),
      mobile: prefix + mobile,
      amount: amountKz.toFixed(2),
      callback_url: callbackUrl,
    }),
  });
  if (!res.ok) throw new Error(`ProxyPay OPG ${res.status}: ${await res.text()}`);
  const tx = await res.json();
  return { id: String(tx.id) };
}

/** Lê o estado atual de uma transação OPG (para confirmar a notificação). */
export async function opgGet(txId: string): Promise<{ status?: string; amount?: string } | null> {
  const res = await fetch(`${base()}/opg/v1/transactions/${txId}`, { headers: opgHeaders() });
  if (!res.ok) return null;
  return await res.json();
}
