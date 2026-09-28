/**
 * Dinheiro em kwanzas.
 *
 * A plataforma trabalha em kwanzas inteiros (sem cêntimos). O PayPal cobra em
 * dólares, convertidos pela taxa das definições.
 */

/** Teto de segurança para valores escolhidos pelo utilizador (gorjeta, carregamento). */
export const MAX_FREE_AMOUNT = 2_000_000;

/**
 * Valida um valor escolhido pelo utilizador. Devolve a mensagem de erro, ou
 * `null` quando é válido. `minimo` vem das definições (gorjeta/carregamento mínimo).
 */
export function erroValorLivre(valor: number, minimo: number): string | null {
  const min = minimo > 0 ? minimo : 1;
  if (!Number.isFinite(valor) || !Number.isInteger(valor) || valor < min || valor > MAX_FREE_AMOUNT) {
    return `O valor tem de ser um número inteiro entre ${min} e ${MAX_FREE_AMOUNT} Kz.`;
  }
  return null;
}

/**
 * Kwanzas → dólares, arredondado a cêntimos. `null` quando a taxa não é
 * utilizável (0, negativa, ainda não carregada): dividir por ela dava Infinity.
 */
export function emDolares(kz: number, taxaKzPorUsd: number): number | null {
  if (!Number.isFinite(taxaKzPorUsd) || taxaKzPorUsd <= 0) return null;
  return Math.round((kz / taxaKzPorUsd) * 100) / 100;
}
