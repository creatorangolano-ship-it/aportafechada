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

/**
 * A biblioteca de vídeo das lives já não vem de um CDN: `livekit-client` é uma
 * dependência npm e é importada dinamicamente em `views/lives.ts`, só quando
 * alguém abre uma sala. Isso tira uma terceira origem ao CSP, e a versão deixa
 * de estar escrita à mão num URL — passa a ser a que está no `package-lock.json`.
 *
 * Para a veres sozinha: `npm ls livekit-client`.
 */

/** Categorias disponíveis para criadores e interesses dos fãs.
 *  'Adulto' está aqui desde o início: é o que dá peso legal a qualquer falha
 *  de visibilidade de perfil — conteúdo adulto de um perfil não aprovado é
 *  problema muito maior do que lifestyle. */
export const CATS = [
  'Lifestyle', 'Música', 'Fitness', 'Arte', 'Educação',
  'Moda e beleza', 'Culinária', 'Viagens', 'Gaming', 'Humor', 'Podcasts', 'Adulto',
] as const;

export const CITIES = [
  'Luanda', 'Benguela', 'Huambo', 'Lubango', 'Cabinda', 'Malanje', 'Namibe', 'Soyo', 'Lobito', 'Outra',
] as const;

export const BANKS = [
  'BFA', 'BAI', 'BIC', 'Atlântico', 'Standard Bank', 'Banco Sol',
  'BPC', 'Access Bank', 'Banco Keve', 'Yetu',
] as const;

export const COUNTRIES = [
  'Angola', 'Portugal', 'Brasil', 'Moçambique', 'Cabo Verde', 'São Tomé e Príncipe',
  'Guiné-Bissau', 'Namíbia', 'África do Sul', 'Outro país',
] as const;
