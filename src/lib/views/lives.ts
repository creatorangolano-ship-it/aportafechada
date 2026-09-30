// Lives: lista, bilhetes, sala com vídeo (LiveKit) e chat em tempo real
import { sb, $, esc, kz, ic, avatarOf, toast, errText, fmtDate, fn, rerender, go } from '../lib';
import { register } from '../registry';
import { S } from '../state';
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
  const c = l.creator, host = l.creator_id === S.me!.id, has = host || l.price === 0 || A.tickets.has(l.id);
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
  return `<div class="pagehead"><div><h1>Lives</h1><p>Emissões ao vivo dos criadores. Algumas são gratuitas, outras pedem bilhete.</p></div>${S.creator?.status === 'approved' ? `<button class="btn pri" data-act="stGo" data-v="lives">${ic('plus')}Agendar live</button>` : ''}</div>
   <h3 style="margin-bottom:14px">Ao vivo agora</h3>${on.length ? `<div class="lgrid">${on.map((l) => liveCard(l, A)).join('')}</div>` : '<p class="muted">Ninguém está ao vivo neste momento.</p>'}
   <h3 style="margin:36px 0 14px">Próximas lives</h3>${next.length ? `<div class="lgrid">${next.map((l) => liveCard(l, A)).join('')}</div>` : '<p class="muted">Sem lives agendadas.</p>'}`;
}

/* ---------- Sala ---------- */

/* A biblioteca de vídeo só é carregada quando alguém entra numa sala, e vem do
 * pacote npm (não de um CDN). Ver `config.ts`. */
type LKRoom = import('livekit-client').Room;
let room: LKRoom | null = null;
let chatCh: ReturnType<typeof sb.channel> | null = null, liveCh: ReturnType<typeof sb.channel> | null = null;

/** Geração da montagem atual. Qualquer operação assíncrona verifica este valor antes de
 *  tocar em nada: sem ele, sair da página a meio do fetch do chat fazia a continuação de
 *  mountLive() criar os canais e ligar a câmara DEPOIS do leave() já ter corrido — o criador
 *  ficava a transmitir sem saber, e os canais ficavam vazados. */
let mountGen = 0;

function leave(): void {
  mountGen++;                      // invalida qualquer montagem em curso
  try { room?.disconnect(); } catch { /* já desligada */ }
  room = null;
  if (chatCh) { void sb.removeChannel(chatCh); chatCh = null; }
  if (liveCh) { void sb.removeChannel(liveCh); liveCh = null; }
}

export async function vLive(id: string): Promise<string> {
  const { data: raw } = await sb.from('lives').select(L_SEL).eq('id', id).maybeSingle();
  const l = raw as any;
  if (!l) return '<div class="empty"><h2>Live não encontrada</h2><a class="btn out" style="margin-top:14px" href="#lives">Ver lives</a></div>';
  const host = l.creator_id === S.me!.id, A = await myAccess([l.id]);
  const has = host || l.price === 0 || A.tickets.has(l.id), c = l.creator;
  let gate = '';
  if (l.status === 'ended') gate = `<div class="gate"><b style="font-size:18px">Esta live terminou</b><a class="btn pri" href="#lives">Ver outras lives</a></div>`;
  else if (!has) gate = `<div class="gate">${ic('lock', 'style="width:28px;height:28px"')}<b style="font-size:17px">Live com bilhete</b><button class="btn pri" data-act="buyTicket" data-id="${l.id}" data-price="${l.price}">Comprar bilhete · ${kz(l.price)}</button></div>`;
  else if (l.status === 'scheduled' && !host) gate = `<div class="gate"><b style="font-size:18px">Começa ${fmtDate(l.starts_at, true)}</b><span>${l.price ? 'Já tens bilhete.' : 'Entrada livre.'} Recebes uma notificação quando começar.</span></div>`;
  else if (l.status === 'scheduled' && host) gate = `<div class="gate"><b style="font-size:18px">Pronta para começar?</b><span class="small">O navegador vai pedir acesso à câmara e ao microfone.</span><button class="btn pri" data-act="liveStart" data-id="${l.id}">Começar agora</button></div>`;
  const img = c.cover_url || c.profile.avatar_url;
  const canChat = has && l.status === 'live';
  S.liveCtx = { id: l.id, host, join: has && l.status === 'live' };
  return `<div class="row between wrapf" style="margin-bottom:14px"><a class="btn link" href="#lives">${ic('back', 'style="width:16px;height:16px"')}Todas as lives</a>${host && l.status === 'live' ? `<button class="btn pri sm" data-act="liveEnd" data-id="${l.id}">Terminar live</button>` : ''}</div>
   <div class="liveroom">
    <div class="stage" id="liveStage">${gate && img ? `<img src="${esc(img)}" alt="" style="filter:blur(14px) brightness(.55);transform:scale(1.1)">` : ''}
     ${l.status === 'live' ? `<span class="onair">AO VIVO</span><span class="viewers" id="lvViewers"></span>` : ''}
     ${gate || `<div id="lkVideo" style="position:absolute;inset:0"></div><span class="wm c">@${esc(S.me!.handle)}</span><p class="muted" id="lkStatus" style="position:relative;color:#fff">A ligar…</p>`}
     <div class="cap"><b>${esc(l.title)}</b><span class="small">${esc(cname(c))} · ${l.price ? 'bilhete ' + kz(l.price) : 'entrada livre'}</span></div></div>
    <div class="lchat"><div class="hd"><span>Chat da live</span>${!host && has ? `<button class="btn soft sm" data-act="tip" data-id="${c.id}" data-live="${l.id}">${ic('gift')}Gorjeta</button>` : ''}</div>
     <div class="list" id="lchatList"></div>
     <form class="compose" id="liveForm" data-id="${l.id}"><input type="text" id="liveInput" maxlength="300" placeholder="${canChat ? 'Escreve no chat' : 'O chat abre quando a live começar'}" ${canChat ? '' : 'disabled'} aria-label="Mensagem" autocomplete="off"><button class="btn pri" style="padding:11px 14px" aria-label="Enviar" ${canChat ? '' : 'disabled'}>${ic('send')}</button></form>
    </div></div>`;
}

function chatLine(m: any): string {
  const n = esc(m.profile?.name || m.profile?.handle || 'Fã');
  return m.tip_amount ? `<div class="tipmsg">${n} enviou ${kz(m.tip_amount)}${m.body ? ': ' + esc(m.body) : ''}</div>` : `<div><b style="color:var(--ink)">${n}</b> ${esc(m.body)}</div>`;
}

/** Chamado depois de desenhar a sala: liga o chat e o vídeo. */
export async function mountLive(): Promise<void> {
  const ctx = S.liveCtx; if (!ctx) return;
  S.cleanup.push(leave);
  const gen = ++mountGen;
  const alive = (): boolean => gen === mountGen;
  const list = $('#lchatList');
  const { data: msgs } = await sb.from('live_chat').select('*, profile:profiles(handle,name)').eq('live_id', ctx.id).order('created_at', { ascending: false }).limit(80);
  if (!alive()) return;                                  // o utilizador já saiu enquanto esperávamos
  if (list) { list.innerHTML = (msgs || []).reverse().map((m) => chatLine(m)).join(''); list.scrollTop = list.scrollHeight; }
  chatCh = sb.channel('live-chat-' + ctx.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_chat', filter: `live_id=eq.${ctx.id}` }, async (x) => {
      if (!alive()) return;
      const { data: p } = await sb.from('profiles').select('handle,name').eq('id', (x.new as any).user_id).maybeSingle();
      if (!alive()) return;
      const el = $('#lchatList'); if (!el) return;
      el.insertAdjacentHTML('beforeend', chatLine({ ...x.new, profile: p })); el.scrollTop = el.scrollHeight;
    }).subscribe();
  liveCh = sb.channel('live-row-' + ctx.id)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lives', filter: `id=eq.${ctx.id}` }, (x) => {
      if (!alive()) return;
      if ((x.new as any).status === 'ended' && !ctx.host) { toast('A live terminou'); rerender(); }
      if ((x.new as any).status === 'live' && !ctx.join) rerender();
    }).subscribe();
  if (ctx.join) await connect(ctx, alive);
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
    const box = $('#lkVideo');
    const attach = (track: import('livekit-client').RemoteTrackPublication | any) => {
      if (!alive()) return;
      if (!box) return;
      const el = track.attach();
      if (track.kind === 'video') { box.innerHTML = ''; el.style.cssText = 'width:100%;height:100%;object-fit:contain;background:#000'; box.appendChild(el); status(''); }
      else document.body.appendChild(el);
    };
    const count = () => { const v = $('#lvViewers'); if (v) v.textContent = `${r.remoteParticipants.size + (ctx.host ? 0 : 1)} a ver`; };
    r.on(LK.RoomEvent.TrackSubscribed, (track) => attach(track))
      .on(LK.RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((e) => e.remove()))
      .on(LK.RoomEvent.ParticipantConnected, count).on(LK.RoomEvent.ParticipantDisconnected, count)
      .on(LK.RoomEvent.AudioPlaybackStatusChanged, () => {
        if (!alive() || !r.canPlaybackAudio || $('#unmute')) return;
        $('#liveStage')?.insertAdjacentHTML('beforeend', `<button class="btn pri unmute" id="unmute" data-act="liveAudio">${ic('volume')}Ativar som</button>`);
      })
      .on(LK.RoomEvent.Disconnected, () => status('Ligação terminada.'));
    await r.connect(url, token);
    room = r;                                             // só publica a sala depois de ligada
    if (!alive()) { try { r.disconnect(); } catch { /* já desligada */ } return; }
    count();
    if (ctx.host) {
      await r.localParticipant.enableCameraAndMicrophone();
      // Se o criador tiver saído durante o pedido de permissão, desligava-se mal a câmara ligasse.
      if (!alive()) { try { r.disconnect(); } catch { /* já desligada */ } return; }
      const pub = [...r.localParticipant.videoTrackPublications.values()][0];
      if (pub?.track) attach(pub.track);
    } else {
      status('À espera do vídeo do criador…');
      r.remoteParticipants.forEach((p) => p.trackPublications.forEach((t) => t.track && attach(t.track)));
    }
  } catch (e) {
    if (!alive()) return;
    status(/Permission|NotAllowed/i.test(String(e)) ? 'Precisamos de acesso à câmara e ao microfone. Autoriza no navegador e recarrega a página.' : errText(e));
  }
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
    const { error } = await sb.from('lives').update({ status: 'ended' }).eq('id', d.id).eq('creator_id', S.me.id);
    if (error) return toast(errText(error));
    leave(); toast('Live terminada'); S.stTab = 'lives'; go('estudio');
  },
  liveAudio() { room?.startAudio(); $('#unmute')?.remove(); },
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
