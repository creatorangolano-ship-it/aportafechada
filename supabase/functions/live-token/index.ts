// Dá acesso a uma live (LiveKit). O criador recebe permissão para transmitir; os fãs só para ver.
// A conta de administração entra em qualquer live sem bilhete (só para ver).
import { admin, env, getUser, handleOptions, json } from "../_shared/util.ts";
import { livekitToken } from "../_shared/livekit.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req); if (pre) return pre;
  const user = await getUser(req);
  if (!user) return json({ error: "A tua sessão expirou. Entra outra vez." }, 401);
  const { live_id } = await req.json().catch(() => ({}));

  const db = admin();
  const { data: live } = await db.from("lives").select("*, creators!inner(status)").eq("id", live_id).maybeSingle();
  if (!live) return json({ error: "Live não encontrada." }, 404);
  const host = live.creator_id === user.id;
  const { data: prof } = await db.from("profiles").select("handle,name,role").eq("id", user.id).single();
  const eAdmin = prof?.role === "admin";

  if (!host) {
    if (live.creators.status !== "approved" && !eAdmin) return json({ error: "Live não encontrada." }, 404);
    if (live.status === "scheduled") return json({ error: "A live ainda não começou." }, 400);
    if (live.status === "ended") return json({ error: "Esta live já terminou." }, 400);
    if (live.price > 0 && !eAdmin) {
      const { data: t } = await db.from("purchases").select("id").eq("user_id", user.id).eq("kind", "ticket").eq("ref_id", live.id).maybeSingle();
      if (!t) return json({ error: "Precisas de bilhete para entrar." }, 403);
    }
  } else {
    if (live.status === "ended") return json({ error: "Esta live já terminou." }, 400);
    if (live.status === "scheduled") await db.from("lives").update({ status: "live" }).eq("id", live.id);
  }

  const token = await livekitToken({
    identity: user.id,
    name: prof?.name || prof?.handle || "Fã",
    room: live.room_name,
    canPublish: host,
  });
  return json({ url: env("LIVEKIT_URL"), token, host });
});
