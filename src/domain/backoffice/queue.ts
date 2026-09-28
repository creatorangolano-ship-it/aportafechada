/**
 * Filas de trabalho da administração: verificações, denúncias, levantamentos e
 * pedidos de suporte. Todas partilham a mesma noção de «há quanto tempo espera»
 * e de «está atrasada».
 */

/** Acima disto, um item à espera conta como atrasado (a consola pinta-o a laranja). */
export const HORAS_ATE_ATRASO = 48;

export const horasDeEspera = (criadoEm: string | Date, agora: Date = new Date()): number =>
  (agora.getTime() - new Date(criadoEm).getTime()) / 3_600_000;

export const estaAtrasado = (criadoEm: string | Date, agora: Date = new Date()): boolean =>
  horasDeEspera(criadoEm, agora) > HORAS_ATE_ATRASO;

/** «há 5 h», «há 3 dias» — como a equipa lê a espera. */
export function descreverEspera(criadoEm: string | Date, agora: Date = new Date()): string {
  const h = horasDeEspera(criadoEm, agora);
  if (h < 1) return 'há menos de 1 h';
  if (h < 48) return `há ${Math.floor(h)} h`;
  return `há ${Math.floor(h / 24)} dias`;
}

/**
 * Contagem de uma fila. `null` quando não foi possível contar (erro, sem
 * permissão): uma fila que não se consegue ler nunca pode aparecer «em dia».
 */
export type Contagem = number | null;
export type ContagensDasFilas = { kyc: Contagem; rep: Contagem; pay: Contagem; ct: Contagem };
