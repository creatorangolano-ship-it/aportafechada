// Arranque, cabeçalho, notificações, rotas e eventos
import { sb, $, $$, esc, kz, ic, LOGO, avatarOf, toast, closeModal, errText, ago, rerender, go, clearUrlCache } from './lib.js';
import { S, loadMe, loadCfg, loadCounts, refreshMe, isStaff } from './state.js';
import { handlePaypalReturn, payActions, payChange, paySubmit } from './pay.js';
import { vInicio, vSignup, vConfirmEmail, vNovaSenha, vOnboarding, vTop, vInfo, INFO, publicActions, publicSubmit, publicChange, startOnboarding } from './views/public.js';
import { vFeed, vExplorar, vPerfil, vPost, vSubs, vCarteira, vCompras, exploreGrid, fanActions } from './views/fan.js';
import { vMensagens, msgActions, msgSubmit, msgChange, startMessagesRealtime, stopMessagesRealtime, setRealtimeThread } from './views/messages.js';
import { vLives, vLive, mountLive, liveActions, liveSubmit } from './views/lives.js';
import { vEstudio, studioActions, studioSubmit, studioChange, studioInput } from './views/studio.js';
import { vConta, accountActions, accountSubmit, accountChange } from './views/account.js';
import { vAdmin, adminActions, adminSubmit, adminChange } from './views/admin.js';

/* ---------- Tema ---------- */
const isDark = () => document.documentElement.dataset.theme === 'dark';
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('apf-theme', t); } catch { /* */ } }

/* ---------- Cabeçalho ---------- */
const PUBLIC = ['inicio', 'registar', 'confirmar', 'nova-senha', 'top', ...INFO];
function navFor() {
  const n = [['feed', 'Início', 'home'], ['explorar', 'Explorar', 'compass'], ['lives', 'Lives', 'live'], ['mensagens', 'Mensagens', 'chat']];
  if (S.creator) return [['estudio', 'Estúdio', 'grid'], ...n];
  if (isStaff(S.me)) return [['admin', 'Administração', 'shield'], ...n];
  return [...n, ['compras', 'Meus conteúdos', 'bookmark'], ['subscricoes', 'Subscrições', 'star']];
}
function header(r) {
  const theme = `<button class="tbtn" data-act="theme" aria-label="${isDark() ? 'Mudar para modo claro' : 'Mudar para modo escuro'}" title="${isDark() ? 'Modo claro' : 'Modo escuro'}">${ic(isDark() ? 'sun' : 'moon')}</button>`;
  const brand = `<a class="brand" href="#inicio">${LOGO()}<span>À Porta Fechada</span></a>`;
  const authed = !!(S.me && S.me.onboarded);
  document.body.classList.toggle('authed', authed);
  if (!authed) {
    const bare = r === 'inicio' || (r === 'registar' && !S.me);
    $('.top').hidden = bare;
    $('#hdr').innerHTML = bare ? '' : `${brand}${S.me ? '<button class="btn out sm" data-act="logout">Sair</button>' : `<a class="btn out sm" href="#inicio">Entrar</a>${r === 'registar' ? '' : '<a class="btn pri sm" href="#registar">Criar conta</a>'}`}${theme}`;
    $('#floatTheme').innerHTML = bare ? `<div class="float-theme">${theme}</div>` : '';
    $('#tabbar').innerHTML = ''; return;
  }
  const base = r.split('-')[0];
  const links = navFor().map(([k, l, i]) => `<a href="#${k}" class="${base === k || (k === 'explorar' && ['perfil', 'top', 'p'].includes(base)) || (k === 'lives' && base === 'live') ? 'on' : ''}">${ic(i)}<span>${l}</span>${k === 'mensagens' && S.unreadMsgs ? `<span class="count">${S.unreadMsgs}</span>` : ''}</a>`).join('');
  const n = S.unreadNotifs;
  const bell = `<div class="nwrap"><button class="tbtn bell" data-act="notif" aria-label="Notificações${n ? ', ' + n + ' por ler' : ''}" aria-expanded="${S.notifOpen}">${ic('bell')}${n ? `<span class="count">${n > 9 ? '9+' : n}</span>` : ''}</button>
   ${S.notifOpen ? `<div class="npanel"><div class="hd"><b style="color:var(--ink)">Notificações</b>${n ? '<button class="btn link small" data-act="notifAll">Marcar tudo como lido</button>' : ''}</div><div style="max-height:420px;overflow-y:auto">${S.notifs.map((x) => `<button class="it ${x.read_at ? '' : 'un'}" data-act="notifGo" data-id="${x.id}" data-link="${esc(x.link || '')}"><span class="dot ${x.read_at ? 'off' : ''}"></span><span style="flex:1"><span style="color:var(--ink)">${esc(x.text)}</span><br><span class="small muted">${ago(x.created_at)}</span></span></button>`).join('') || '<p class="empty">Sem notificações.</p>'}</div></div>` : ''}</div>`;
  const wal = !isStaff(S.me) ? `<a class="wpill" href="#carteira" title="Saldo da carteira">${ic('wallet')}<span class="num">${kz(S.me.wallet_balance)}</span></a>` : '';
  const u = S.me;
  $('.top').hidden = false; $('#floatTheme').innerHTML = '';
  $('#hdr').innerHTML = `${brand}<nav class="nav" aria-label="Principal">${links}</nav>${wal}${bell}${theme}
   <div class="me"><button data-act="menu" aria-expanded="${S.menu}" aria-haspopup="true">${avatarOf(u, 'xs')}<span class="nm">${esc((u.name || u.handle).split(' ')[0])}</span></button>
   ${S.menu ? `<div class="menu" role="menu"><div class="hd"><b style="color:var(--ink)">${esc(u.name || u.handle)}</b><div class="small muted">@${esc(u.handle)}</div></div>
    ${S.creator ? `<a href="#perfil-${esc(u.handle)}" role="menuitem">${ic('user')}O meu perfil público</a><a href="#subscricoes" role="menuitem">${ic('star')}As minhas subscrições</a>` : ''}
    ${!isStaff(u) ? `<a href="#carteira" role="menuitem">${ic('wallet')}Carteira</a>` : ''}
    <a href="#top" role="menuitem">${ic('trophy')}Top 10</a>
    <a href="#conta" role="menuitem">${ic('settings')}Definições da conta</a>
    ${!S.creator && !isStaff(u) ? `<button data-act="becomeCreator" role="menuitem">${ic('star')}Tornar-me criador</button>` : ''}
    <a href="#faq" role="menuitem">${ic('info')}Ajuda e regras</a>
    <button data-act="logout" role="menuitem">${ic('out')}Sair</button></div>` : ''}</div>`;
  $('#tabbar').innerHTML = links;
}

/* ---------- Rotas ---------- */
// Um link partilhado truncado ("#p-%", ou o WhatsApp a cortar a query) faz decodeURIComponent
// lançar URIError. Sem este try, render() morria antes do seu próprio try e a app ficava
// presa no "A carregar…" sem forma de recuperar sem recarregar a página.
const route = () => {
  let h = (location.hash || '').slice(1);
  try { h = decodeURIComponent(h); } catch { h = ''; }
  return h || 'inicio';
};
const home = () => S.creator ? 'estudio' : isStaff() ? 'admin' : 'feed';
let renderSeq = 0;

async function render(keep = false) {
  const seq = ++renderSeq;
  let r = route();
  S.cleanup.forEach((f) => { try { f(); } catch { /* */ } }); S.cleanup = [];
  S.menu = false; S.notifOpen = false;

  if (S.recovery && r !== 'nova-senha') { history.replaceState(null, '', '#nova-senha'); r = 'nova-senha'; }
  if (!S.me && !PUBLIC.includes(r)) { history.replaceState(null, '', '#inicio'); r = 'inicio'; toast('Entra ou cria conta para continuar.'); }
  if (S.me && !S.me.onboarded && !PUBLIC.includes(r) || (S.me && !S.me.onboarded && ['inicio', 'confirmar'].includes(r))) { history.replaceState(null, '', '#registar'); r = 'registar'; }
  if (S.me && S.me.onboarded && ['inicio', 'confirmar'].includes(r)) { history.replaceState(null, '', '#' + home()); r = home(); }
  if (S.me && S.me.onboarded && r === 'registar' && (!S.reg?.upgrade || (S.creator && S.creator.status !== 'rejected'))) { history.replaceState(null, '', '#' + home()); r = home(); }
  if (r === 'estudio' && !S.creator) { history.replaceState(null, '', '#conta'); r = 'conta'; }
  if (r === 'admin' && !isStaff(S.me)) { history.replaceState(null, '', '#' + home()); r = home(); }

  header(r);
  const app = $('#app');
  if (!keep) app.innerHTML = `<div class="skel">${LOGO(24, 30)}<span>A carregar<i></i><i></i><i></i></span></div>`;
  let h;
  try {
    if (r.startsWith('perfil-')) h = await vPerfil(r.slice(7));
    else if (r.startsWith('p-')) h = await vPost(r.slice(2));
    else if (r.startsWith('live-')) h = await vLive(r.slice(5));
    else if (INFO.includes(r)) h = vInfo(r);
    else {
      const V = {
        inicio: vInicio, confirmar: vConfirmEmail, 'nova-senha': vNovaSenha, top: vTop,
        registar: () => (S.me ? vOnboarding() : vSignup()),
        feed: vFeed, explorar: vExplorar, subscricoes: vSubs, compras: vCompras, carteira: vCarteira, mensagens: vMensagens,
        lives: vLives, estudio: vEstudio, conta: vConta, admin: vAdmin,
      }[r] || (S.me ? vFeed : vInicio);
      h = await V();
    }
  } catch (e) {
    console.error(e);
    h = `<div class="empty"><h2>Não foi possível carregar</h2><p style="margin-top:8px">${esc(errText(e))}</p><button class="btn out" style="margin-top:14px" data-act="reload">Tentar outra vez</button></div>`;
  }
  if (seq !== renderSeq) return; // outra navegação entretanto
  app.innerHTML = h;
  $('#foot').hidden = !!(S.me?.onboarded) && !INFO.includes(r);
  const t10 = $('#footTop10'); if (t10) t10.hidden = r === 'inicio';
  if (!keep) window.scrollTo(0, 0);
  const cs = $('#chatScroll'); if (cs) cs.scrollTop = cs.scrollHeight;
  const c0 = $('#cd0'); if (c0) c0.focus();
  if (r.startsWith('live-')) mountLive();
  // Só mostra "Ver mais" nos textos de publicações que ficam mesmo cortados pelo limite de linhas.
  $$('.postbody.clamp').forEach((el) => { const btn = el.nextElementSibling; if (btn?.matches('.more-btn')) btn.hidden = el.scrollHeight <= el.clientHeight + 1; });
}

/* ---------- Notificações em tempo real ---------- */
let notifCh = null;
async function loadNotifs() {
  const { data } = await sb.from('notifications').select('*').eq('user_id', S.me.id).order('created_at', { ascending: false }).limit(30);
  S.notifs = data || [];
}
function startRealtime() {
  if (!S.me || notifCh) return;
  notifCh = sb.channel('notif-' + S.me.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${S.me.id}` }, async (x) => {
      S.notifs.unshift(x.new); S.unreadNotifs++; toast(x.new.text);
      await refreshMe(); header(route());
    }).subscribe();
  startMessagesRealtime();
}
function stopRealtime() { if (notifCh) { sb.removeChannel(notifCh); notifCh = null; } setRealtimeThread(null); stopMessagesRealtime(); }

/* ---------- Ações ---------- */
const A = {
  ...payActions, ...publicActions, ...fanActions, ...msgActions, ...liveActions, ...studioActions, ...accountActions, ...adminActions,
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
    await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', S.me.id).is('read_at', null);
    S.notifs.forEach((n) => (n.read_at = n.read_at || new Date().toISOString())); S.unreadNotifs = 0; header(route());
  },
  async notifGo(d) {
    // .eq('user_id', ...) para além do id: sem isto, um id adulterado marcava a notificação
    // de outra pessoa como lida, e a segurança ficava só na RLS.
    await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', d.id).eq('user_id', S.me.id).is('read_at', null);
    S.notifOpen = false; await loadCounts();
    const l = d.link || '';
    go(l.startsWith('post/') ? 'p-' + l.slice(5) : l.startsWith('live/') ? 'live-' + l.slice(5) : l || home());
  },
  async logout() { S.menu = false; closeModal(); clearUrlCache(); await sb.auth.signOut(); },
  becomeCreator() { S.menu = false; if (S.creator) { toast('Já tens conta de criador.'); return go('estudio'); } startOnboarding(true); go('registar'); },
};

/* ---------- Eventos ---------- */
document.addEventListener('click', (e) => {
  const scrim = e.target.closest('[data-scrim]');
  if (scrim && e.target === scrim && !scrim.hasAttribute('data-lock')) { closeModal(); return; }
  if (S.menu && !e.target.closest('.me')) { S.menu = false; header(route()); }
  if (S.notifOpen && !e.target.closest('.nwrap')) { S.notifOpen = false; header(route()); }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const f = A[el.dataset.act]; if (!f) return;
  if (el.tagName !== 'A') e.preventDefault();
  Promise.resolve(f({ ...el.dataset })).catch((err) => { console.error(err); toast(errText(err)); });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const s = $('[data-scrim]'); if (s && !s.hasAttribute('data-lock')) closeModal();
    if (S.menu || S.notifOpen) { S.menu = false; S.notifOpen = false; header(route()); }
  }
  if (e.target.classList?.contains('cd') && e.key === 'Backspace' && !e.target.value) { const p = e.target.previousElementSibling; if (p) { p.focus(); p.value = ''; } }
});
document.addEventListener('paste', (e) => {
  if (!e.target.classList?.contains('cd')) return;
  const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (!t) return;
  e.preventDefault(); const all = [...document.querySelectorAll('.cd')]; all.forEach((i, k) => (i.value = t[k] || '')); all[Math.min(t.length, 5)].focus();
});
// Um temporizador por campo. Com um único qT partilhado, escribir nas mensagens cancelava a
// pesquisa de criadores a meio e vice-versa.
let qT = null, tqT = null, uqT = null, exploreSeq = 0;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.classList.contains('cd')) { t.value = t.value.replace(/\D/g, '').slice(-1); if (t.value && t.nextElementSibling) t.nextElementSibling.focus(); return; }
  if (t.id === 'q') {
    S.q = t.value; clearTimeout(qT);
    const seq = ++exploreSeq;
    qT = setTimeout(async () => {
      const html = await exploreGrid();
      if (seq !== exploreSeq) return;        // uma pesquisa mais lenta já não interessa
      const g = $('#cgrid'); if (g) g.innerHTML = html;
    }, 300);
    return;
  }
  if (t.id === 'tq') { S.tq = t.value; clearTimeout(tqT); tqT = setTimeout(() => { renderKeepFocus('#tq'); }, 350); return; }
  if (t.id === 'uq') { S.uq = t.value; clearTimeout(uqT); uqT = setTimeout(() => { renderKeepFocus('#uq'); }, 450); return; }
  studioInput(t);
});
/** Redesenha mantendo o cursor no fim do campo de pesquisa, para não interromper a escrita. */
async function renderKeepFocus(sel) {
  await render(true);
  const n = $(sel);
  if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
}
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (payChange(t)) return;
  if (publicChange(t)) return;
  if (msgChange(t)) return;
  if (await studioChange(t)) return;
  if (await adminChange(t)) return;
  await accountChange(t);
});
document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    if (paySubmit(f)) return;
    for (const h of [publicSubmit, msgSubmit, liveSubmit, studioSubmit, accountSubmit, adminSubmit]) if (await h(f)) return;
  } catch (err) { console.error(err); toast(errText(err)); }
});
document.addEventListener('apf:render', (e) => render(!!e.detail?.keep));
document.addEventListener('apf:header', () => header(route()));
document.addEventListener('apf:paid', () => header(route()));
window.addEventListener('hashchange', () => { S.ptab = 'pub'; render(false); });

/* ---------- Arranque ---------- */
(async function boot() {
  $('#yr').textContent = new Date().getFullYear();
  const u = new URL(location.href), ref = u.searchParams.get('ref');
  if (ref) { try { localStorage.setItem('apf-ref', ref); } catch { /* */ } u.searchParams.delete('ref'); history.replaceState(null, '', u.pathname + (u.search || '') + location.hash); }
  await loadCfg().catch(() => {});
  await loadMe().catch(() => {});
  if (S.me) { startRealtime(); await handlePaypalReturn(); }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') { S.recovery = true; await loadMe(); location.hash = 'nova-senha'; return; }
    if (event === 'SIGNED_OUT') { stopRealtime(); clearUrlCache(); S.me = null; S.creator = null; S.reg = null; S.thread = null; S.recovery = false; location.hash = 'inicio'; render(); return; }
    if (event === 'SIGNED_IN') {
      // Se outra conta entrou noutro separador deste navegador (a sessão é partilhada), esta página
      // ficaria a mostrar o utilizador antigo com dados de outra pessoa (ex.: mensagens da conta errada).
      // Recarregar por completo evita esse estado inconsistente.
      if (S.me && session?.user?.id && session.user.id !== S.me.id) { location.reload(); return; }
      if (!S.me) { await loadMe(); startRealtime(); render(); }
    }
    if (event === 'USER_UPDATED' && S.recovery) { S.recovery = false; }
  });
  render();
})();
