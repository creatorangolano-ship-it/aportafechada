// Arranque, cabeçalho, notificações, rotas e eventos
import { sb, $, $$, esc, kz, ic, LOGO, avatarOf, toast, closeModal, errText, ago, rerender, go, clearUrlCache } from './lib';
import { S, loadMe, loadCfg, cfgReady, loadCounts, refreshMe, isStaff, type Notif } from './state';
import { INFO, PUBLIC } from './rotas';
import { modulos, carregarTodos, preCarregar } from './modulos';
import { action, register, handleSubmit, handleChange, handleInput } from './registry';
import type { FormControl } from './types';

/* ---------- Tema ---------- */
const isDark = (): boolean => document.documentElement.dataset.theme === 'dark';
function setTheme(t: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('apf-theme', t); } catch { /* modo privado */ }
}

/* ---------- Cabeçalho ---------- */
type NavItem = [string, string, string];
function navFor(): NavItem[] {
  const n: NavItem[] = [['feed', 'Início', 'home'], ['explorar', 'Explorar', 'compass'], ['lives', 'Lives', 'live'], ['mensagens', 'Mensagens', 'chat']];
  if (S.creator) return [['estudio', 'Estúdio', 'grid'], ...n];
  if (isStaff(S.me)) return [['admin', 'Administração', 'shield'], ...n];
  return [...n, ['compras', 'Meus conteúdos', 'bookmark'], ['subscricoes', 'Subscrições', 'star']];
}

export function header(r: string): void {
  const theme = `<button class="tbtn" data-act="theme" aria-label="${isDark() ? 'Mudar para modo claro' : 'Mudar para modo escuro'}" title="${isDark() ? 'Modo claro' : 'Modo escuro'}">${ic(isDark() ? 'sun' : 'moon')}</button>`;
  const brand = `<a class="brand" href="#inicio">${LOGO()}<span>À Porta Fechada</span></a>`;
  // A rota fica no <body> para o CSS poder dar a cada página o seu próprio
  // enquadramento (o feed é mais largo e tem fundo cinzento, como o do Facebook).
  document.body.dataset.route = document.documentElement.dataset.route = r.split('-')[0];
  const authed = !!(S.me && S.me.onboarded);
  document.body.classList.toggle('authed', authed);
  if (!authed) {
    document.body.classList.remove('console', 'adnav-open');
    const bare = r === 'inicio' || (r === 'registar' && !S.me);
    $('.top')!.hidden = bare;
    $('#hdr')!.innerHTML = bare ? '' : `${brand}${S.me ? '<button class="btn out sm" data-act="logout">Sair</button>' : `<a class="btn out sm" href="#inicio">Entrar</a>${r === 'registar' ? '' : '<a class="btn pri sm" href="#registar">Criar conta</a>'}`}${theme}`;
    $('#floatTheme')!.innerHTML = bare ? `<div class="float-theme">${theme}</div>` : '';
    $('#tabbar')!.innerHTML = ''; return;
  }
  const n = S.unreadNotifs;
  const bell = `<div class="nwrap"><button class="tbtn bell" data-act="notif" aria-label="Notificações${n ? ', ' + n + ' por ler' : ''}" aria-expanded="${S.notifOpen}">${ic('bell')}${n ? `<span class="count">${n > 9 ? '9+' : n}</span>` : ''}</button>
   ${S.notifOpen ? `<div class="npanel"><div class="hd"><b style="color:var(--ink)">Notificações</b>${n ? '<button class="btn link small" data-act="notifAll">Marcar tudo como lido</button>' : ''}</div><div style="max-height:420px;overflow-y:auto">${S.notifs.map((x) => `<button class="it ${x.read_at ? '' : 'un'}" data-act="notifGo" data-id="${x.id}" data-link="${esc(x.link || '')}"><span class="dot ${x.read_at ? 'off' : ''}"></span><span style="flex:1"><span style="color:var(--ink)">${esc(x.text)}</span><br><span class="small muted">${ago(x.created_at)}</span></span></button>`).join('') || '<p class="empty">Sem notificações.</p>'}</div></div>` : ''}</div>`;
  // A administração é uma consola à parte: tem a sua própria barra lateral
  // (views/admin.ts), por isso o cabeçalho e a barra de separadores do site saem.
  // O sino fica: vai para #floatTheme, que sobrevive aos re-renders do #app e
  // que o CSS encosta ao canto da barra de topo da consola.
  const consola = r === 'admin' && isStaff(S.me);
  document.body.classList.toggle('console', consola);
  if (!consola) document.body.classList.remove('adnav-open');
  if (consola) { $('.top')!.hidden = true; $('#hdr')!.innerHTML = ''; $('#floatTheme')!.innerHTML = `<div class="float-theme adbell">${bell}</div>`; $('#tabbar')!.innerHTML = ''; return; }
  const base = r.split('-')[0];
  const links = navFor().map(([k, l, i]) => `<a href="#${k}" class="${base === k || (k === 'explorar' && ['perfil', 'top', 'p'].includes(base)) || (k === 'lives' && base === 'live') ? 'on' : ''}">${ic(i)}<span>${l}</span>${k === 'mensagens' && S.unreadMsgs ? `<span class="count">${S.unreadMsgs}</span>` : ''}</a>`).join('');
  const wal = !isStaff(S.me) ? `<a class="wpill" href="#carteira" title="Saldo da carteira">${ic('wallet')}<span class="num">${kz(S.me!.wallet_balance)}</span></a>` : '';
  const u = S.me!;
  $('.top')!.hidden = false; $('#floatTheme')!.innerHTML = '';
  $('#hdr')!.innerHTML = `${brand}<nav class="nav" aria-label="Principal">${links}</nav>${wal}${bell}${theme}
   <div class="me"><button data-act="menu" aria-expanded="${S.menu}" aria-haspopup="true">${avatarOf(u, 'xs')}<span class="nm">${esc((u.name || u.handle).split(' ')[0])}</span></button>
   ${S.menu ? `<div class="menu" role="menu"><div class="hd"><b style="color:var(--ink)">${esc(u.name || u.handle)}</b><div class="small muted">@${esc(u.handle)}</div></div>
    ${S.creator ? `<a href="#perfil-${esc(u.handle)}" role="menuitem">${ic('user')}O meu perfil público</a><a href="#subscricoes" role="menuitem">${ic('star')}As minhas subscrições</a>` : ''}
    ${!isStaff(u) ? `<a href="#carteira" role="menuitem">${ic('wallet')}Carteira</a>` : ''}
    <a href="#top" role="menuitem">${ic('trophy')}Top 10</a>
    <a href="#conta" role="menuitem">${ic('settings')}Definições da conta</a>
    ${!S.creator && !isStaff(u) ? `<button data-act="becomeCreator" role="menuitem">${ic('star')}Tornar-me criador</button>` : ''}
    <a href="#faq" role="menuitem">${ic('info')}Ajuda e regras</a>
    <button data-act="logout" role="menuitem">${ic('out')}Sair</button></div>` : ''}</div>`;
  $('#tabbar')!.innerHTML = links;
}

/* ---------- Rotas ---------- */
// Um link partilhado truncado ("#p-%", ou o WhatsApp a cortar a query) faz decodeURIComponent
// lançar URIError. Sem este try, render() morria antes do seu próprio try e a app ficava
// presa no "A carregar…" sem forma de recuperar sem recarregar a página.
const route = (): string => {
  let h = (location.hash || '').slice(1);
  try { h = decodeURIComponent(h); } catch { h = ''; }
  return h || 'inicio';
};
const home = (): string => (S.creator ? 'estudio' : isStaff() ? 'admin' : 'feed');
let renderSeq = 0;

/**
 * Tabela de rotas. Cada entrada descarrega a área de que precisa (import
 * dinâmico) e só então desenha a vista — a página de entrada não paga pelo
 * código do estúdio, das lives ou da administração.
 *
 * `cfg: true` marca as páginas que mostram ou validam valores das definições
 * (taxas, mínimos). Só essas esperam pelas definições; as outras desenham logo.
 */
type Rota = { v: (arg: string) => Promise<string>; cfg?: boolean };
const ROUTES: Record<string, Rota> = {
  inicio: { v: () => modulos.public().then((m) => m.vInicio()) },
  confirmar: { v: () => modulos.public().then((m) => m.vConfirmEmail()) },
  'nova-senha': { v: () => modulos.public().then((m) => m.vNovaSenha()) },
  top: { v: () => modulos.public().then((m) => m.vTop()) },
  registar: { v: () => modulos.public().then((m) => (S.me ? m.vOnboarding() : m.vSignup())), cfg: true },
  info: { v: (r) => modulos.public().then((m) => m.vInfo(r)), cfg: true },
  feed: { v: () => modulos.fan().then((m) => m.vFeed()) },
  explorar: { v: () => modulos.fan().then((m) => m.vExplorar()) },
  perfil: { v: (h) => modulos.fan().then((m) => m.vPerfil(h)) },
  p: { v: (id) => modulos.fan().then((m) => m.vPost(id)) },
  subscricoes: { v: () => modulos.fan().then((m) => m.vSubs()) },
  compras: { v: () => modulos.fan().then((m) => m.vCompras()) },
  carteira: { v: () => modulos.fan().then((m) => m.vCarteira()), cfg: true },
  mensagens: { v: () => modulos.messages().then((m) => m.vMensagens()) },
  lives: { v: () => modulos.lives().then((m) => m.vLives()) },
  live: { v: (id) => modulos.lives().then((m) => m.vLive(id)) },
  estudio: { v: () => modulos.studio().then((m) => m.vEstudio()), cfg: true },
  conta: { v: () => modulos.account().then((m) => m.vConta()), cfg: true },
  admin: { v: () => modulos.admin().then((m) => m.vAdmin()), cfg: true },
};

/** Resolve o nome da rota (e o argumento, em `perfil-x`, `p-x`, `live-x`) para a entrada da tabela. */
function resolver(r: string): { rota: Rota; arg: string } {
  for (const pre of ['perfil', 'p', 'live']) if (r.startsWith(pre + '-')) return { rota: ROUTES[pre], arg: r.slice(pre.length + 1) };
  if (INFO.includes(r)) return { rota: ROUTES.info, arg: r };
  return { rota: ROUTES[r] || (S.me ? ROUTES.feed : ROUTES.inicio), arg: '' };
}

export async function render(keep = false): Promise<void> {
  const seq = ++renderSeq;
  let r = route();
  S.cleanup.forEach((f) => { try { f(); } catch { /* ignorar */ } }); S.cleanup = [];
  S.menu = false; S.notifOpen = false;

  if (S.recovery && r !== 'nova-senha') { history.replaceState(null, '', '#nova-senha'); r = 'nova-senha'; }
  if (!S.me && !PUBLIC.includes(r)) { history.replaceState(null, '', '#inicio'); r = 'inicio'; toast('Entra ou cria conta para continuar.'); }
  if ((S.me && !S.me.onboarded && !PUBLIC.includes(r)) || (S.me && !S.me.onboarded && ['inicio', 'confirmar'].includes(r))) { history.replaceState(null, '', '#registar'); r = 'registar'; }
  if (S.me && S.me.onboarded && ['inicio', 'confirmar'].includes(r)) { history.replaceState(null, '', '#' + home()); r = home(); }
  if (S.me && S.me.onboarded && r === 'registar' && (!S.reg?.upgrade || (S.creator && S.creator.status !== 'rejected'))) { history.replaceState(null, '', '#' + home()); r = home(); }
  if (r === 'estudio' && !S.creator) { history.replaceState(null, '', '#conta'); r = 'conta'; }
  if (r === 'admin' && !isStaff(S.me)) { history.replaceState(null, '', '#' + home()); r = home(); }

  header(r);
  const app = $('#app')!;
  if (!keep) app.innerHTML = `<div class="skel">${LOGO(24, 30)}<span>A carregar<i></i><i></i><i></i></span></div>`;
  let h: string;
  try {
    const { rota, arg } = resolver(r);
    if (rota.cfg) await cfgReady();
    h = await rota.v(arg);
  } catch (e) {
    console.error(e);
    h = `<div class="empty"><h2>Não foi possível carregar</h2><p style="margin-top:8px">${esc(errText(e))}</p><button class="btn out" style="margin-top:14px" data-act="reload">Tentar outra vez</button></div>`;
  }
  if (seq !== renderSeq) return; // outra navegação entretanto
  app.innerHTML = h;
  $('#foot')!.hidden = !!(S.me?.onboarded) && !INFO.includes(r);
  const t10 = $('#footTop10'); if (t10) t10.hidden = r === 'inicio';
  if (!keep) window.scrollTo(0, 0);
  const cs = $('#chatScroll'); if (cs) cs.scrollTop = cs.scrollHeight;
  const c0 = $<HTMLInputElement>('#cd0'); if (c0) c0.focus();
  if (r.startsWith('live-')) void modulos.lives().then((m) => m.mountLive());
  // Só mostra "Ver mais" nos textos de publicações que ficam mesmo cortados pelo limite de linhas.
  $$<HTMLButtonElement>('.postbody.clamp').forEach((el) => { const btn = el.nextElementSibling; if (btn?.matches('.more-btn')) (btn as HTMLElement).hidden = el.scrollHeight <= el.clientHeight + 1; });
}

/* ---------- Notificações em tempo real ---------- */
let notifCh: ReturnType<typeof sb.channel> | null = null;

async function loadNotifs(): Promise<void> {
  const { data } = await sb.from('notifications').select('*').eq('user_id', S.me!.id).order('created_at', { ascending: false }).limit(30);
  S.notifs = (data as Notif[]) || [];
}

function startRealtime(): void {
  if (!S.me || notifCh) return;
  notifCh = sb.channel('notif-' + S.me.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${S.me.id}` }, async (x) => {
      S.notifs.unshift(x.new as Notif); S.unreadNotifs++; toast((x.new as Notif).text);
      await refreshMe(); header(route());
    }).subscribe();
  // O canal das mensagens vive na área de mensagens: descarrega-a em segundo
  // plano em vez de a pôr no arranque.
  void modulos.messages().then((m) => m.startMessagesRealtime());
}

function stopRealtime(): void {
  if (notifCh) { void sb.removeChannel(notifCh); notifCh = null; }
  void modulos.messages().then((m) => { m.setRealtimeThread(null); m.stopMessagesRealtime(); });
}

/* ---------- Ações globais (cabeçalho, tema, sessão) ---------- */
register({ actions: {
  closeModal,
  reload() { rerender(false); },
  theme() { setTheme(isDark() ? 'light' : 'dark'); rerender(true); },
  menu() { S.menu = !S.menu; S.notifOpen = false; header(route()); },
  async notif() {
    S.notifOpen = !S.notifOpen; S.menu = false;
    if (S.notifOpen) await loadNotifs();
    header(route());
  },
  async notifAll() {
    await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', S.me!.id).is('read_at', null);
    S.notifs.forEach((n) => (n.read_at = n.read_at || new Date().toISOString())); S.unreadNotifs = 0; header(route());
  },
  async notifGo(d) {
    // .eq('user_id', ...) para além do id: sem isto, um id adulterado marcava a notificação
    // de outra pessoa como lida, e a segurança ficava só na RLS.
    await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', d.id!).eq('user_id', S.me!.id).is('read_at', null);
    S.notifOpen = false; await loadCounts();
    const l = d.link || '';
    go(l.startsWith('post/') ? 'p-' + l.slice(5) : l.startsWith('live/') ? 'live-' + l.slice(5) : l || home());
  },
  async logout() { S.menu = false; closeModal(); clearUrlCache(); await sb.auth.signOut(); },
  async becomeCreator() {
    S.menu = false;
    if (S.creator) { toast('Já tens conta de criador.'); return go('estudio'); }
    (await modulos.public()).startOnboarding(true); go('registar');
  },
} });

/* ---------- Eventos ---------- */
document.addEventListener('click', (e) => {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  const scrim = t.closest('[data-scrim]');
  if (scrim && t === scrim && !scrim.hasAttribute('data-lock')) { closeModal(); return; }
  if (S.menu && !t.closest('.me')) { S.menu = false; header(route()); }
  if (S.notifOpen && !t.closest('.nwrap')) { S.notifOpen = false; header(route()); }
  const el = t.closest<HTMLElement>('[data-act]'); if (!el) return;
  const nome = el.dataset.act!;
  if (el.tagName !== 'A') e.preventDefault();
  // O dataset traz `string | undefined` (um `data-x` ausente é undefined, não "").
  // O tipo das acções declara `Record<string, string>` porque nenhum handler deve
  // depender de uma chave estar presente; a conversão é explícita e central.
  const dados = { ...el.dataset } as Record<string, string>;
  // Um comando de uma área ainda não descarregada (ex.: «Instalar app» no rodapé)
  // descarrega as áreas que faltam e corre a seguir.
  const f = action(nome);
  const corre = f ? Promise.resolve(f(dados)) : carregarTodos().then(() => action(nome)?.(dados));
  corre.catch((err) => { console.error(err); toast(errText(err)); });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const s = $('[data-scrim]'); if (s && !s.hasAttribute('data-lock')) closeModal();
    if (S.menu || S.notifOpen) { S.menu = false; S.notifOpen = false; header(route()); }
    document.body.classList.remove('adnav-open'); // barra lateral da consola em ecrãs pequenos
  }
  const tgt = e.target as HTMLElement | null;
  if (tgt?.classList.contains('cd') && e.key === 'Backspace' && !(tgt as HTMLInputElement).value) {
    const p = tgt.previousElementSibling as HTMLInputElement | null;
    if (p) { p.focus(); p.value = ''; }
  }
});

document.addEventListener('paste', (e) => {
  const tgt = e.target as HTMLElement | null;
  if (!tgt?.classList.contains('cd')) return;
  const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
  if (!text) return;
  e.preventDefault();
  const all = $$<HTMLInputElement>('.cd'); all.forEach((i, k) => (i.value = text[k] || ''));
  all[Math.min(text.length, 5)]?.focus();
});

// Um temporizador por campo. Com um único partilhado, escrever nas mensagens cancelava a
// pesquisa de utilizadores a meio e vice-versa. (A pesquisa do Explorar vive em views/fan.)
let tqT: ReturnType<typeof setTimeout> | undefined, uqT: ReturnType<typeof setTimeout> | undefined;

document.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement | null;
  if (!t) return;
  if (t.classList.contains('cd')) { t.value = t.value.replace(/\D/g, '').slice(-1); (t.nextElementSibling as HTMLInputElement | null)?.focus(); return; }
  if (t.id === 'tq') { S.tq = t.value; clearTimeout(tqT); tqT = setTimeout(() => { void renderKeepFocus('#tq'); }, 350); return; }
  if (t.id === 'uq') { S.uq = t.value; clearTimeout(uqT); uqT = setTimeout(() => { void renderKeepFocus('#uq'); }, 450); return; }
  handleInput(t);
});

/** Redesenha mantendo o cursor no fim do campo de pesquisa, para não interromper a escrita. */
async function renderKeepFocus(sel: string): Promise<void> {
  await render(true);
  const n = $<HTMLInputElement>(sel);
  if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
}

document.addEventListener('change', async (e) => {
  // Um `change` só é disparado por um control de formulário a mudar de valor —
  // nunca por um contentor. A union é o `FormControl` de `types.ts`, e é ela
  // que dá às vistas o `.value` / `.name` / `.checked` sem `any`.
  await handleChange(e.target as FormControl);
});

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target as HTMLFormElement;
  try {
    if (await handleSubmit(f)) return;
    await carregarTodos(); await handleSubmit(f);
  } catch (err) { console.error(err); toast(errText(err)); }
});

document.addEventListener('apf:render', (e) => { void render(!!(e as CustomEvent).detail?.keep); });
document.addEventListener('apf:header', () => header(route()));
document.addEventListener('apf:paid', () => header(route()));
window.addEventListener('hashchange', () => { S.ptab = 'pub'; void render(false); });

/* ---------- Arranque ---------- */
export async function boot(): Promise<void> {
  const yr = $('#yr'); if (yr) yr.textContent = String(new Date().getFullYear());
  const u = new URL(location.href), ref = u.searchParams.get('ref');
  if (ref) {
    try { localStorage.setItem('apf-ref', ref); } catch { /* modo privado */ }
    u.searchParams.delete('ref');
    history.replaceState(null, '', u.pathname + (u.search || '') + location.hash);
  }
  // Em paralelo: as definições (com cache local) e a sessão. Antes eram em fila,
  // e a primeira página esperava pelas duas idas ao servidor uma atrás da outra.
  void loadCfg().catch(() => {});
  await loadMe().catch(() => {});
  if (S.me) {
    startRealtime();
    // O regresso do PayPal só existe com ?pp= ou ?pp_cancel= no URL — só então
    // vale a pena descarregar a área de pagamentos.
    if (/[?&]pp(_cancel)?=/.test(location.search)) await (await modulos.pay()).handlePaypalReturn();
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') { S.recovery = true; await loadMe(); location.hash = 'nova-senha'; return; }
    if (event === 'SIGNED_OUT') {
      stopRealtime(); clearUrlCache();
      S.me = null; S.creator = null; S.reg = null; S.thread = null; S.recovery = false;
      location.hash = 'inicio'; await render(); return;
    }
    if (event === 'SIGNED_IN') {
      // Se outra conta entrou noutro separador deste navegador (a sessão é partilhada), esta página
      // ficaria a mostrar o utilizador antigo com dados de outra pessoa (ex.: mensagens da conta errada).
      // Recarregar por completo evita esse estado inconsistente.
      if (S.me && session?.user?.id && session.user.id !== S.me.id) { location.reload(); return; }
      if (!S.me) { await loadMe(); startRealtime(); await render(); }
    }
    if (event === 'USER_UPDATED' && S.recovery) { S.recovery = false; }
  });

  await render();
  // Com a primeira página desenhada, pré-carrega em segundo plano as áreas para
  // onde a pessoa mais provavelmente vai a seguir.
  preCarregar(!S.me ? ['public'] : isStaff(S.me) ? ['admin', 'fan'] : S.creator ? ['studio', 'fan', 'messages'] : ['fan', 'messages']);
}
