/** Listas da interface (categorias, cidades, bancos, países). A ligação ao Supabase está em src/infrastructure/config.ts. */
export { SUPABASE_URL, SUPABASE_ANON_KEY } from '../infrastructure/config';

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
