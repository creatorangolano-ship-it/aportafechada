// Estado da aplicação e dados do utilizador com sessão
import { sb } from './lib.js';

/** Teto de conversas usadas para a contagem de mensagens por ler (ver loadCounts). */
const MSG_COUNT_CAP = 300;

export const S = {
  session: null,
  me: null,          // linha de profiles
  creator: null,     // linha de creators do próprio (se existir)
  cfg: { fee_pct: 20, affiliate_pct: 10, min_payout: 5000, min_tip: 200, min_topup: 1000, min_price: 500, reference_days: 3, usd_rate: 920 },
  unreadNotifs: 0,
  unreadMsgs: 0,
  notifs: [],
  notifOpen: false,
  menu: false,
  reg: null,         // estado do registo por etapas
  cat: 'Tudo', q: '',
  ptab: 'pub', stTab: 'visao', ctTab: 'perfil', adTab: 'visao', topTab: 'week',
  thread: null,
  cleanup: [],       // funções a correr ao sair da página (canais em tempo real, lives)
  draft: null,
  comprasPage: 0,    // página atual de "Meus conteúdos"
};

export const netPct = () => 100 - Number(S.cfg.fee_pct || 0);

/** Equipa de staff: admin (tudo) ou moderator (moderação, sem dinheiro nem mensagens privadas). */
export const isStaff = (u = S.me) => u?.role === 'admin' || u?.role === 'moderator';
/** Só o admin completo vê vendas, receita, levantamentos, mensagens privadas, promoções e definições. */
export const isAdmin = (u = S.me) => u?.role === 'admin';

/** Limites de cada definição da plataforma. `usd_rate` tem de ser > 0 (é divisor) e `fee_pct` < 100,
 *  senão o criador vê "Recebes -X%" e o valor do PayPal dá Infinity/NaN. */
export const SETTINGS_SPEC = {
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
export function checkSetting(key, raw) {
  const spec = SETTINGS_SPEC[key];
  if (!spec) return { value: Number(raw) || 0 };
  const n = Number(raw);
  if (raw === '' || raw === null || raw === undefined || !Number.isFinite(n)) return { error: `${spec.label}: escreve um número.` };
  if (spec.int && !Number.isInteger(n)) return { error: `${spec.label}: tem de ser um número inteiro, sem casas decimais.` };
  if (n < spec.min || n > spec.max) return { error: `${spec.label}: tem de estar entre ${spec.min} e ${spec.max}.` };
  return { value: n };
}

export async function loadCfg() {
  const { data } = await sb.from('settings').select('key,value');
  for (const r of data || []) S.cfg[r.key] = Number(r.value);
}

export async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  S.session = session;
  if (!session) { S.me = null; S.creator = null; return null; }
  const uid = session.user.id;
  const [{ data: me }, { data: cr }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
    sb.from('creators').select('*').eq('id', uid).maybeSingle(),
  ]);
  S.me = me; S.creator = cr || null;
  if (me) S.me.email = session.user.email;
  await loadCounts();
  return me;
}

export async function refreshMe() {
  if (!S.session) return;
  const uid = S.session.user.id;
  const [{ data: me }, { data: cr }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
    sb.from('creators').select('*').eq('id', uid).maybeSingle(),
  ]);
  if (me) { me.email = S.session.user.email; S.me = me; }
  S.creator = cr || null;
}

export async function loadCounts() {
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
  S.unreadMsgs = (th || []).filter((t) => new Date(t.last_message_at) > new Date(t.fan_id === uid ? t.fan_read_at : t.creator_read_at)).length;
}
