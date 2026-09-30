/**
 * Títulos e descrições de cada página — os mesmos no separador do browser, no
 * Google e na pré-visualização do WhatsApp, Facebook e LinkedIn.
 *
 * Sem `document` nem `window`: usado pelo servidor (metadados) e pelo browser
 * (`document.title` ao mudar de página).
 */

export const SITE = 'https://aportafechada.net';
export const NOME = 'A Porta Fechada';
export const DESCRICAO = 'Conteúdos exclusivos dos teus criadores angolanos favoritos: subscrições, publicações, mensagens e lives, com pagamentos em kwanzas.';

/** Páginas que o Google deve indexar (e que entram no sitemap). */
export const PUBLICAS: Record<string, { titulo: string; descricao: string }> = {
  inicio: { titulo: `${NOME} · Conteúdos exclusivos de criadores angolanos`, descricao: DESCRICAO },
  registar: { titulo: 'Criar conta', descricao: 'Cria a tua conta grátis e começa a seguir e subscrever criadores angolanos. Só para maiores de 18.' },
  top: { titulo: 'Top 10 criadores', descricao: 'Os criadores que mais cresceram esta semana e este mês na A Porta Fechada.' },
  sobre: { titulo: 'Sobre a plataforma', descricao: 'A Porta Fechada liga criadores angolanos a quem gosta do trabalho deles, com pagamentos em kwanzas.' },
  funciona: { titulo: 'Como funciona', descricao: 'Como criar conta, seguir e subscrever criadores, e como te tornas criador verificado e recebes os teus ganhos.' },
  faq: { titulo: 'Perguntas frequentes', descricao: 'Respostas sobre contas, pagamentos com Multicaixa e PayPal, subscrições, levantamentos e segurança.' },
  regras: { titulo: 'Regras da comunidade', descricao: 'As regras que protegem criadores e fãs na A Porta Fechada.' },
  termos: { titulo: 'Termos e condições', descricao: 'Os termos e condições de utilização da plataforma A Porta Fechada.' },
  privacidade: { titulo: 'Política de privacidade', descricao: 'Como a A Porta Fechada recolhe, usa e protege os teus dados.' },
  dmca: { titulo: 'Direitos de autor', descricao: 'Como pedir a remoção de um conteúdo teu publicado sem autorização.' },
  contacto: { titulo: 'Contacto', descricao: 'Fala com a equipa da A Porta Fechada. Respondemos em até 24 horas úteis.' },
  afiliados: { titulo: 'Programa de afiliados', descricao: 'Convida pessoas e ganha uma percentagem de tudo o que elas gastam ou ganham na plataforma.' },
  blog: { titulo: 'Blog', descricao: 'Novidades e dicas para criadores e fãs.' },
};

/** Páginas só com sessão: título para o separador, e nunca indexadas. */
const PRIVADAS: Record<string, string> = {
  feed: 'Início', explorar: 'Explorar', subscricoes: 'Subscrições', compras: 'Meus conteúdos',
  carteira: 'Carteira', mensagens: 'Mensagens', lives: 'Lives', estudio: 'Estúdio', conta: 'Definições da conta',
  admin: 'Administração', confirmar: 'Confirmar email', 'nova-senha': 'Nova palavra-passe',
};

/** Rotas que existem (o resto é 404). Os perfis, publicações e lives são tratados à parte. */
export const ROTAS_CONHECIDAS = new Set([...Object.keys(PUBLICAS), ...Object.keys(PRIVADAS)]);

const comNome = (t: string) => (t.includes(NOME) ? t : `${t} · ${NOME}`);

/** Título do separador para uma rota da aplicação. */
export function tituloDe(rota: string): string {
  if (rota.startsWith('perfil-')) return comNome('@' + rota.slice(7));
  if (rota.startsWith('p-')) return comNome('Publicação');
  if (rota.startsWith('live-')) return comNome('Live');
  const t = PUBLICAS[rota]?.titulo ?? PRIVADAS[rota];
  return t ? comNome(t) : NOME;
}
