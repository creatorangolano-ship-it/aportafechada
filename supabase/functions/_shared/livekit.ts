// Tokens de acesso ao LiveKit (lives em vídeo pelo navegador). Assinados com HS256.
import { env } from "./util.ts";

function b64url(bytes: Uint8Array | string): string {
  const s = typeof bytes === "string" ? btoa(unescape(encodeURIComponent(bytes))) : btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function livekitToken(opts: { identity: string; name: string; room: string; canPublish: boolean; ttlSeconds?: number }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: env("LIVEKIT_API_KEY"),
    sub: opts.identity,
    name: opts.name,
    nbf: now - 10,
    exp: now + (opts.ttlSeconds ?? 4 * 3600),
    video: {
      room: opts.room,
      roomJoin: true,
      canPublish: opts.canPublish,
      canPublishData: true,
      canSubscribe: true,
    },
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("LIVEKIT_API_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned)));
  return `${unsigned}.${b64url(sig)}`;
}

/** Quem está ligado a uma sala do LiveKit (identidades). Sala inexistente → lista vazia;
 *  falha da API → null (não se sabe, não se toma decisão nenhuma). */
export async function participantes(room: string): Promise<string[] | null> {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: env("LIVEKIT_API_KEY"), sub: "servidor", nbf: now - 10, exp: now + 120, video: { room, roomAdmin: true } };
  const unsigned = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env("LIVEKIT_API_SECRET")), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned)));
  const base = env("LIVEKIT_URL").replace(/^ws/, "http").replace(/\/$/, "");
  try {
    const r = await fetch(`${base}/twirp/livekit.RoomService/ListParticipants`, {
      method: "POST",
      headers: { Authorization: `Bearer ${unsigned}.${b64url(sig)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ room }),
    });
    const corpo = await r.json().catch(() => ({}));
    if (r.status === 404 || corpo?.code === "not_found") return [];
    if (!r.ok) { console.error("livekit ListParticipants", r.status, corpo); return null; }
    return (corpo.participants || []).map((p: { identity: string }) => p.identity);
  } catch (e) { console.error("livekit ListParticipants", e); return null; }
}
