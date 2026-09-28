// Estado da aplicação e dados do utilizador com sessão
import { sb } from './lib';
import type { Session } from '@supabase/supabase-js';
import type { Cfg, Creator, Profile } from './types';

/** Teto de conversas usadas para a contagem de mensagens por ler (ver loadCounts). */
const MSG_COUNT_CAP = 300;

/** Uma linha de `notifications`, como devolvida pelas consultas. */
export type Notif = {
  id: string;
  user_id: string;
  text: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
  [k: string]: any;
};

/** O que o formulário de registo por etapas vai preenchendo. Tudo opcional
 *  excepto o que a primeira etapa já exige — a partir daí os campos das etapas
 *  seguintes aparecem sozinhos (`cat`, `bio`, `iban`...). */
export type RegData = {
  tipo: string;                 // 'criador' | 'fa'
  interests: string[];
  name: string;
  handle: string;
  email?: string;
  country?: string;
  /* etapas do criador */
  cat?: string;
  bio?: string;
  city?: string;
  price?: number;
  pmode?: string;               // 'free' | 'paid'
  birth?: string;
  bank?: string;
  holder?: string;
  iban?: string;
  cterms?: string;              // checkbox de termos — 'on' quando marcado
};

/** Estado do registo por etapas, enquanto o utilizador preenche o formulário.
 *
 *  O `.js` original escrevia aqui de duas maneiras: `startOnboarding()` punha
 *  `{ i, upgrade, files, data }` e o registo normal punha só `{ data }` — as
 *  três primeiras ficavam a `undefined` e funcionavam por acaso, porque nada
 *  lia aquele objecto como estado de etapas. Aqui as duas construções dão a
 *  mesma forma, para o compilador poder exigir que não falte nada. */
export type Reg = {
  /** Índice da etapa em curso, 0-based. */
  i: number;
  /** `true` no registo de criador; `false` para um fã simples. */
  upgrade: boolean;
  appeal?: unknown;
  /** Ficheiros já escolhidos por campo (BI frente, verso, selfie). */
  files: Record<string, File | undefined>;
  data: RegData;
};

/** Contexto de uma live já montada (ver `mountLive`). Sobrevive a um re-render para
 *  que o `leave()` possa desligar câmara, microfone e canal mesmo depois de a view
 *  ter sido redesenhada por outro motivo. */
type LiveCtx = { id: string; host: boolean; join: boolean };

/** Rascunho de publicação guardado enquanto o utilizador navega entre separadores
 *  do estúdio. Sem isto, trocar de separador deita o texto por fora. */
type Draft = {
  title: string;
  body: string;
  access: 'free' | 'subscribers' | 'paid' | string;
  price: number;
  files?: File[];
};

/**
 * Estado da aplicação.
 *
 * NOTA: no `js/state.js` original, 18 destas chaves eram criadas a Flying —
 * `S.tq = ...`, `S.recovery = ...` — sem nunca estarem no objecto inicial. Na
 * prática `undefined` funcionava como "vazio" e nada rebentou, mas o estado
 * real da aplicação não estava escrito em lado nenhum. Aqui estão todas
 * declaradas. Foi a migração para TypeScript que as encontrou; com o `.js`
 * não haveria como vê-las.
 */
export type AppState = {
  session: Session | null;
  me: Profile | null;      // linha de profiles
  creator: Creator | null; // linha de creators do próprio (se existir)
  cfg: Cfg;
  unreadNotifs: number;
  unreadMsgs: number;
  notifs: Notif[];
  notifOpen: boolean;
  menu: boolean;
  reg: Reg | null;
  cat: string;
  q: string;
  ptab: string;
  stTab: string;
  ctTab: string;
  adTab: string;
  /** Filtro escolhido em cada fila da administração (ex.: `{ denuncias: 'open' }`). */
  adFilter: Record<string, string>;
  topTab: string;
  thread: any;
  cleanup: Array<() => void>; // funções a correr ao sair da página (canais em tempo real, lives)
  draft: Draft | null;
  comprasPage: number;         // página atual de "Meus conteúdos"

  /* --- chaves que o js original criava sem declarar --- */
  /** Recuperação de palavra-passe em curso: força o router para `#nova-senha`. */
  recovery: boolean;
  /** Texto de pesquisa de conversas (mensagens) e de utilizadores (admin). */
  tq: string;
  uq: string;
  /** Ficheiros já escolhidos no editor de publicação, por remover da view. */
  draftFiles: File[];
  /** Id do post que o estúdio está a confirmar que se quer apagar (double-confirm). */
  confirmDel: string | null;
  /** Contexto da live montada em `lives.ts`. */
  liveCtx: LiveCtx | null;
  /** Ficheiros anexados à mensagem PPV em compose. */
  ppvFiles: File[];
  /** Gorjeta: valor e alvo em memória enquanto o modal está aberto. */
  tipAmt: number;
  /**
   * Para quem é a gorjeta. Não é um id solto: uma gorjeta feita dentro de uma
   * live tem de levar também o `live_id`, senão o_server não a consegue imputar
   * à sessão e o dinheiro entra como "sem origem". Por isso é um objecto com
   * `liveId` opcional e não `creatorId: string`.
   */
  tipTarget: { creatorId: string; liveId?: string | null } | null;
  /** Carregamento da carteira: valor em memória. */
  topAmt: number;
  /** Editor de promoções: id da promoção em edição e ficheiros jáchosen. */
  promoEditId: string | null;
  promoFile: File | null;
  promoFileMobile: File | null;
  promoImageUrl: string | null;
  promoMobileImageUrl: string | null;
  promoMediaType: string | null;
  /** Id do factor TOTP acabado de pedir ao Factors, enquanto o modal de
   *  confirmação está aberto. O `.js` guardava aqui só o id. */
  mfaEnroll: string | null;
  /** Motivo que o criador deu ao PEDIR para ser reavaliado pelo KYC. */
  kycReason: string;
};

export const S: AppState = {
  session: null,
  me: null,
  creator: null,
  cfg: { fee_pct: 20, affiliate_pct: 10, min_payout: 5000, min_tip: 200, min_topup: 1000, min_price: 500, reference_days: 3, usd_rate: 920 },
  unreadNotifs: 0,
  unreadMsgs: 0,
  notifs: [],
  notifOpen: false,
  menu: false,
  reg: null,
  cat: 'Tudo',
  q: '',
  ptab: 'pub', stTab: 'visao', ctTab: 'perfil', adTab: 'visao', adFilter: {}, topTab: 'week',
  thread: null,
  cleanup: [],
  draft: null,
  comprasPage: 0,

  recovery: false,
  tq: '', uq: '',
  draftFiles: [],
  confirmDel: null,
  liveCtx: null,
  ppvFiles: [],
  tipAmt: 0, tipTarget: null,
  topAmt: 0,
  promoEditId: null, promoFile: null, promoFileMobile: null,
  promoImageUrl: null, promoMobileImageUrl: null, promoMediaType: null,
  mfaEnroll: null,
  kycReason: '',
};

export const netPct = (): number => 100 - Number(S.cfg.fee_pct || 0);

/** Equipa de staff: admin (tudo) ou moderator (moderação, sem dinheiro nem mensagens privadas). */
export const isStaff = (u: Partial<Profile> | null = S.me): boolean =>
  u?.role === 'admin' || u?.role === 'moderator';
/** Só o admin completo vê vendas, receita, levantamentos, mensagens privadas, promoções e definições. */
export const isAdmin = (u: Partial<Profile> | null = S.me): boolean => u?.role === 'admin';

/** Limites de cada definição da plataforma. `usd_rate` tem de ser > 0 (é divisor) e `fee_pct` < 100,
 *  senão o criador vê "Recebes -X%" e o valor do PayPal dá Infinity/NaN. */
type Spec = { label: string; min: number; max: number; int: boolean };
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

/** Valida e normaliza um valor de definição. Devolve { value } ou { error }. */
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

export async function loadCfg(): Promise<void> {
  const { data } = await sb.from('settings').select('key,value');
  for (const r of (data || []) as Array<{ key: keyof Cfg; value: unknown }>) {
    S.cfg[r.key] = Number(r.value);
  }
}

export async function loadMe(): Promise<Profile | null> {
  const { data: { session } } = await sb.auth.getSession();
  S.session = session;
  if (!session) { S.me = null; S.creator = null; return null; }
  const uid = session.user.id;
  const [{ data: me }, { data: cr }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
    sb.from('creators').select('*').eq('id', uid).maybeSingle(),
  ]);
  S.me = (me as Profile | null) ?? null;
  S.creator = (cr as Creator | null) ?? null;
  if (S.me) S.me.email = session.user.email ?? undefined;
  await loadCounts();
  return S.me;
}

export async function refreshMe(): Promise<void> {
  if (!S.session) return;
  const uid = S.session.user.id;
  const [{ data: me }, { data: cr }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
    sb.from('creators').select('*').eq('id', uid).maybeSingle(),
  ]);
  if (me) {
    (me as Profile).email = S.session.user.email ?? undefined;
    S.me = me as Profile;
  }
  S.creator = (cr as Creator | null) ?? null;
}

export async function loadCounts(): Promise<void> {
  if (!S.me) return;
  const uid = S.me.id;
  const [{ count }, { data: th }] = await Promise.all([
    sb.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('read_at', null),
    // Traz só as conversas com atividade recente. Sem limite isto descarrega a vida toda do
    // utilizador para contar não-lidas; a partir de MSG_COUNT_CAP a contagem pode ficar
    // incompleta, o que é preferível a um payload que rebenta o limite de URL do PostgREST.
    sb.from('threads').select('id,fan_id,creator_id,last_message_at,fan_read_at,creator_read_at')
      .or(`fan_id.eq.${uid},creator_id.eq.${uid}`)
      .order('last_message_at', { ascending: false }).limit(MSG_COUNT_CAP),
  ]);
  S.unreadNotifs = count || 0;
  S.unreadMsgs = (th || []).filter((t: any) =>
    new Date(t.last_message_at) > new Date(t.fan_id === uid ? t.fan_read_at : t.creator_read_at),
  ).length;
}
