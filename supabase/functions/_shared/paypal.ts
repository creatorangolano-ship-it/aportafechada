// PayPal Checkout (Orders API v2). O PayPal não aceita kwanzas, por isso cobra em USD
// usando a taxa definida em settings.usd_rate.
import { env } from "./util.ts";

function base(): string {
  return Deno.env.get("PAYPAL_ENV") === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function token(): Promise<string> {
  const auth = btoa(`${env("PAYPAL_CLIENT_ID")}:${env("PAYPAL_SECRET")}`);
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal token ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

export async function createPaypalOrder(usd: string, orderId: string, description: string, returnUrl: string, cancelUrl: string) {
  const res = await fetch(`${base()}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", "PayPal-Request-Id": orderId },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: orderId,
        custom_id: orderId,
        description: description.slice(0, 120),
        amount: { currency_code: "USD", value: usd },
      }],
      application_context: {
        brand_name: "A Porta Fechada",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });
  if (!res.ok) throw new Error(`PayPal create ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const approve = (data.links ?? []).find((l: { rel: string }) => l.rel === "approve" || l.rel === "payer-action");
  return { id: data.id as string, approveUrl: approve?.href as string };
}

export async function capturePaypalOrder(paypalOrderId: string) {
  const res = await fetch(`${base()}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok && data?.details?.[0]?.issue !== "ORDER_ALREADY_CAPTURED") {
    throw new Error(`PayPal capture ${res.status}: ${JSON.stringify(data)}`);
  }
  const unit = data.purchase_units?.[0];
  const cap = unit?.payments?.captures?.[0];
  return {
    status: (cap?.status ?? data.status) as string,
    customId: (cap?.custom_id ?? unit?.custom_id ?? unit?.reference_id) as string | undefined,
    value: cap?.amount?.value as string | undefined,
    raw: data,
  };
}
