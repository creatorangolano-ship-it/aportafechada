/**
 * Funções do servidor: edge functions do Supabase, ou as API routes do Next
 * (src/app/api) quando já estiverem implementadas.
 */
import { sb } from './client';

/** Rotas de `src/app/api/<nome>/route.ts` que já têm a lógica de negócio escrita.
 *  As restantes ainda respondem 501, por isso o `fn()` continua a mandá-las para a
 *  edge function do Supabase com o mesmo nome, que é a que funciona em produção.
 *  Quando uma rota estiver implementada e testada, acrescenta aqui o nome dela. */
const ROTAS_PRONTAS = new Set<string>([]);

/** Chama uma função do servidor e devolve os dados ou lança um erro com a mensagem.
 *
 *  Por omissão vai à edge function do Supabase (`/functions/v1/<nome>`). Se o
 *  nome estiver em `ROTAS_PRONTAS`, vai ao route handler do Next no mesmo
 *  domínio. O nome e o corpo são os mesmos nos dois casos, por isso os pontos de
 *  chamada não mudam.
 */
export async function fn<T = unknown>(name: string, body: unknown): Promise<T> {
  if (!ROTAS_PRONTAS.has(name)) {
    const { data, error } = await sb.functions.invoke(name, { body: body as Record<string, unknown> });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.error || msg; } catch { /* sem corpo */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data as T;
  }
  const res = await fetch(`/api/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // A sessão do Supabase vive no localStorage, não num cookie, por isso tem
    // de ir no cabeçalho em vez de ser o browser a anexá-la sozinha.
    body: JSON.stringify({ ...(body as object), __access_token: await accessToken() }),
  });
  const txt = await res.text();
  let j: any = null;
  try { j = txt ? JSON.parse(txt) : null; } catch { /* resposta sem JSON */ }
  if (!res.ok) throw new Error(j?.error || txt || `Erro ${res.status}`);
  if (j?.error) throw new Error(j.error);
  return j as T;
}

/** O JWT da sessão actual, ou null. Vai no corpo das chamadas ao servidor
 *  porque o auth do Supabase guarda-se em localStorage e não em cookie —
 *  um cookie de sessão seria httpOnly e o browser não o poderia ler. */
export async function accessToken(): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}
