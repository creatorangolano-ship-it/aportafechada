/**
 * Levantamentos: o criador pede, a equipa transfere no banco e marca como pago.
 *
 * O ciclo de vida é uma máquina de estados (padrão State, na forma de tabela de
 * transições): só estas passagens são válidas. «Pago» e «recusado» são finais —
 * marcar como pago confirma que o dinheiro saiu, e não se desfaz.
 */

export type EstadoLevantamento = 'pending' | 'review' | 'paid' | 'rejected';

const TRANSICOES: Record<EstadoLevantamento, readonly EstadoLevantamento[]> = {
  pending: ['review', 'paid', 'rejected'],
  review: ['paid', 'rejected'],
  paid: [],
  rejected: [],
};

export const ESTADOS_POR_TRATAR: readonly EstadoLevantamento[] = ['pending', 'review'];

export const eEstadoLevantamento = (s: string): s is EstadoLevantamento => s in TRANSICOES;
export const porTratar = (s: string): boolean => (ESTADOS_POR_TRATAR as readonly string[]).includes(s);
export const podeTransitar = (de: EstadoLevantamento, para: EstadoLevantamento): boolean => TRANSICOES[de].includes(para);
export const eIrreversivel = (para: EstadoLevantamento): boolean => TRANSICOES[para].length === 0;

/** Recusar exige motivo: o valor volta ao saldo e a pessoa tem de saber porquê. */
export const recusaMotivo = (motivo: string): string | null =>
  motivo.trim().length >= 5 ? null : 'Escreve o motivo.';
