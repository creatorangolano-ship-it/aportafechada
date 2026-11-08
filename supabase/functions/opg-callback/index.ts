// Resultado de um pagamento Multicaixa Express (ProxyPay OPG).
// O URL de retorno é gerado em create-order e leva uma assinatura própria (?sig=).
//
// Segurança (2026-11-08): o estado e o valor vêm SEMPRE da consulta à ProxyPay, nunca do
// corpo da notificação (que não vem assinado). Se a ProxyPay não responder, devolve 503
// e a ProxyPay volta a tentar mais tarde; nada é entregue sem confirmação.
import { admin, env, fulfill, hmacHex, safeEqual } from "./_shared/util.ts";
import { opgGet } from "./_shared/proxypay.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("order") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (!orderId || !safeEqual(sig, await hmacHex(env("CALLBACK_SECRET"), orderId))) {
    return new Response("assinatura inválida", { status: 401 });
  }

  const db = admin();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).eq("method", "mcx").maybeSingle();
  if (!order) return new Response("ok");
  if (order.status !== "pending") return new Response("ok");
  if (!order.provider_ref) return new Response("sem transação", { status: 503 });

  const confirmed = await opgGet(order.provider_ref);
  if (!confirmed) return new Response("ProxyPay sem resposta", { status: 503 });
  const status = String(confirmed.status ?? "");
  await db.from("orders").update({ provider_data: { ...order.provider_data, tx: confirmed } }).eq("id", order.id);

  if (status === "accepted") {
    const pago = Math.round(Number(confirmed.amount ?? 0));
    if (pago < order.amount) {
      console.error("opg-callback: valor pago inferior", order.id, pago, order.amount);
      return new Response("ok");
    }
    try { await fulfill(order.id); } catch (e) { console.error(e); return new Response("erro", { status: 500 }); }
  } else if (status === "rejected") {
    await db.from("orders").update({ status: "failed" }).eq("id", order.id);
  }
  return new Response("ok");
});
