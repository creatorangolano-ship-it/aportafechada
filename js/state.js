// Estado da aplicação e dados do utilizador com sessão
import { sb } from './lib.js';

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
};

export const role = () => S.me?.role || null;
export const isCreator = () => !!S.creator;
export const creatorApproved = () => S.creator?.status === 'approved';
export const netPct = () => 100 - Number(S.cfg.fee_pct || 0);

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
    sb.from('threads').select('id,fan_id,creator_id,last_message_at,fan_read_at,creator_read_at').or(`fan_id.eq.${uid},creator_id.eq.${uid}`),
  ]);
  S.unreadNotifs = count || 0;
  S.unreadMsgs = (th || []).filter((t) => new Date(t.last_message_at) > new Date(t.fan_id === uid ? t.fan_read_at : t.creator_read_at)).length;
}
