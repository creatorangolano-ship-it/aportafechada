/**
 * Rotas da aplicação ↔ endereços reais.
 *
 * A aplicação continua a pensar em nomes de rota (`feed`, `perfil-DarleneC`,
 * `p-<id>`), mas o endereço no browser passa a ser um caminho a sério
 * (`/feed`, `/perfil/DarleneC`, `/p/<id>`), que o Google indexa e que o
 * WhatsApp e o Facebook conseguem pré-visualizar. Os antigos endereços com
 * `#rota` continuam a funcionar: são convertidos no arranque.
 *
 * Sem `document` nem `window`: é usado também no servidor (metadados, sitemap).
 */

/** Rotas com argumento: `perfil-x` ↔ `/perfil/x`. */
const COM_ARGUMENTO = ['perfil', 'p', 'live'] as const;

export function caminhoDe(rota: string): string {
  if (!rota || rota === 'inicio') return '/';
  for (const pre of COM_ARGUMENTO) {
    if (rota.startsWith(pre + '-') && rota.length > pre.length + 1) return `/${pre}/${encodeURIComponent(rota.slice(pre.length + 1))}`;
  }
  return '/' + rota;
}

/** O inverso. Devolve '' para um caminho que não é uma rota (a aplicação mostra o início). */
export function rotaDe(caminho: string): string {
  const partes = caminho.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return ''; } });
  if (!partes.length) return 'inicio';
  const [a, b] = partes;
  if (partes.length === 2 && b && (COM_ARGUMENTO as readonly string[]).includes(a)) return `${a}-${b}`;
  if (partes.length === 2 && b && a === 'criador') return `perfil-${b}`; // endereço alternativo
  return partes.length === 1 ? a : '';
}

/** Um `#rota` antigo (e não os fragmentos de autenticação do Supabase, que trazem `=`). */
export const eRotaAntiga = (h: string): boolean => /^[\w-]+$/.test(h);
