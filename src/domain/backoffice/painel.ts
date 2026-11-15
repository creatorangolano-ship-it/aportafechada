/**
 * Painel da «Visão geral»: as regras dos filtros e das contas que os gráficos mostram.
 *
 * Tudo aqui é puro (sem datas do relógio nem base de dados): quem chama passa o dia de hoje.
 * As datas são sempre texto `AAAA-MM-DD`, no fuso de Luanda, como a função `admin_painel` as recebe.
 */

export type Periodo = '7' | '30' | '90' | '365' | 'custom';
export type TipoDeVenda = 'subscription' | 'post' | 'tip' | 'message' | 'ticket';
export type TipoDeConta = 'fas' | 'criadores';
export type Origem = 'afiliado' | 'sem_convite';

export type FiltrosDoPainel = {
  periodo: Periodo;
  /** Só com `periodo: 'custom'`. */
  de?: string | null;
  ate?: string | null;
  tipo?: TipoDeVenda | null;
  criador?: string | null;
  contas?: TipoDeConta | null;
  origem?: Origem | null;
  comparar: boolean;
};

export const PERIODOS: ReadonlyArray<[Periodo, string]> = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['365', '12 meses'], ['custom', 'Personalizado']];
export const TIPOS_DE_VENDA: ReadonlyArray<[TipoDeVenda, string]> = [
  ['subscription', 'Subscrições'], ['post', 'Publicações pagas'], ['tip', 'Gorjetas'], ['message', 'Mensagens pagas'], ['ticket', 'Bilhetes de lives'],
];
export const TIPOS_DE_CONTA: ReadonlyArray<[TipoDeConta, string]> = [['fas', 'Só fãs'], ['criadores', 'Só criadores']];
export const ORIGENS: ReadonlyArray<[Origem, string]> = [['afiliado', 'Convidados por afiliados'], ['sem_convite', 'Sem convite']];

/** O máximo que a função da base de dados aceita. */
export const MAX_DIAS = 732;

export const FILTROS_INICIAIS: FiltrosDoPainel = { periodo: '30', comparar: true };

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const eData = (s: unknown): s is string => typeof s === 'string' && DATA.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const dia = (s: string) => Date.parse(s + 'T00:00:00Z') / 864e5;
const texto = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);

export const rotuloDe = <T extends string>(lista: ReadonlyArray<[T, string]>, v: T | null | undefined): string | null =>
  lista.find(([k]) => k === v)?.[1] ?? null;

/** Dias entre duas datas, contando as duas. */
export const diasEntre = (de: string, ate: string): number => dia(ate) - dia(de) + 1;

/**
 * Converte o período escolhido nas duas datas a pedir (inclusive).
 * Devolve a mensagem de erro quando o período personalizado não é válido.
 */
export function resolverPeriodo(f: Pick<FiltrosDoPainel, 'periodo' | 'de' | 'ate'>, hoje: string): { de: string; ate: string } | { erro: string } {
  if (!eData(hoje)) return { erro: 'Data de hoje inválida.' };
  if (f.periodo !== 'custom') {
    const n = Number(f.periodo);
    if (![7, 30, 90, 365].includes(n)) return { erro: 'Período inválido.' };
    return { de: texto(dia(hoje) - n + 1), ate: hoje };
  }
  if (!eData(f.de) || !eData(f.ate)) return { erro: 'Escolhe as duas datas.' };
  if (f.ate < f.de) return { erro: 'A data final é anterior à inicial.' };
  if (f.ate > hoje) return { erro: 'A data final não pode ser depois de hoje.' };
  if (diasEntre(f.de, f.ate) > MAX_DIAS) return { erro: 'O período não pode passar de 2 anos.' };
  return { de: f.de, ate: f.ate };
}

/** Recusa valores fora das listas (um filtro inventado nunca chega à base de dados). */
export function recusaFiltros(f: FiltrosDoPainel): string | null {
  if (!PERIODOS.some(([k]) => k === f.periodo)) return 'Período inválido.';
  if (f.tipo && !TIPOS_DE_VENDA.some(([k]) => k === f.tipo)) return 'Tipo de venda inválido.';
  if (f.contas && !TIPOS_DE_CONTA.some(([k]) => k === f.contas)) return 'Tipo de conta inválido.';
  if (f.origem && !ORIGENS.some(([k]) => k === f.origem)) return 'Origem inválida.';
  if (f.criador && !/^[0-9a-f-]{36}$/i.test(f.criador)) return 'Criador inválido.';
  return null;
}

/**
 * Variação em percentagem face ao período anterior, com uma casa decimal.
 * `null` quando não há base de comparação (o anterior foi zero).
 */
export function variacao(actual: number, anterior: number): number | null {
  if (!Number.isFinite(actual) || !Number.isFinite(anterior) || anterior <= 0) return null;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

/** Que parte de `de` chegou a `para`, em percentagem inteira; `null` se `de` for zero. */
export function conversao(para: number, de: number): number | null {
  if (!de || de <= 0) return null;
  return Math.round((para / de) * 100);
}

/** Quanto cada parte pesa no total, em percentagens inteiras que somam 100 (maior resto). */
export function percentagens(valores: number[]): number[] {
  const total = valores.reduce((s, v) => s + Math.max(0, v), 0);
  if (!total) return valores.map(() => 0);
  const brutos = valores.map((v) => (Math.max(0, v) / total) * 100);
  const base = brutos.map(Math.floor);
  let falta = 100 - base.reduce((s, v) => s + v, 0);
  const ordem = brutos.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of ordem) { if (falta-- <= 0) break; base[i]++; }
  return base;
}

/** Um passo «redondo» para as linhas do eixo vertical (1, 2, 2,5 ou 5 × 10ⁿ), com 4 divisões. */
export function escalaDoEixo(maximo: number, inteiro = false, divisoes = 4): { passo: number; topo: number } {
  if (!(maximo > 0)) return { passo: 1, topo: divisoes };
  const bruto = maximo / divisoes;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const multiplos = inteiro ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  let passo = multiplos.map((m) => m * pot).find((p) => p >= bruto)!;
  if (inteiro) passo = Math.max(1, Math.ceil(passo));
  return { passo, topo: passo * divisoes };
}
