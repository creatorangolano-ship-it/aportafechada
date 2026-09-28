/**
 * Promoções mostradas no Início e no Explorar.
 */

export type PosicaoPromo = 'topo' | 'esquerda' | 'direita';
export type TipoPromo = 'card' | 'media' | 'html';
export const POSICOES: readonly PosicaoPromo[] = ['topo', 'esquerda', 'direita'];
export const TIPOS: readonly TipoPromo[] = ['card', 'media', 'html'];

/** Valida uma promoção antes de a guardar. Devolve o motivo da recusa, ou `null`. */
export function recusaPromocao(p: { titulo: string; tipo: string; posicao: string; html: string | null }): string | null {
  if (!(TIPOS as readonly string[]).includes(p.tipo)) return 'Tipo inválido.';
  if (!(POSICOES as readonly string[]).includes(p.posicao)) return 'Posição inválida.';
  if (p.tipo === 'html') return p.html?.trim() ? null : 'Cola o código HTML do anúncio.';
  return p.titulo.trim().length >= 2 ? null : 'Escreve um título.';
}
