// Avisos da kursiPay (webhooks): payment.paid, payment.failed, payment.expired…
//
// Segurança:
// 1. A assinatura KursiPay-Signature (HMAC-SHA256 de "<t>.<corpo bruto>" com KURSIPAY_WEBHOOK_SECRET)
//    é verificada em tempo constante, e avisos com mais de 5 minutos são rejeitados (repetição).
// 2. Mesmo com a assinatura certa, o estado é relido na API da kursiPay (GET /v1/payments/:id)
//    antes de entregar seja o que for; o pedido tem de ter este pagamento como provider_ref.
// 3. fulfill_order é idempotente: avisos repetidos não entregam duas vezes.
import { admin, env, fulfill, hmacHex, safeEqual } from "./_shared/util.ts";
import { obterPagamento } from "./_shared/kursipay.ts";

const ok = () => new Response(null, { status: 200 });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("método não permitido", { status: 405 });
  const corpo = await req.text();
  const cab = req.headers.get("kursipay-signature") ?? "";
  const partes: Record<string, string> = {};
  for (const p of cab.split(",")) {
    const i = p.indexOf("=");
    if (i > 0) partes[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  const t = Number(partes.t);
  const esperado = await hmacHex(env("KURSIPAY_WEBHOOK_SECRET"), `${partes.t}.${corpo}`);
  if (!partes.v1 || !safeEqual(esperado, partes.v1) || !Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) {
    return new Response("assinatura inválida", { status: 400 });
  }

  let evento: { id?: string; type?: string; data?: { object?: { id?: string; externalReference?: string } } };
  try { evento = JSON.parse(corpo); } catch { return new Response("corpo inválido", { status: 400 }); }
  const tipo = String(evento.type ?? "");
  if (!tipo.startsWith("payment.")) return ok();
  const payId = String(evento.data?.object?.id ?? "");
  const orderId = String(evento.data?.object?.externalReference ?? "");
  if (!payId || !/^[0-9a-f-]{36}$/i.test(orderId)) return ok();

  const db = admin();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order || order.provider_ref !== payId) {
    console.error("kursipay-webhook: pedido desconhecido", orderId, payId);
    return ok();
  }
  if (order.status === "paid") return ok();

  let pag;
  try { pag = await obterPagamento(payId); } catch (e) {
    console.error("kursipay-webhook: kursiPay sem resposta", e);
    return new Response("kursiPay sem resposta", { status: 503 }); // a kursiPay volta a tentar
  }
  if (pag.externalReference && pag.externalReference !== order.id) return ok();

  await db.from("orders").update({
    provider_data: { ...(order.provider_data ?? {}), status: pag.status, paid_method: pag.method ?? null, event: evento.id ?? null },
  }).eq("id", order.id);

  if (pag.status === "paid") {
    const v = pag.amount;
    if (v && v.currency === "AOA" && v.amount < Math.round(order.amount) * 100) {
      console.error("kursipay-webhook: valor pago inferior", order.id, v.amount, order.amount);
      return ok();
    }
    try { await fulfill(order.id); } catch (e) { console.error(e); return new Response("erro", { status: 500 }); }
  } else if (order.status === "pending" && ["failed", "canceled"].includes(pag.status)) {
    await db.from("orders").update({ status: "failed" }).eq("id", order.id);
  } else if (order.status === "pending" && pag.status === "expired") {
    await db.from("orders").update({ status: "expired" }).eq("id", order.id);
  }
  return ok();
});
