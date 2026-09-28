/**
 * Definições da plataforma (tabela `settings`): taxas, mínimos e câmbio.
 */

export type Definicoes = {
  fee_pct: number;
  affiliate_pct: number;
  min_payout: number;
  min_tip: number;
  min_topup: number;
  min_price: number;
  reference_days: number;
  usd_rate: number;
};

/** Valores usados enquanto as definições do servidor não chegam. */
export const DEFINICOES_PADRAO: Readonly<Definicoes> = {
  fee_pct: 20, affiliate_pct: 10, min_payout: 5000, min_tip: 200, min_topup: 1000, min_price: 500, reference_days: 3, usd_rate: 920,
};

type Spec = { label: string; min: number; max: number; int: boolean };

/** Limites de cada definição. `usd_rate` tem de ser > 0 (é divisor) e `fee_pct` < 100,
 *  senão o criador vê «Recebes -X%» e o valor do PayPal dá Infinity/NaN. */
export const SETTINGS_SPEC: Record<string, Spec> = {
  fee_pct: { label: 'Taxa da plataforma (%)', min: 0, max: 90, int: true },
  affiliate_pct: { label: 'Comissão de afiliado (% da venda, sai da taxa)', min: 0, max: 90, int: true },
  min_payout: { label: 'Levantamento mínimo (Kz)', min: 100, max: 10_000_000, int: true },
  min_tip: { label: 'Gorjeta mínima (Kz)', min: 1, max: 10_000_000, int: true },
  min_topup: { label: 'Carregamento mínimo (Kz)', min: 100, max: 10_000_000, int: true },
  min_price: { label: 'Preço mínimo (Kz)', min: 100, max: 10_000_000, int: true },
  usd_rate: { label: 'Câmbio para PayPal (Kz por 1 USD)', min: 1, max: 100_000, int: false },
  reference_days: { label: 'Validade das referências (dias)', min: 1, max: 90, int: true },
};

/** Valida e normaliza um valor de definição. Devolve `{ value }` ou `{ error }`. */
export function checkSetting(key: string, raw: unknown):
  { value: number; error?: undefined } | { value?: undefined; error: string } {
  const spec = SETTINGS_SPEC[key];
  if (!spec) return { value: Number(raw) || 0 };
  const n = Number(raw);
  if (raw === '' || raw === null || raw === undefined || !Number.isFinite(n)) {
    return { error: `${spec.label}: escreve um número.` };
  }
  if (spec.int && !Number.isInteger(n)) {
    return { error: `${spec.label}: tem de ser um número inteiro, sem casas decimais.` };
  }
  if (n < spec.min || n > spec.max) {
    return { error: `${spec.label}: tem de estar entre ${spec.min} e ${spec.max}.` };
  }
  return { value: n };
}

/**
 * Valida um conjunto de definições de uma vez, antes de gravar qualquer uma:
 * gravar linha a linha e falhar à quinta deixava as quatro primeiras gravadas.
 * Verifica também a regra entre campos: a taxa não pode deixar o criador a zero.
 */
export function validarDefinicoes(entradas: Array<{ key: string; raw: unknown }>):
  { rows: Array<{ key: string; value: number }>; error?: undefined } | { rows?: undefined; error: string } {
  const rows: Array<{ key: string; value: number }> = [];
  for (const e of entradas) {
    const r = checkSetting(e.key, e.raw);
    if (r.value === undefined) return { error: r.error };
    rows.push({ key: e.key, value: r.value });
  }
  const fee = rows.find((r) => r.key === 'fee_pct');
  if (fee && parteDoCriador(fee.value) <= 0) {
    return { error: 'A taxa da plataforma deixava os criadores a receber zero ou menos.' };
  }
  return { rows };
}

/** Percentagem de cada venda que fica para o criador. */
export const parteDoCriador = (feePct: number): number => 100 - (Number(feePct) || 0);
