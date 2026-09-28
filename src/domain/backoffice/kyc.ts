/**
 * Verificação de identidade (KYC) de quem quer ser criador.
 */

export type EstadoKyc = 'pending' | 'approved' | 'rejected';

export const IDADE_MINIMA = 18;

/** Os quatro pontos que quem analisa tem de confirmar antes de aprovar. */
export const PONTOS_A_CONFIRMAR = [
  'Nome e data de nascimento coincidem com o documento',
  'A pessoa da selfie é a do documento',
  'Tem 18 anos ou mais',
  'O titular do IBAN é a mesma pessoa',
] as const;

/** Motivos de rejeição mais comuns (a pessoa pode escrever outro). */
export const MOTIVOS_DE_REJEICAO = [
  'A selfie não mostra o documento com clareza',
  'Documento ilegível ou cortado',
  'A pessoa da selfie não parece ser a do documento',
  'Idade abaixo dos 18 anos',
  'O titular do IBAN não corresponde ao nome no documento',
] as const;

/** Idade em anos completos numa data (por omissão, hoje). `null` sem data de nascimento. */
export function idade(nascimento: string | null | undefined, em: Date = new Date()): number | null {
  if (!nascimento) return null;
  const n = new Date(nascimento);
  if (Number.isNaN(n.getTime())) return null;
  let anos = em.getFullYear() - n.getFullYear();
  const antesDoAniversario = em.getMonth() < n.getMonth() || (em.getMonth() === n.getMonth() && em.getDate() < n.getDate());
  if (antesDoAniversario) anos--;
  return anos;
}

/**
 * Valida a decisão antes de a enviar. Aprovar exige os quatro pontos
 * confirmados; rejeitar exige um motivo que diga à pessoa o que corrigir.
 */
export function recusaDecisao(d: { aprovar: boolean; pontosConfirmados: boolean[]; motivo: string }): string | null {
  if (d.aprovar) {
    const todos = d.pontosConfirmados.length === PONTOS_A_CONFIRMAR.length && d.pontosConfirmados.every(Boolean);
    return todos ? null : 'Confirma os quatro pontos antes de aprovar.';
  }
  return d.motivo.trim().length >= 5 ? null : 'Escreve o motivo, para a pessoa saber o que corrigir.';
}
