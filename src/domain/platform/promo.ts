/**
 * Promoções: um banner por visita no feed.
 *
 * Computador: banner vertical (1:2) na coluna escolhida. Telemóvel: banner largo
 * entre as publicações, na posição escolhida (ou automática). Uma promoção
 * «fixa» aparece sempre; as outras rodam, uma por visita.
 */

export type ColunaPromo = 'esquerda' | 'direita';
export type TipoPromo = 'card' | 'media' | 'html';
export const COLUNAS: readonly ColunaPromo[] = ['esquerda', 'direita'];
export const TIPOS: readonly TipoPromo[] = ['card', 'media', 'html'];
/** Depois de que publicação aparece no telemóvel. `null` = automática. */
export const POSICOES_TELEMOVEL: readonly number[] = [1, 2, 3, 5];
export const TEXTO_BOTAO_PADRAO = 'Clica aqui';

/** A coluna no computador. Valores antigos («topo») contam como esquerda. */
export const colunaDe = (position: unknown): ColunaPromo => (position === 'direita' ? 'direita' : 'esquerda');

/** Valida uma promoção antes de a guardar. Devolve o motivo da recusa, ou `null`. */
export function recusaPromocao(p: {
  titulo: string; tipo: string; coluna: string; html: string | null;
  posicaoTelemovel?: number | null; textoBotao?: string | null;
}): string | null {
  if (!(TIPOS as readonly string[]).includes(p.tipo)) return 'Tipo inválido.';
  if (!(COLUNAS as readonly string[]).includes(p.coluna)) return 'Coluna inválida.';
  if (p.posicaoTelemovel != null && !POSICOES_TELEMOVEL.includes(p.posicaoTelemovel)) return 'Posição no telemóvel inválida.';
  const cta = p.textoBotao?.trim();
  if (cta && (cta.length < 2 || cta.length > 30)) return 'O texto do botão tem de ter entre 2 e 30 caracteres.';
  if (p.tipo === 'html') return p.html?.trim() ? null : 'Cola o código HTML do anúncio.';
  return p.titulo.trim().length >= 2 ? null : 'Escreve um título.';
}

/**
 * Qual promoção mostrar nesta visita: a fixa (se houver, a primeira pela
 * ordem), senão a da vez na rotação. `volta` é um contador que avança uma
 * posição por visita.
 */
export function promocaoDaVisita<T extends { pinned?: boolean | null }>(ativas: readonly T[], volta: number): T | null {
  if (!ativas.length) return null;
  const fixa = ativas.find((p) => p.pinned);
  if (fixa) return fixa;
  return ativas[((volta % ativas.length) + ativas.length) % ativas.length];
}

/**
 * Onde entra o banner no feed do telemóvel: a posição escolhida, ou (automática)
 * a que foi sorteada para esta visita; nunca depois do fim da lista.
 */
export const posicaoNoFeed = (escolhida: number | null | undefined, sorteada: number, publicacoes: number): number =>
  Math.max(1, Math.min(escolhida ?? sorteada, publicacoes));
