/**
 * `POST /api/live-token` — dá o par `{ url, token }` para entrar numa sala.
 *
 * O `lives.ts` pede este token antes de ligar o `livekit-client`:
 *
 *   const [{ url, token }, LK] = await Promise.all([
 *     fn<{ url: string; token: token }>('live-token', { live_id: ctx.id }),
 *     import('livekit-client'),
 *   ]);
 *
 * `live_id` é o id da **sessão** (não o do criador). A rota tem de decidir se o
 * `user` é o anfitrião da sessão ou um espectador, e gerar um token com as
 * permissões certas: quem não é o anfitrião recebe `canPublish: false`. É essa
 * distinção que impede um espectador de publicar a sua própria câmara para os
 * outros. A verificação de acesso tem de ser feita aqui, com a `service_role` —
 * no browser ela não é fiável.
 *
 * Nunca devolver o `api_secret` do LiveKit ao browser: o que vai para o browser
 * é o token já assinado, nunca o segredo que o assina.
 */

import { exigeSessao, erro } from '@/lib/server/guarda';
import { porImplementar } from '@/lib/server/porImplementar';

export const dynamic = 'force-dynamic';

export async function POST(pedido: Request): Promise<Response> {
  const sessao = await exigeSessao(pedido);
  if (sessao instanceof Response) return sessao;
  const { user, corpo } = sessao;

  const liveId = corpo.live_id;
  if (typeof liveId !== 'string' || !liveId) {
    return erro('Falta a live.', 400);
  }

  // TODO(pagina): colar aqui a implementação da edge function `live-token`.
  // O `user.id` é `user.id`. Precisa de:
  //   1. ler a sessão em `lives` e confirmar que existe e não está terminada;
  //   2. `is_host = live.creator_id === user.id`;
  //   3. `AccessToken(apiKey, apiSecret, { identity: user.id })`;
  //   4. `addGrant({ roomJoin: true, room: liveId, canPublish: is_host,
  //      canSubscribe: true })`;
  //   5. devolver `{ url: LIVEKIT_URL, token: (await at.toJwt()).accessToken }`.
  // `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` leem-se do
  // `process.env` — nunca de `config.ts`, que é importado pelo browser.
  void user;
  return porImplementar(
    'live-token',
    '{ url: string, token: string } — url é o servidor LiveKit, token é um JWT com roomJoin e room=live_id',
  );
}
