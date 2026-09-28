/**
 * Configuração do projecto.
 *
 * A chave `anon` do Supabase é pública por desenho: vai no JavaScript do
 * browser de qualquer visitante, não tem como estar escondida. O que a protege
 * são as políticas RLS — se uma tabela não tem política, a chave anonyma lê-na.
 * Por isso a chave está aqui à vista, e o que é mesmo secreto é a
 * `service_role`, que só vive em `SUPABASE_SERVICE_ROLE_KEY` no servidor (ver
 * `src/app/api/`), nunca no browser.
 *
 * As variáveis NEXT_PUBLIC_ existem para poderes mover isto para as variáveis
 * de ambiente da Vercel sem tocar em código. Os valores aqui são o default
 * para o site funcionar sem configuração nenhuma.
 */

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://xkcngjrlfmozlsttuxgs.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrY25nanJsZm1vemxzdHR1eGdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNzQ1NTYsImV4cCI6MjEwNTk1MDU1Nn0.Hv2YEbqEUeZE46oUvW5JZGOpWdmMbWpLoAds_Lcn9pA';

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
