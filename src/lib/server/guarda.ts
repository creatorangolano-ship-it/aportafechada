/**
 * O guarda comum às API routes.
 *
 * Porquê isto existir: a sessão do Supabase vive no `localStorage` do browser,
 * não num cookie `httpOnly` — é o `supabase-js` que a guarda e a injecta nas
 * chamadas. O browser não a pode ler para a mandar sozinha, por isso o
 * `fn()` em `lib.ts` manda-a explicitamente no corpo, em `__access_token`.
 *
 * Uma API route não pode confiar nesse token só porque veio no corpo: é o
 * utilizador a dizer quem é. O que interessa é a assinatura. Este módulo
 * valida-a **com a `service_role`**, que é a única chave que valida tokens
 * sem ser enganada por um token falsificado. Uma route feita com a `anon` key
 * aceitaria um JWT com o `role` trocado, e isso é bypass de autenticação.
 *
 * A `service_role` nunca é importada pelo browser: vive só aqui, no servidor.
 * Se `SUPABASE_SERVICE_ROLE_KEY` não estiver definida, `admin()` atira — e as
 * rotas apanham isso e devolvem 500. Falhar aberto seria pior do que a route não
 * existir: dariamos acesso a quem não tem.
 *
 * O `import 'server-only'` no topo não é decoração: faz o build falhar com um
 * erro claro se este módulo for alguma vez arrastado para o pacote do browser.
 * Sem isso, o `_admin` — construído com a chave que ignora as políticas RLS —
 * podia acabar num `.js` público. Um erro de compilação é muito mais barato do
 * que esse vazamento.
 */

import 'server-only';

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/config';

/** Resposta de erro, no formato que o `fn()` do browser sabe ler. */
export function erro(mensagem: string, estado = 400): Response {
  return Response.json({ error: mensagem }, { status: estado });
}

/**
 * Cliente privileged, partilhado.
 *
 * `auth.persistSession: false` porque isto vive no servidor: não há
 * `localStorage` nem cookie para persistir, e sem esta opção o `supabase-js`
 * tenta mexer em `window`, que não existe no servidor.
 */
let _admin: SupabaseClient | null = null;
export function admin(): SupabaseClient {
  if (_admin) return _admin;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY não está definida. A route devia recusar o pedido (ver `guarda`).',
    );
  }
  _admin = createClient(SUPABASE_URL, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

/** O corpo JSON do pedido, já lido. */
export type Corpo = Record<string, unknown>;

/**
 * O resultado de `guarda()`: ou o utilizador autenticado (com o corpo já lido),
 * ou a resposta a enviar.
 *
 * O corpo vem junto porque um `Request` só se lê uma vez: depois do
 * `pedido.json()` aqui dentro, um segundo `pedido.json()` na rota atira
 * «Body has already been read». As rotas usam `corpo` em vez de reler.
 */
export type Guardado = { user: User; token: string; corpo: Corpo } | { resposta: Response };

/**
 * Valida a sessão do pedido.
 *
 * Devolve o `user` quando o token é válido, ou uma `Response` de erro pronta a
 * devolver — o que obriga quem chama a lidar com os dois casos, e é de propósito:
 * uma route que se esqueça de verificar o `{ resposta }` é uma route aberta, e
 * o tipo avisa disso em vez de o deixar passar em silêncio.
 */
export async function guarda(pedido: Request): Promise<Guardado> {
  let corpo: Corpo;
  try {
    corpo = (await pedido.json()) as Corpo;
  } catch {
    return { resposta: erro('Corpo do pedido inválido.', 400) };
  }

  const token = corpo.__access_token;
  if (typeof token !== 'string' || !token) {
    return { resposta: erro('A tua sessão expirou.', 401) };
  }

  // Falta de configuração e token inválido são coisas diferentes, e devolvem
  // estados diferentes (500 vs 401). Verificar a variável antes de chamar
  // `admin()` separa as duas, em vez de um `try` largo que trataria um erro de
  // rede como se fosse a chave em falta — e mandaria quem está a depurar
  // acrescentar uma variável que já lá está.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[api] SUPABASE_SERVICE_ROLE_KEY não está definida no servidor.');
    return { resposta: erro('Servidor mal configurado.', 500) };
  }

  // `getUser` valida a assinatura **no servidor**. `getClaims` (ou o
  // `auth.getSession()` client-side) aceitariam um token assinado com a
  // `anon` key, que qualquer um consegue obter.
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) {
    return { resposta: erro('A tua sessão expirou.', 401) };
  }

  // O token sai do corpo: nenhuma rota precisa dele lá, e assim não acaba por
  // engano num insert ou num log.
  delete corpo.__access_token;
  return { user: data.user, token, corpo };
}

/**
 * Atalho para a forma comum: devolve `Response` em erro, `{ user, corpo }` em
 * sucesso. A rota lê os campos de `corpo` — nunca `pedido.json()` outra vez.
 *
 * Perde-se o token, que nenhuma das rotas actuais precisa. Se alguma precisar de
 * verificar o audience/issuer, usa `guarda()` directamente.
 */
export async function exigeSessao(pedido: Request): Promise<{ user: User; corpo: Corpo } | Response> {
  const g = await guarda(pedido);
  return 'resposta' in g ? g.resposta : { user: g.user, corpo: g.corpo };
}
