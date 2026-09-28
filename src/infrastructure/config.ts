/**
 * Configuração do projecto.
 *
 * A chave `anon` do Supabase é pública por desenho: vai no JavaScript do
 * browser de qualquer visitante, não tem como estar escondida. O que a protege
 * são as políticas RLS — se uma tabela não tem política, a chave anonyma lê-na.
 * O que é mesmo secreto é a `service_role`, que só vive em
 * `SUPABASE_SERVICE_ROLE_KEY` no servidor (ver `src/app/api/`), nunca no browser.
 *
 * Os valores vêm das variáveis de ambiente da Vercel (Settings → Environment
 * Variables), não do código. Localmente, `vercel env pull .env.local` trá-las.
 * O Next substitui `process.env.NEXT_PUBLIC_*` pelo valor no momento do build,
 * por isso cada uma tem de ser escrita por extenso — um `process.env[nome]`
 * não seria substituído e chegava `undefined` ao browser.
 */

function exige(nome: string, valor: string | undefined): string {
  if (!valor) {
    throw new Error(
      `Falta a variável de ambiente ${nome}. Define-a na Vercel ou corre \`vercel env pull .env.local\`.`,
    );
  }
  return valor;
}

export const SUPABASE_URL = exige('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);

export const SUPABASE_ANON_KEY = exige('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
