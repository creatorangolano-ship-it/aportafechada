// Utilitários partilhados pelas funções do servidor (Supabase Edge Functions, Deno)
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Falta a variável de ambiente ${name}`);
  return v;
}

let _admin: SupabaseClient | null = null;
/** Cliente com a chave de serviço: ignora RLS. Usar só no servidor. */
export function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

/** Utilizador autenticado a partir do cabeçalho Authorization: Bearer <jwt>. */
export async function getUser(req: Request): Promise<User | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function hmacHex(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparação em tempo constante (evita ataques de temporização). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function settings(): Promise<Record<string, number>> {
  const { data } = await admin().from("settings").select("key,value");
  const out: Record<string, number> = {};
  for (const row of data ?? []) out[row.key] = Number(row.value);
  return out;
}

/** Marca um pedido como pago e entrega o conteúdo (idempotente). */
export async function fulfill(orderId: string): Promise<void> {
  const { error } = await admin().rpc("fulfill_order", { p_order: orderId });
  if (error) throw new Error(`fulfill_order falhou: ${error.message}`);
}

export function handleOptions(req: Request): Response | null {
  return req.method === "OPTIONS" ? new Response("ok", { headers: cors }) : null;
}
