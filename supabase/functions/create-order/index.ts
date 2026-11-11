// Cria um pedido de pagamento externo. Pagamentos com a carteira não passam por aqui
// (usam a função SQL pay_with_wallet).
//
// Métodos (2026-11-12): todos pela kursiPay, exceto o PayPal (mantido, sem chaves).
//   mcx        → cobrança direta Multicaixa Express (aprovação na app); sem ativação → checkout
//   reference  → cobrança direta por Referência (entidade + referência);  sem ativação → checkout
//   paypay, card, pix → checkout hospedado da kursiPay
// O preço vem sempre de create_order (base de dados), nunca do corpo do pedido.
import { admin, env, getUser, handleOptions, json, settings } from "./_shared/util.ts";
import { cobrarDireto, criarCheckout, ErroKp, urlCheckout, type MetodoKp } from "./_shared/kursipay.ts";
import { createPaypalOrder } from "./_shared/paypal.ts";

const LABEL: Record<string, string> = {
  topup: "Carregamento da carteira", subscription: "Subscrição", post: "Publicação",
  tip: "Gorjeta", ticket: "Bilhete de live", message: "Mensagem paga",
};
const KP: Record<string, MetodoKp> = {
  mcx: "multicaixa_express", reference: "reference", paypay: "paypay", card: "card", pix: "pix",
};

const dataPt = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  // Hora de Angola (UTC+1)
  const a = new Date(d.getTime() + 3600_000);
  return `${p(a.getUTCDate())}/${p(a.getUTCMonth() + 1)}/${a.getUTCFullYear()} às ${p(a.getUTCHours())}:${p(a.getUTCMinutes())}`;
};

Deno.serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre;
  const user = await getUser(req);
  if (!user) return json({ error: "A tua sessão expirou. Entra outra vez." }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Pedido inválido." }, 400); }
  const kind = String(body.kind ?? "");
  const method = String(body.method ?? "");
  const target = (body.target_id as string) ?? null;
  const amount = body.amount == null ? null : Math.round(Number(body.amount));
  const meta = (body.meta && typeof body.meta === "object") ? body.meta : {};

  if (!(method in KP) && method !== "paypal") return json({ error: "Método de pagamento inválido." }, 400);
  const phone = String(body.phone ?? "").replace(/\D/g, "").replace(/^244/, "");
  if (method === "mcx" && !/^9\d{8}$/.test(phone)) return json({ error: "Escreve um número angolano com 9 dígitos, a começar por 9." }, 400);

  const db = admin();
  const { data: order, error } = await db.rpc("create_order", {
    p_user: user.id, p_kind: kind, p_target: target, p_amount: amount, p_method: method, p_meta: meta,
  });
  if (error || !order) return json({ error: error?.message ?? "Não foi possível criar o pedido." }, 400);

  const description = `${LABEL[kind] ?? "Pagamento"} · A Porta Fechada`;
  const guardar = (provider_ref: string, provider_data: Record<string, unknown>) =>
    db.from("orders").update({ provider_ref, provider_data: { provider: "kursipay", ...provider_data } }).eq("id", order.id);

  try {
    if (method in KP) {
      const base = { orderId: order.id, amountKz: order.amount, description };

      if (method === "mcx" || method === "reference") {
        try {
          const p = await cobrarDireto({ ...base, metodo: KP[method] as "multicaixa_express" | "reference", telefone: phone });
          if (method === "mcx") {
            if (p.status === "failed") {
              await db.from("orders").update({ status: "failed", provider_ref: p.id }).eq("id", order.id);
              return json({ error: "O pagamento foi recusado. Confirma o número e o saldo, ou usa outro método." }, 402);
            }
            await guardar(p.id, { mode: "direct" });
            return json({ order_id: order.id, method, status: "pending" });
          }
          const d = p.methodDetails ?? {};
          const expires = dataPt(d.dueAt ?? p.expiresAt);
          await guardar(p.id, { mode: "direct", entity: d.entity, reference: d.reference, expires });
          return json({ order_id: order.id, method, entity: d.entity, reference: d.reference, amount: order.amount, expires });
        } catch (e) {
          // Cobrança direta ainda não ativada nesta conta: segue pelo checkout hospedado.
          if (!(e instanceof ErroKp && e.status === 403)) throw e;
        }
      }

      const p = await criarCheckout({ ...base, metodo: KP[method] });
      const url = urlCheckout(p);
      await guardar(p.id, { mode: "checkout", checkout_url: url });
      return json({ order_id: order.id, method, checkout_url: url });
    }

    // PayPal (sem chaves configuradas; mantido para o caso de voltar a ser usado)
    const cfg = await settings();
    const rate = cfg.usd_rate || 920;
    const usd = Math.max(1, Math.ceil((order.amount / rate) * 100) / 100).toFixed(2);
    const site = env("SITE_URL").replace(/\/$/, "");
    const pp = await createPaypalOrder(usd, order.id, description, `${site}/?pp=${order.id}`, `${site}/?pp_cancel=${order.id}`);
    await db.from("orders").update({ provider_ref: pp.id, provider_data: { usd, rate } }).eq("id", order.id);
    return json({ order_id: order.id, method, approve_url: pp.approveUrl, usd });
  } catch (e) {
    console.error("create-order", e);
    await db.from("orders").update({ status: "failed", provider_data: { error: String(e) } }).eq("id", order.id);
    if (e instanceof ErroKp && e.code === "limit_exceeded") {
      return json({ error: "Este valor passa o limite permitido de momento. Usa outro método ou um valor mais baixo." }, 400);
    }
    return json({ error: "O serviço de pagamento não respondeu. Tenta outra vez daqui a pouco ou usa outro método." }, 502);
  }
});
