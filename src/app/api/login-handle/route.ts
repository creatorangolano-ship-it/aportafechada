/**
 * `POST /api/login-handle` — entrar com nome de utilizador em vez de email.
 *
 * A única das cinco rotas que **não** exige sessão: quem está a entrar ainda não
 * tem nenhuma. A autenticação acontece dentro, e é por isso que esta rota não
 * pode usar `exigeSessao()`.
 *
 * O fluxo: recebe `{ handle, password }`, procura o email dessa conta em
 * `profiles` e pede ao `auth.signInWithPassword` do Supabase o par de tokens,
 * que devolve já ao browser. O browser chama `sb.auth.setSession()` com eles
 * (ver `public.ts`, ramo do `#loginForm` sem `@`).
 *
 * **É a rota mais perigosa das cinco.** Devolve tokens de sessão a quem não
 * tem sessão, a partir de um identificador que o próprio utilizador escolhe.
 * Duas regras não negociáveis na implementação:
 *
 *  1. **Não distinguir "handle não existe" de "palavra-passe errada".** A
 *     resposta tem de ser a mesma nos dois casos, e o tempo também. A de menos
 *     diz a quem está a tentar entrar que o handle existe, o que transforma
 *     esta rota num enumerador de contas. O Supabase já faz isto pelo email;
 *     não desfazê-lo aqui.
 *  2. **Não devolver o `user_id` nem o email.** Só os dois tokens. O resto do
 *     perfil lê-se do browser, com a `anon` key e as políticas RLS, como em
 *     todo o resto da app.
 */

import { admin, erro } from '@/lib/server/guarda';
import { porImplementar } from '@/lib/server/porImplementar';

export const dynamic = 'force-dynamic';

export async function POST(pedido: Request): Promise<Response> {
  let handle: unknown;
  let password: unknown;
  try {
    ({ handle, password } = (await pedido.json()) as { handle?: unknown; password?: unknown });
  } catch {
    return erro('Corpo do pedido inválido.', 400);
  }

  // A validação de forma é a mesma que a do browser (`public.ts`: 3 a 20
  // caracteres, o mesmo padrão do registo). Fica aqui mesmo assim: validar no
  // cliente é conveniência, não segurança, e o `handle` que chega aqui é o que
  // for que o browser mandou.
  if (typeof handle !== 'string' || !/^[a-z0-9._]{3,20}$/i.test(handle)) {
    return erro('Credenciais inválidas.', 401);
  }
  if (typeof password !== 'string' || !password) {
    return erro('Credenciais inválidas.', 401);
  }

  // TODO(pagina): colar aqui a implementação da edge function `login-handle`.
  // O caminho é:
  //   const { data: p } = await admin().from('profiles')
  //     .select('id').eq('handle', handle).maybeSingle();
  //   // sem `p`? devolver 401 com a MESMA mensagem e o MESMO formato do
  //   // `signInWithPassword` falhado — nunca "utilizador não encontrado".
  //   const email = (await admin().auth.admin.getUserById(p.id)).user.email;
  //   const { data, error } = await admin().auth.signInWithPassword({ email, password });
  //   if (error || !data.session) return erro('Credenciais inválidas.', 401);
  //   return Response.json({
  //     access_token: data.session.access_token,
  //     refresh_token: data.session.refresh_token,
  //   });
  // A mensagem e o tempo de resposta têm de ser iguais aos do ramo de email,
  // que corre no browser. Um `getUserById` a mais ou a menos é o suficiente
  // para a diferença virar medidor.
  void admin;
  return porImplementar(
    'login-handle',
    '{ access_token: string, refresh_token: string } — obtained from Supabase signInWithPassword, so the browser can call setSession',
  );
}
