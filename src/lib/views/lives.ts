// Lives: lista, bilhetes, sala com vídeo (LiveKit) e chat em tempo real
import { sb, $, esc, kz, ic, avatarOf, toast, errText, fmtDate, fn, rerender, go, modal, closeModal } from '../lib';
import { register } from '../registry';
import { S, isAdmin } from '../state';
import { openPay } from '../pay';
import type { Actions, SubmitFn } from '../types';

const L_SEL = '*, creator:creators(id,price,status,cover_url,profile:profiles!creators_id_fkey(handle,name,avatar_url))';
const cname = (c: any): string => c?.profile?.name || c?.profile?.handle || '';

/** Quais lives deste utilizador pode ver: bilhete pago, e onde deixou lembrete. */
async function myAccess(ids: string[]): Promise<{ tickets: Set<string>; rem: Set<string> }> {
  if (!ids.length) return { tickets: new Set(), rem: new Set() };
  const uid = S.me!.id;
  const [{ data: t }, { data: r }] = await Promise.all([
    // `purchases` não tem coluna `status`: cada linha já é uma compra concluída (o estado
    // do pagamento vive em `orders`). Um .eq('status') aqui dava HTTP 400 e a consulta inteira falhava.
    // Sem limite o .in() podia rebentar com muitas lives.
    sb.from('purchases').select('ref_id').eq('user_id', uid).eq('kind', 'ticket').in('ref_id', ids.slice(0, 200)),
    sb.from('live_reminders').select('live_id').eq('user_id', uid).in('live_id', ids.slice(0, 200)),
  ]);
  return {
    tickets: new Set((t || []).map((x: { ref_id: string }) => x.ref_id)),
    rem: new Set((r || []).map((x: { live_id: string }) => x.live_id)),
  };
}

function liveCard(l: any, A: { tickets: Set<string>; rem: Set<string> }): string {
  const c = l.creator, host = l.creator_id === S.me!.id, has = host || l.price === 0 || A.tickets.has(l.id) || isAdmin();
  const img = c.cover_url || c.profile.avatar_url;
  return `<article class="lcardv"><a class="ph" href="#live-${l.id}" aria-label="${esc(l.title)}">${img ? `<img loading="lazy" decoding="async" src="${esc(img)}" alt="">` : `<span class="letter">${esc(cname(c)[0] || '?')}</span>`}${l.status === 'live' ? '<span class="onair">AO VIVO</span>' : `<span class="when">${fmtDate(l.starts_at, true)}</span>`}</a>
   <div class="row" style="align-items:flex-start">${avatarOf(c.profile, 'sm')}<div style="flex:1;min-width:0"><b style="color:var(--ink)">${esc(l.title)}</b><div class="small muted">${esc(cname(c))} · ${l.price ? 'Bilhete ' + kz(l.price) : 'Entrada livre'}</div></div></div>
   <div class="row wrapf">${l.status === 'live'
     ? (has ? `<a class="btn pri sm" href="#live-${l.id}">Entrar</a>` : `<button class="btn pri sm" data-act="buyTicket" data-id="${l.id}" data-price="${l.price}">Comprar bilhete · ${kz(l.price)}</button>`)
     : (l.price && !has ? `<button class="btn pri sm" data-act="buyTicket" data-id="${l.id}" data-price="${l.price}">Comprar bilhete · ${kz(l.price)}</button>` : `<span class="tag ok">${ic('check')}${host ? 'A tua live' : l.price ? 'Tens bilhete' : 'Entrada livre'}</span>`)}
    ${l.status !== 'live' && !host ? `<button class="btn out sm" data-act="remind" data-id="${l.id}" data-on="${A.rem.has(l.id) ? 1 : 0}">${A.rem.has(l.id) ? 'Lembrete ativo' : 'Lembrar-me'}</button>` : ''}</div></article>`;
}

export async function vLives(): Promise<string> {
  // O filtro de "criador aprovado" acontece DEPOIS do limite na versão anterior, o que fazia
  // aparecer menos de 60 lives. O status do criador entra no próprio filtro do servidor.
  const { data: all } = await sb.from('lives').select(L_SEL).in('status', ['live', 'scheduled']).order('starts_at', { ascending: true }).limit(120);
  const list = ((all || []) as any[]).filter((l) => l.creator?.status === 'approved' || l.creator_id === S.me!.id);
  const A = await myAccess(list.map((l) => l.id));
  const on = list.filter((l) => l.status === 'live'), next = list.filter((l) => l.status === 'scheduled');
  return `<div class="pagehead"><div><h1>Lives</h1><p>Emissões ao vivo dos criadores. Algumas são gratuitas, outras pedem bilhete.</p></div>${S.creator?.status === 'approved' ? `<button class="btn pri" data-act="stGo" data-v="lives">${ic('live')}Iniciar live</button>` : ''}</div>
   <h3 style="margin-bottom:14px">Ao vivo agora</h3>${on.length ? `<div class="lgrid">${on.map((l) => liveCard(l, A)).join('')}</div>` : '<p class="muted">Ninguém está ao vivo neste momento.</p>'}
   ${next.length ? `<h3 style="margin:36px 0 14px">Próximas lives</h3><div class="lgrid">${next.map((l) => liveCard(l, A)).join('')}</div>` : ''}`;
}

/* ---------- Sala ---------- */

/* A biblioteca de vídeo e as animações dos presentes só são carregadas quando alguém
 * entra numa sala, e vêm do pacote npm (não de um CDN). Ver `config.ts`.
 *
 * Minimizar: sair da sala para outra página NÃO desliga a live. O vídeo passa para uma
 * janela pequena no canto (`#lvMini`), e quem está em directo continua a transmitir.
 * Para quem transmite, a única forma de sair é «Encerrar»: assim uma live nunca fica
 * «ao vivo» sem ninguém do outro lado. Quem vê fecha a janela pequena quando quiser. */
type LKRoom = import('livekit-client').Room;
type Gift = { key: string; name: string; icon: string; price: number };
type Efeitos = import('../presentes/efeitos').Efeitos;
type Camara = import('../lives/camara').Camara;

let room: LKRoom | null = null;
/** A live ligada neste momento (aberta ou minimizada). */
let ligada: { id: string; host: boolean } | null = null;
let videoEl: HTMLVideoElement | null = null;
/** Câmara e microfone desligados por quem faz a live (para quem vê: o que o criador desligou). */
let camOff = false, micOff = false;
/** Câmara com filtros de quem transmite e a publicação dela no LiveKit. */
let camara: Camara | null = null, camPub: import('livekit-client').LocalTrackPublication | null = null;
let chatCh: ReturnType<typeof sb.channel> | null = null, liveCh: ReturnType<typeof sb.channel> | null = null;
let fx: Efeitos | null = null;
let gifts: Gift[] = [];
let escolhido = '';
let comboT = 0, coracaoT = 0;

/** Geração da montagem atual. Qualquer operação assíncrona verifica este valor antes de
 *  tocar em nada: sem ele, sair da página a meio do fetch do chat fazia a continuação de
 *  mountLive() criar os canais e ligar a câmara DEPOIS de se ter saído — o criador
 *  ficava a transmitir sem saber, e os canais ficavam vazados. */
let mountGen = 0;

const avisoSair = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
const nomeDe = (p: any): string => p?.name || p?.handle || 'Fã';

/** Desliga tudo: vídeo, canais, animações e a janela pequena. */
function leave(): void {
  mountGen++;
  try { room?.disconnect(); } catch { /* já desligada */ }
  room = null; ligada = null; videoEl = null; camOff = false; micOff = false;
  camara?.parar(); camara = null; camPub = null;
  if (chatCh) { void sb.removeChannel(chatCh); chatCh = null; }
  if (liveCh) { void sb.removeChannel(liveCh); liveCh = null; }
  fx?.parar(); fx = null;
  $('#lvMini')?.remove();
  window.removeEventListener('beforeunload', avisoSair);
}

/** Ao mudar de página: se a live está ligada, minimiza; senão, desliga. */
function sairDaSala(): void {
  mountGen++;
  clearTimeout(comboT);
  fx?.parar(); fx = null;
  if (chatCh) { void sb.removeChannel(chatCh); chatCh = null; }
  if (room && ligada) minimizar(); else leave();
}

function minimizar(): void {
  if (!ligada) return;
  $('#lvMini')?.remove();
  const box = document.createElement('div');
  box.id = 'lvMini'; box.className = 'lvmini' + (camOff ? ' camoff' : '');
  box.innerHTML = `<button class="v" data-act="lvOpen" aria-label="Voltar à live"></button><span class="onair">AO VIVO</span>
    <div class="b">${ligada.host
      ? `<button class="btn pri sm" data-act="liveEnd" data-id="${ligada.id}">Encerrar</button>`
      : `<button class="lvx" data-act="lvClose" aria-label="Fechar a live">${ic('x')}</button>`}</div>`;
  if (videoEl) box.querySelector('.v')!.appendChild(videoEl);
  document.body.appendChild(box);
}

const MIC = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const MIC_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 9.3V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18"/></svg>';
const FLIP = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/></svg>';
const CAM = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 10.5l6-3.5v10l-6-3.5"/></svg>';
const CAM_OFF = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 10.5l6-3.5v10l-4-2.3M9 6h4a2.5 2.5 0 0 1 2.5 2.5V12M15.5 16A2.5 2.5 0 0 1 13 18H5a2.5 2.5 0 0 1-2.5-2.5v-7A2.5 2.5 0 0 1 4.6 6M3 3l18 18"/></svg>';

/** Botões de quem faz a live: ligar/desligar o microfone e a câmara. */
function botoesHost(): string {
  return `<button class="lvround${micOff ? ' off' : ''}" id="lvMicBtn" data-act="lvMic" aria-pressed="${micOff}" aria-label="${micOff ? 'Ligar o microfone' : 'Desligar o microfone'}" title="${micOff ? 'Ligar o microfone' : 'Desligar o microfone'}">${micOff ? MIC_OFF.replace(/16/g, '20') : MIC}</button>`
    + `<button class="lvround${camOff ? ' off' : ''}" id="lvCamBtn" data-act="lvCam" aria-pressed="${camOff}" aria-label="${camOff ? 'Ligar a câmara' : 'Desligar a câmara'}" title="${camOff ? 'Ligar a câmara' : 'Desligar a câmara'}">${camOff ? CAM_OFF : CAM}</button>`
    + `<button class="lvround" data-act="lvFlip" aria-label="Virar a câmara" title="Virar a câmara">${FLIP}</button>`
    + `<button class="lvround" data-act="lvFx" aria-label="Filtros" title="Filtros">✨</button>`;
}

/** Pré-visualização de quem transmite: em espelho com a câmara da frente (como no TikTok). */
function espelho(): void {
  if (videoEl) videoEl.style.transform = camara?.frente ? 'scaleX(-1)' : '';
}

/** Separador aberto na tira de quem transmite, e o ajuste de beleza escolhido para a barra. */
let fxTab: 'filtros' | 'beleza' | 'efeitos' = 'filtros', fxBel: import('../lives/camara').Beleza = 'suave';

/** Tira horizontal (como no TikTok): itens em fila com deslize lateral; tocar num item mostra a
 *  barra de intensidade por cima. */
function desenhaFiltros(): void {
  const row = $('#lvFxRow'); if (!row || !camara) return;
  void import('../lives/camara').then(({ FILTROS, BELEZA, EFEITOS, intFiltro, intEfeito }) => {
    if (!camara) return;
    const a = camara.a;
    for (const b of document.querySelectorAll<HTMLElement>('#lvFxSheet .lvtab')) b.classList.toggle('on', b.dataset.k === fxTab);
    const item = (k: string, n: string, circ: string, on: boolean, extra = '', estilo = '') =>
      `<button class="lvfi${on ? ' on' : ''}" data-act="lvFxPick" data-k="${k}" aria-pressed="${on}"><span class="c"${estilo}>${circ}${extra}</span><span class="n">${n}</span></button>`;
    let html = '', nome = '', valor = -1;
    if (fxTab === 'filtros') {
      html = FILTROS.map(([k, n, cores]) => item(k, n, '', k === a.filtro, '', ` style="background:linear-gradient(135deg,${cores})"`)).join('');
      if (a.filtro !== 'natural') { nome = FILTROS.find(([k]) => k === a.filtro)![1]; valor = intFiltro(a); }
    } else if (fxTab === 'beleza') {
      html = BELEZA.map(([k, n, e]) => item(k, n, e, k === fxBel, a.beleza[k] > 0 ? `<i class="v">${Math.round(a.beleza[k] * 100)}</i>` : '')).join('')
        + `<button class="lvfi" data-act="lvFxRepor"><span class="c">↺</span><span class="n">Repor</span></button>`;
      nome = BELEZA.find(([k]) => k === fxBel)![1]; valor = a.beleza[fxBel];
    } else {
      html = EFEITOS.map(([k, n, e]) => item(k, n, e, k === a.efeito)).join('');
      if (a.efeito !== 'nenhum') { nome = EFEITOS.find(([k]) => k === a.efeito)![1]; valor = intEfeito(a); }
    }
    const x = row.scrollLeft; row.innerHTML = html; row.scrollLeft = x;
    const sl = $('#lvFxSl'), r = $<HTMLInputElement>('#lvFxSlR');
    if (!sl || !r) return;
    sl.hidden = valor < 0;
    if (valor >= 0) { $('#lvFxSlN')!.textContent = nome; r.value = String(Math.round(valor * 100)); $('#lvFxSlV')!.textContent = r.value; }
    if (!r.dataset.ok) {
      r.dataset.ok = '1';
      r.addEventListener('input', () => {
        if (!camara) return;
        const v = Number(r.value) / 100, a2 = camara.a;
        $('#lvFxSlV')!.textContent = r.value;
        if (fxTab === 'filtros') camara.definir({ fInt: { ...a2.fInt, [a2.filtro]: v } });
        else if (fxTab === 'efeitos') camara.definir({ eInt: { ...a2.eInt, [a2.efeito]: v } });
        else {
          camara.definir({ beleza: { ...a2.beleza, [fxBel]: v } });
          const b = document.querySelector<HTMLElement>(`#lvFxRow .lvfi[data-k="${fxBel}"] .c`);
          if (b) { let i = b.querySelector('.v'); if (v > 0) { if (!i) { i = document.createElement('i'); i.className = 'v'; b.appendChild(i); } i.textContent = r.value; } else i?.remove(); }
        }
      });
    }
  });
}

/** Mostra (ou tira) os avisos de câmara/microfone desligados e atualiza os botões. */
function marcaEstado(): void {
  const st = $('#liveStage');
  st?.classList.toggle('camoff', camOff); st?.classList.toggle('micoff', micOff);
  $('#lvMini')?.classList.toggle('camoff', camOff);
  const mic = $('#lvMicBtn'), cam = $('#lvCamBtn');
  if (mic && cam) { const t = document.createElement('div'); t.innerHTML = botoesHost(); mic.replaceWith(t.children[0]); cam.replaceWith(t.children[0]); }
}

export async function vLive(id: string): Promise<string> {
  const { data: raw } = await sb.from('lives').select(L_SEL).eq('id', id).maybeSingle();
  const l = raw as any;
  if (!l) return '<div class="empty"><h2>Live não encontrada</h2><a class="btn out" style="margin-top:14px" href="#lives">Ver lives</a></div>';
  const host = l.creator_id === S.me!.id, A = await myAccess([l.id]);
  const has = host || l.price === 0 || A.tickets.has(l.id) || isAdmin(), c = l.creator;
  let gate = '';
  if (l.status === 'ended') gate = `<div class="gate"><b style="font-size:18px">Esta live terminou</b><a class="btn pri" href="#lives">Ver outras lives</a></div>`;
  else if (!has) gate = `<div class="gate">${ic('lock', 'style="width:28px;height:28px"')}<b style="font-size:17px">Live com bilhete</b><button class="btn pri" data-act="buyTicket" data-id="${l.id}" data-price="${l.price}">Comprar bilhete · ${kz(l.price)}</button></div>`;
  else if (l.status === 'scheduled' && !host) gate = `<div class="gate"><b style="font-size:18px">Começa ${fmtDate(l.starts_at, true)}</b><span>${l.price ? 'Já tens bilhete.' : 'Entrada livre.'} Recebes uma notificação quando começar.</span></div>`;
  else if (l.status === 'scheduled' && host) gate = `<div class="gate"><b style="font-size:18px">Pronta para começar?</b><span class="small">O navegador vai pedir acesso à câmara e ao microfone.</span><button class="btn pri" data-act="liveStart" data-id="${l.id}">Começar agora</button></div>`;
  const img = c.cover_url || c.profile.avatar_url;
  const join = has && l.status === 'live';
  S.liveCtx = { id: l.id, host, join, creator: c.id };
  const saldo = Number(S.me!.wallet_balance || 0);
  const min = `<button class="lvbtn" data-act="lvMin" aria-label="Minimizar" title="Minimizar"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></button>`;
  const fechar = `<button class="lvbtn" data-act="lvClose" aria-label="Sair da live" title="Sair">${ic('x')}</button>`;
  return `<div class="lvroom">
   <div class="lvstage${ligada?.id === l.id && camOff ? ' camoff' : ''}${ligada?.id === l.id && micOff ? ' micoff' : ''}" id="liveStage">${gate && img ? `<img class="lvbg" src="${esc(img)}" alt="">` : ''}
    ${gate || `<div id="lkVideo" class="lvvideo"></div><div class="lvcamoff">${avatarOf(c.profile)}<span>${host ? 'A tua câmara está desligada' : 'Câmara desligada'}</span></div><span class="lvmicoff">${MIC_OFF}${host ? 'Microfone desligado' : 'Sem som'}</span><span class="wm c">@${esc(S.me!.handle)}</span><p class="lvstatus" id="lkStatus">A ligar…</p>`}
    <div class="lvtop"><span class="lvwho">${avatarOf(c.profile, 'sm')}<span><b>${esc(cname(c))}</b><small>${esc(l.title)}</small></span></span>
     ${l.status === 'live' ? `<span class="onair">AO VIVO</span><span class="viewers" id="lvViewers"></span>` : ''}<span class="lvsp"></span>
     ${join ? min : ''}${host && l.status === 'live' ? `<button class="btn pri sm" data-act="liveEnd" data-id="${l.id}">Encerrar</button>` : host ? `<a class="lvbtn" href="#estudio" aria-label="Voltar">${ic('x')}</a>` : fechar}</div>
    ${join ? `<div class="lvchat" id="lchatList" aria-live="polite"></div>
    <div class="lvbar"><form class="lvform" id="liveForm" data-id="${l.id}"><input type="text" id="liveInput" maxlength="300" placeholder="Diz alguma coisa…" aria-label="Mensagem" autocomplete="off"><button aria-label="Enviar">${ic('send')}</button></form>
     ${host ? botoesHost() : `<button class="lvround gift" data-act="lvGifts" aria-label="Presentes">🎁</button><button class="lvround" data-act="lvHeart" aria-label="Enviar coração">❤️</button>`}</div>
    <button class="lvcombo" id="lvCombo" data-act="lvCombo" hidden></button>
    ${host ? `<div class="lvfx" id="lvFxSheet" hidden role="dialog" aria-label="Filtros e efeitos">
     <div class="lvfx-sl" id="lvFxSl" hidden><span id="lvFxSlN"></span><input type="range" id="lvFxSlR" min="0" max="100" step="1" aria-label="Intensidade"><b id="lvFxSlV"></b></div>
     <div class="lvfx-hd"><span class="lvtabs"><button class="lvtab on" data-act="lvFxTab" data-k="filtros">Filtros</button><button class="lvtab" data-act="lvFxTab" data-k="beleza">Beleza</button><button class="lvtab" data-act="lvFxTab" data-k="efeitos">Efeitos</button></span><button class="lvx" data-act="lvFx" aria-label="Fechar">${ic('x')}</button></div>
     <div class="lvfx-row" id="lvFxRow"></div></div>` : `<div class="lvsheet" id="lvSheet" hidden role="dialog" aria-label="Presentes">
     <div class="hd"><b>Presentes</b><button class="lvx" data-act="lvGifts" aria-label="Fechar">${ic('x')}</button></div>
     <div class="grid" id="lvGiftGrid"></div>
     <div class="ft"><span class="small">Saldo <b id="lvSaldo">${kz(saldo)}</b></span><button class="btn soft sm" data-act="lvTopup">Carregar carteira</button><button class="btn pri sm" id="lvSend" data-act="lvSend" disabled>Enviar</button></div>
     <p class="cred">Os presentes são pagos com a carteira. Só tu vês o valor. Modelos 3D: «Lion» de doizy e «Bottle of Champagne» de Sirolalo (Sketchfab, CC BY).</p></div>`}`
    : `<div class="lvcap"><b>${esc(l.title)}</b><span class="small">${esc(cname(c))} · ${l.price ? 'bilhete ' + kz(l.price) : 'entrada livre'}</span></div>`}
   </div></div>`;
}

function chatLine(m: any): string {
  const n = esc(nomeDe(m.profile));
  const g = m.gift ? gifts.find((x) => x.key === m.gift) : null;
  // O valor nunca aparece a quem está a ver: só o presente e quem o enviou.
  if (g) return `<div class="lvmsg gift"><b>${n}</b> enviou ${esc(g.name)} ${g.icon}</div>`;
  if (m.gift || m.tip_amount) return `<div class="lvmsg gift"><b>${n}</b> enviou um presente 🎁${m.body ? ': ' + esc(m.body) : ''}</div>`;
  return `<div class="lvmsg"><b>${n}</b> ${esc(m.body)}</div>`;
}

function addChat(html: string): void {
  const el = $('#lchatList'); if (!el) return;
  el.insertAdjacentHTML('beforeend', html);
  while (el.childElementCount > 60) el.firstElementChild!.remove();
  el.scrollTop = el.scrollHeight;
}

function desenhaGaveta(): void {
  const g = $('#lvGiftGrid'); if (!g) return;
  g.innerHTML = gifts.map((x) => `<button class="lvg${x.key === escolhido ? ' on' : ''}" data-act="lvPick" data-k="${esc(x.key)}"><span class="i">${x.icon}</span><span class="n">${esc(x.name)}</span><small>${kz(x.price)}</small></button>`).join('');
  const s = $<HTMLButtonElement>('#lvSend'); if (s) s.disabled = !escolhido;
  const b = $('#lvSaldo'); if (b) b.textContent = kz(S.me?.wallet_balance || 0);
}

/** Chamado depois de desenhar a sala: liga o chat, o vídeo e as animações. */
export async function mountLive(): Promise<void> {
  const ctx = S.liveCtx; if (!ctx) return;
  // Outra live ainda ligada (minimizada)?
  if (ligada && ligada.id !== ctx.id) {
    if (ligada.host) { toast('Estás em directo. Encerra a tua live antes de entrares noutra.'); go('live-' + ligada.id); return; }
    leave();
  }
  S.cleanup.push(sairDaSala);
  const gen = ++mountGen;
  const alive = (): boolean => gen === mountGen;
  if (!ctx.join) { if (ligada?.id === ctx.id) leave(); return; }
  $('#lvMini')?.remove();

  if (!gifts.length) {
    const { data } = await sb.from('live_gifts').select('key,name,icon,price').eq('active', true).order('sort');
    gifts = (data || []) as Gift[];
  }
  if (!alive()) return;
  escolhido = ''; desenhaGaveta();

  // Animações dos presentes (three.js), carregadas só aqui.
  void import('../presentes/efeitos').then((m) => {
    const stage = $('#liveStage');
    if (!alive() || !stage) return;
    fx = m.iniciar(stage, () => videoEl);
  }).catch((e) => console.warn('efeitos', e));

  const { data: msgs } = await sb.from('live_chat').select('*, profile:profiles(handle,name)').eq('live_id', ctx.id).order('created_at', { ascending: false }).limit(40);
  if (!alive()) return;                                  // o utilizador já saiu enquanto esperávamos
  const list = $('#lchatList');
  if (list) { list.innerHTML = (msgs || []).reverse().map((m) => chatLine(m)).join(''); list.scrollTop = list.scrollHeight; }
  chatCh = sb.channel('live-chat-' + ctx.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_chat', filter: `live_id=eq.${ctx.id}` }, async (x) => {
      if (!alive()) return;
      const m = x.new as any;
      const { data: p } = await sb.from('profiles').select('handle,name,avatar_url').eq('id', m.user_id).maybeSingle();
      if (!alive()) return;
      addChat(chatLine({ ...m, profile: p }));
      const g = m.gift ? gifts.find((y) => y.key === m.gift) : null;
      if (g) fx?.mostrar(g, nomeDe(p), (p as any)?.avatar_url);
    })
    .on('broadcast', { event: 'heart' }, () => { if (alive()) fx?.coracao(); })
    .subscribe();
  if (!liveCh) {
    const id = ctx.id;
    liveCh = sb.channel('live-row-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lives', filter: `id=eq.${id}` }, (x) => {
        if ((x.new as any).status !== 'ended' || !ligada || ligada.id !== id || ligada.host) return;
        const naSala = !!$('#liveStage');
        leave(); toast('A live terminou');
        if (naSala) rerender();
      }).subscribe();
  }
  if (room && ligada?.id === ctx.id) {                   // a voltar de minimizado
    const box = $('#lkVideo');
    if (box && videoEl) { box.innerHTML = ''; box.appendChild(videoEl); $('#lkStatus')!.textContent = ''; }
    const v = $('#lvViewers'); if (v) v.textContent = `${room.remoteParticipants.size + (ctx.host ? 0 : 1)} a ver`;
    return;
  }
  await connect(ctx, alive);
}

async function connect(ctx: { id: string; host: boolean }, alive: () => boolean): Promise<void> {
  const status = (t: string) => { const e = $('#lkStatus'); if (e) e.textContent = t; };
  try {
    const [{ url, token }, LK] = await Promise.all([
      fn<{ url: string; token: string }>('live-token', { live_id: ctx.id }),
      import('livekit-client'),
    ]);
    if (!alive()) return;                                  // saiu enquanto carregava o token
    const r = new LK.Room({ adaptiveStream: true, dynacast: true });
    const attach = (track: import('livekit-client').RemoteTrackPublication | any) => {
      if (!ligada && !alive()) return;
      const el = track.attach();
      if (track.kind === 'video') {
        el.style.cssText = 'width:100%;height:100%;object-fit:cover;background:#000;display:block';
        el.muted = true; el.playsInline = true; videoEl = el;
        const box = $('#lkVideo') || $('#lvMini .v');
        if (box) { box.innerHTML = ''; box.appendChild(el); }
        status('');
      } else document.body.appendChild(el);
    };
    const count = () => { const v = $('#lvViewers'); if (v) v.textContent = `${r.remoteParticipants.size + (ctx.host ? 0 : 1)} a ver`; };
    // Quem vê: o criador pode desligar a câmara ou o microfone a meio.
    const estadoRemoto = (pub: { kind: string; isMuted: boolean }, ausente = false) => {
      if (ctx.host) return;
      if (pub.kind === 'video') camOff = ausente || pub.isMuted; else if (pub.kind === 'audio') micOff = ausente || pub.isMuted;
      marcaEstado();
    };
    r.on(LK.RoomEvent.TrackSubscribed, (track, pub) => { attach(track); estadoRemoto(pub); })
      .on(LK.RoomEvent.TrackUnsubscribed, (track, pub) => { track.detach().forEach((e) => { if (e === videoEl) videoEl = null; e.remove(); }); estadoRemoto(pub, true); })
      .on(LK.RoomEvent.TrackMuted, (pub, p) => { if (!p.isLocal) estadoRemoto(pub); })
      .on(LK.RoomEvent.TrackUnmuted, (pub, p) => { if (!p.isLocal) estadoRemoto(pub); })
      .on(LK.RoomEvent.ParticipantConnected, count).on(LK.RoomEvent.ParticipantDisconnected, count)
      .on(LK.RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!r.canPlaybackAudio || $('#unmute')) return;
        $('#liveStage')?.insertAdjacentHTML('beforeend', `<button class="btn pri unmute" id="unmute" data-act="liveAudio">${ic('volume')}Ativar som</button>`);
      })
      .on(LK.RoomEvent.Disconnected, () => status('Ligação terminada.'));
    await r.connect(url, token);
    if (!alive()) { try { r.disconnect(); } catch { /* já desligada */ } return; }
    room = r; ligada = { id: ctx.id, host: ctx.host };     // só publica a sala depois de ligada
    count();
    if (ctx.host) {
      window.addEventListener('beforeunload', avisoSair);  // fechar o separador pede confirmação
      camOff = false; micOff = false;
      // Câmara com filtros (beleza, brilho…) e possibilidade de virar; o microfone vai à parte.
      const { criarCamara } = await import('../lives/camara');
      const cam = await criarCamara();
      if (room !== r) { cam.parar(); return; }             // encerrou durante o pedido de permissão
      camara = cam;
      const lt = new LK.LocalVideoTrack(cam.track, undefined, true);
      camPub = await r.localParticipant.publishTrack(lt, { source: LK.Track.Source.Camera, simulcast: true });
      await r.localParticipant.setMicrophoneEnabled(true);
      if (room !== r) return;
      attach(lt); espelho();
    } else {
      status('À espera do vídeo do criador…');
      r.remoteParticipants.forEach((p) => p.trackPublications.forEach((t) => t.track && attach(t.track)));
    }
  } catch (e) {
    if (!alive()) return;
    status(/Permission|NotAllowed/i.test(String(e)) ? 'Precisamos de acesso à câmara e ao microfone. Autoriza no navegador e recarrega a página.'
      : /Edge Function|Failed to fetch|LIVEKIT/i.test(String(e)) ? 'O servidor das lives não respondeu. Tenta outra vez dentro de alguns minutos.'
      : errText(e));
  }
}

/* ---------- Presentes ---------- */

function semSaldo(g: Gift): void {
  modal(`<h3>Carrega a carteira</h3><p class="muted" style="margin:8px 0 16px">Os presentes são pagos com o saldo da carteira. Para enviar ${g.icon} ${esc(g.name)} precisas de ${kz(g.price)}; tens ${kz(S.me?.wallet_balance || 0)}.</p>
    <button class="btn pri block" data-act="lvTopup">Carregar carteira</button>`);
}

function mostraCombo(g: Gift): void {
  const b = $<HTMLButtonElement>('#lvCombo'); if (!b) return;
  b.innerHTML = `<span class="i">${g.icon}</span><b>COMBO</b><i class="ring"></i>`;
  b.dataset.k = g.key; b.hidden = false;
  b.classList.remove('run'); void b.offsetWidth; b.classList.add('run');
  clearTimeout(comboT); comboT = window.setTimeout(() => { b.hidden = true; }, 3000);
}

let aEnviar = false;
async function enviarPresente(k: string): Promise<void> {
  const ctx = S.liveCtx, g = gifts.find((x) => x.key === k);
  if (!ctx || !g || !S.me || aEnviar) return;
  if (ctx.host) return toast('Não podes enviar presentes a ti próprio.');
  const bal = Number(S.me.wallet_balance || 0);
  if (bal < g.price) { semSaldo(g); return; }
  aEnviar = true;
  const { error } = await sb.rpc('pay_with_wallet', { p_kind: 'tip', p_target: ctx.creator, p_amount: null, p_meta: { gift: g.key, live_id: ctx.id } });
  aEnviar = false;
  if (error) { if (/Saldo insuficiente/i.test(error.message)) semSaldo(g); else toast(errText(error)); return; }
  S.me.wallet_balance = bal - g.price;
  document.dispatchEvent(new Event('apf:header'));
  const sh = $('#lvSheet'); if (sh) sh.hidden = true;
  desenhaGaveta(); mostraCombo(g);
}

export const liveActions: Actions = {
  /** Relê o preço no servidor: o data-price do botão é controlado por quem compra. */
  async buyTicket(d) {
    const { data: raw } = await sb.from('lives').select('id,price,status,creator_id').eq('id', d.id).maybeSingle();
    const l = raw as any;
    if (!l || l.status === 'ended') return toast('Esta live já não está disponível.');
    if (!l.price) return toast('Esta live tem entrada livre.');
    openPay({ kind: 'ticket', target_id: l.id, amount: Number(l.price), title: 'Bilhete para a live', sub: 'Dá acesso à emissão e ao chat.', okText: 'Bilhete comprado. Recebes uma notificação quando a live começar.', onPaid: () => rerender() });
  },
  async remind(d) {
    const on = d.on === '1';
    const { error } = on
      ? await sb.from('live_reminders').delete().eq('live_id', d.id).eq('user_id', S.me!.id)
      : await sb.from('live_reminders').upsert({ live_id: d.id, user_id: S.me!.id }, { onConflict: 'live_id,user_id', ignoreDuplicates: true });
    toast(error ? errText(error) : on ? 'Lembrete removido' : 'Avisamos-te quando começar'); rerender();
  },
  async liveStart(d) {
    if (!S.me) return toast('A sessão expirou. Entra outra vez.');
    if (!d.id) return;
    // .eq('creator_id', S.me.id): sem isto, o UPDATE só dependia da RLS para não deixar
    // começar uma live que não é sua.
    const { error } = await sb.from('lives').update({ status: 'live' }).eq('id', d.id).eq('creator_id', S.me.id);
    if (error) return toast(errText(error));
    toast('Estás ao vivo'); go('live-' + d.id);
  },
  async liveEnd(d) {
    if (!S.me) return toast('A sessão expirou. Entra outra vez.');
    if (!d.id) return;
    if (!confirm('Encerrar a live? Quem está a ver deixa de te ver.')) return;
    const { error } = await sb.from('lives').update({ status: 'ended' }).eq('id', d.id).eq('creator_id', S.me.id);
    if (error) return toast(errText(error));
    leave(); toast('Live encerrada'); S.stTab = 'lives'; go('estudio');
  },
  liveAudio() { room?.startAudio(); $('#unmute')?.remove(); },
  /** Quem faz a live liga/desliga o microfone (os fãs veem «Sem som»). */
  async lvMic() {
    if (!room || !ligada?.host) return;
    const off = !micOff;
    try { await room.localParticipant.setMicrophoneEnabled(!off); micOff = off; marcaEstado(); toast(off ? 'Microfone desligado' : 'Microfone ligado'); }
    catch (e) { toast(errText(e)); }
  },
  /** Quem faz a live liga/desliga a câmara (os fãs veem «Câmara desligada»). */
  async lvCam() {
    if (!room || !ligada?.host) return;
    const off = !camOff;
    try {
      if (camara && camPub) { await camara.ligar(!off); if (off) await camPub.mute(); else await camPub.unmute(); }
      else await room.localParticipant.setCameraEnabled(!off);
      camOff = off;
      marcaEstado(); toast(off ? 'Câmara desligada' : 'Câmara ligada');
    } catch (e) { toast(errText(e)); }
  },
  /** Vira a câmara (frente/trás). */
  async lvFlip() {
    if (!camara || camOff) return;
    try { await camara.virar(); espelho(); } catch (e) { toast(errText(e)); }
  },
  /** Abre/fecha a gaveta dos filtros. */
  /** Abre/fecha a tira de filtros, beleza e efeitos. */
  lvFx() {
    const s = $('#lvFxSheet'); if (!s) return;
    s.hidden = !s.hidden; $('#liveStage')?.classList.toggle('fxon', !s.hidden);
    if (!s.hidden) desenhaFiltros();
  },
  lvFxTab(d) { fxTab = (d.k as typeof fxTab) || 'filtros'; const r = $('#lvFxRow'); if (r) r.scrollLeft = 0; desenhaFiltros(); },
  lvFxPick(d) {
    if (!camara || !d.k) return;
    if (fxTab === 'filtros') camara.definir({ filtro: d.k as import('../lives/camara').Filtro });
    else if (fxTab === 'efeitos') camara.definir({ efeito: d.k as import('../lives/camara').Efeito });
    else fxBel = d.k as import('../lives/camara').Beleza;
    desenhaFiltros();
  },
  lvFxRepor() { if (!camara) return; void import('../lives/camara').then(({ BELEZA_PADRAO }) => { camara?.definir({ beleza: { ...BELEZA_PADRAO } }); desenhaFiltros(); }); },
  /** Minimizar: a live continua numa janela pequena enquanto se navega no site. */
  lvMin() { go('inicio'); },
  lvOpen() { if (ligada) go('live-' + ligada.id); },
  /** Só quem vê pode fechar sem encerrar. */
  lvClose() { if (ligada?.host) return; const naSala = !!$('#liveStage'); leave(); if (naSala) go('lives'); },
  lvGifts() { const s = $('#lvSheet'); if (!s) return; s.hidden = !s.hidden; if (!s.hidden) desenhaGaveta(); },
  lvPick(d) { escolhido = d.k || ''; desenhaGaveta(); },
  lvSend() { if (escolhido) void enviarPresente(escolhido); },
  lvCombo() { const k = $('#lvCombo')?.dataset.k; if (k) void enviarPresente(k); },
  lvTopup() { closeModal(); go('carteira'); },
  lvHeart() {
    fx?.coracao();
    const now = Date.now(); if (now - coracaoT < 250) return; coracaoT = now;
    void chatCh?.send({ type: 'broadcast', event: 'heart', payload: {} });
  },
};

export const liveSubmit: SubmitFn = async (f) => {
  if (f.id !== 'liveForm') return false;
  const i = $<HTMLInputElement>('#liveInput'), v = i?.value.trim() ?? '';
  if (!v) return true;
  i!.value = '';
  const { error } = await sb.from('live_chat').insert({ live_id: f.dataset.id, user_id: S.me!.id, body: v });
  if (error) { toast(errText(error)); i!.value = v; }
  return true;
};

register({ actions: liveActions, submit: liveSubmit });
