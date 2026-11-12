// Entrar com nome de utilizador (em vez de email) sem expor o email de ninguém.
// Limite de tentativas (migração 0016): 5 falhas no mesmo nome ou 20 no mesmo IP em
// 15 minutos bloqueiam novas tentativas até passarem os 15 minutos. Entrar com o email
// continua possível (tem os limites próprios do Supabase).
import { createClient } from "npm:@supabase/supabase-js@2";
import { admin, env, handleOptions, json } from "./_shared/util.ts";

const WRONG = "Nome de utilizador ou palavra-passe incorretos.";
// O servidor de autenticação só diz que a conta está banida depois de a palavra-passe
// estar certa, por isso esta mensagem não revela nada a quem não é o dono da conta.
const BANNED = "Esta conta está banida. Se achas que é um engano, fala connosco em Contacto.";
const MUITAS = "Demasiadas tentativas. Espera 15 minutos ou entra com o teu email.";
const JANELA_MS = 15 * 60 * 1000, MAX_NOME = 5, MAX_IP = 20;

Deno.serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre;
  const { handle, password, captcha } = await req.json().catch(() => ({}));
  if (!handle || !password) return json({ error: WRONG }, 400);

  const db = admin();
  const nome = String(handle).replace(/^@/, "").trim().slice(0, 40);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido";
  const kNome = "h:" + nome.toLowerCase(), kIp = "ip:" + ip;
  const desde = new Date(Date.now() - JANELA_MS).toISOString();

  const contar = async (chave: string) =>
    (await db.from("login_tentativas").select("id", { count: "exact", head: true }).eq("chave", chave).gte("criado", desde)).count ?? 0;
  const [nNome, nIp] = await Promise.all([contar(kNome), contar(kIp)]);
  if (nNome >= MAX_NOME || nIp >= MAX_IP) return json({ error: MUITAS }, 429);

  const falhou = async (msg: string) => {
    await db.from("login_tentativas").insert([{ chave: kNome }, { chave: kIp }]);
    return json({ error: msg }, 400);
  };

  const { data: prof } = await db.from("profiles").select("id").eq("handle", nome).maybeSingle();
  if (!prof) return falhou(WRONG);
  const { data: u } = await db.auth.admin.getUserById(prof.id);
  const email = u?.user?.email;
  if (!email) return falhou(WRONG);

  const anon = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
  // O token do CAPTCHA (Turnstile) vem do browser e segue para o Supabase, que o valida.
  const captchaToken = typeof captcha === "string" && captcha ? captcha : undefined;
  const { data, error } = await anon.auth.signInWithPassword({ email, password: String(password), options: { captchaToken } });
  if (error || !data.session) {
    const m = error?.message ?? "";
    if (/captcha/i.test(m)) return json({ error: "A verificação de segurança falhou. Tenta outra vez." }, 400);
    const msg = /banned/i.test(m) ? BANNED : m.includes("confirm") ? "Confirma primeiro o teu email." : WRONG;
    return falhou(msg);
  }
  await db.from("login_tentativas").delete().eq("chave", kNome);
  return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
});
