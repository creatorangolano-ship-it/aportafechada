// Mensagens em tempo real, com conteúdo pago enviado pelo criador
import { sb, $, esc, kz, ic, avatarOf, toast, modal, closeModal, showErr, errText, hhmm, fmtDate, signedUrls, upload, safeName, uuid, busy, rerender, field } from '../lib';
import { register } from '../registry';
import { S, loadCounts } from '../state';
import { openPay } from '../pay';
import type { Actions, ChangeFn, SubmitFn } from '../types';

const TH_SEL = '*, fan:profiles(id,handle,name,avatar_url), creator:creators(id,profile:profiles!creators_id_fkey(id,handle,name,avatar_url))';

/** Uma mensagem como chega do servidor, já com os campos que este módulo calcula
 *  e guarda por cima (`open`, `urls`). */
type Msg = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string | null;
  ppv_price: number | null;
  media?: Array<{ path: string; type?: string }>;
  created_at: string;
  /** Calculado em `loadThread`: o corpo e os ficheiros estão visíveis para este utilizador? */
  open?: boolean;
  /** URL assinado de cada anexo. Só existe quando `open` é true. */
  urls?: Array<{ path: string; type?: string; url?: string }>;
};

/** A conversa aberta: o `t` da tabela `threads` e as mensagens já carregadas. */
type Cur = { t: any; msgs: Msg[] } | null;

let cur: Cur = null;
/** Impede que uma conversa antiga "ganhe a corrida" a uma aberta mais recentemente. */
let loadSeq = 0;

/** Vai sempre buscar o id de sessão mais recente em vez de confiar em S.me.id, que pode ficar desatualizado. */
async function myId(): Promise<string | undefined> {
  const { data } = await sb.auth.getUser();
  return data?.user?.id || S.me?.id;
}

/** O outro interlocutor de uma conversa: o criador se eu sou o fã, o fã se eu sou o criador. */
function peerOf(t: any): any {
  return t.fan_id === S.me!.id ? { ...t.creator.profile, isCreator: true } : { ...t.fan, isCreator: false };
}
const unreadFor = (t: any): boolean =>
  new Date(t.last_message_at) > new Date(t.fan_id === S.me!.id ? t.fan_read_at : t.creator_read_at);

async function loadThread(id: string): Promise<Cur> {
  const uid = S.me!.id;
  const [{ data: t }, { data: msgs }] = await Promise.all([
    sb.from('threads').select(TH_SEL).eq('id', id).or(`fan_id.eq.${uid},creator_id.eq.${uid}`).maybeSingle(),
    sb.from('messages').select('*').eq('thread_id', id).order('created_at', { ascending: true }).limit(300),
  ]);
  // A conta de admin consegue ver todas as conversas (para o painel de auditoria em Admin > Mensagens),
  // mas a caixa de Mensagens pessoal só deve mostrar conversas de que a pessoa faz mesmo parte.
  if (!t) return null;
  const list = (msgs || []) as Msg[];
  const paths: string[] = [];
  for (const m of list) { m.open = !m.ppv_price || m.sender_id === uid; if (m.open) for (const f of m.media || []) paths.push(f.path); }
  // Só se pergunta ao servidor pelas compras desta conversa (nunca todas as do utilizador).
  // `purchases` não tem coluna `status`: cada linha já é uma compra concluída (o estado
  // do pagamento vive em `orders`). Um .eq('status') aqui dava HTTP 400 e a consulta inteira falhava.
  const ppvIds = list.filter((m) => m.ppv_price && m.sender_id !== uid).map((m) => m.id);
  if (ppvIds.length) {
    const { data: bought } = await sb.from('purchases').select('ref_id').eq('user_id', uid)
      .eq('kind', 'message').in('ref_id', ppvIds);
    const B = new Set((bought || []).map((x: { ref_id: string }) => x.ref_id));
    for (const m of list) if (B.has(m.id)) { m.open = true; for (const f of m.media || []) paths.push(f.path); }
  }
  const urls = paths.length ? await signedUrls('messages', paths) : {};
  for (const m of list) m.urls = (m.media || []).map((f) => ({ ...f, url: m.open ? urls[f.path] : undefined }));
  // O `sb.rpc()` devolve um `PromiseLike` (thenable do supabase-js), que não
  // tem `.catch`. `Promise.resolve` embrulha-o numa Promise a sério sem esperar
  // por ela, que é o que se quer: isto é um trabalho de fundo, e o `await`
  // atrasaria a abertura da conversa à resposta do servidor.
  void Promise.resolve(sb.rpc('mark_thread_read', { p_thread: id }))
    .then(() => loadCounts())
    .catch(() => { /* a contagem de não-lidas reconcilia-se na próxima abertura */ });
  return { t, msgs: list };
}

/** Sequências de mensagens com os separadores de dia, para as atualizações incrementais
 *  não perderem as datas que o desenho inicial da conversa mostra. */
function msgsHTML(list: Msg[]): string {
  let day = '';
  return list.map((m) => { const d = fmtDate(m.created_at); const sep = d !== day ? `<span class="daysep">${d}</span>` : ''; day = d; return sep + msgHTML(m); }).join('');
}

function msgHTML(m: Msg): string {
  const me = m.sender_id === S.me!.id;
  const files = (m.urls || []).filter((f) => f.url).map((f) => `<div style="position:relative">${f.type?.startsWith('video')
    ? `<video src="${esc(f.url)}" controls playsinline controlsList="nodownload noremoteplayback" disablePictureInPicture oncontextmenu="return false" style="width:100%;border-radius:8px;display:block"></video>`
    : `<img loading="lazy" decoding="async" src="${esc(f.url)}" alt="" draggable="false" oncontextmenu="return false" style="width:100%;border-radius:8px;display:block;-webkit-user-drag:none;user-select:none">`}<span class="wm c" style="font-size:15px">@aportafechada.net</span></div>`).join('');
  if (m.ppv_price) {
    if (me) return `<div class="attach" style="align-self:flex-end"><div class="row">${ic('lock', 'style="width:22px;height:22px;color:var(--acc)"')}<div style="flex:1"><b style="color:var(--ink)">${esc(m.body || 'Conteúdo pago')}</b><div class="small muted">Conteúdo pago · ${kz(m.ppv_price)} · ${(m.media || []).length} ficheiro(s)</div></div></div>${files}<span class="small muted">${hhmm(m.created_at)}</span></div>`;
    if (!m.open) return `<div class="attach"><div class="textlock">${ic('lock', 'style="width:24px;height:24px;color:var(--muted)"')}<b style="color:var(--ink)">${esc(m.body || 'Conteúdo pago')}</b><span class="small muted">${(m.media || []).length} ficheiro(s)</span><button class="btn pri sm" data-act="buyMsg" data-id="${m.id}" data-price="${m.ppv_price}">Desbloquear por ${kz(m.ppv_price)}</button></div><span class="small muted">${hhmm(m.created_at)}</span></div>`;
    return `<div class="attach">${files}<b style="color:var(--ink)">${esc(m.body)}</b><span class="small muted">Desbloqueado · ${hhmm(m.created_at)}</span></div>`;
  }
  return `<div class="bub ${me ? 'me' : 'c'}">${files}${esc(m.body)}<span class="tm">${hhmm(m.created_at)}</span></div>`;
}

export async function vMensagens(): Promise<string> {
  const uid = S.me!.id;
  const { data } = await sb.from('threads').select(TH_SEL).or(`fan_id.eq.${uid},creator_id.eq.${uid}`).order('last_message_at', { ascending: false }).limit(100);
  const list = ((data || []) as any[]).filter((t) => !S.tq || peerOf(t).name?.toLowerCase().includes(S.tq.toLowerCase()) || peerOf(t).handle?.toLowerCase().includes(S.tq.toLowerCase()));
  const seq = ++loadSeq;
  const loaded = S.thread ? await loadThread(S.thread) : null;
  if (seq === loadSeq) cur = loaded; // só aplica se nenhuma conversa mais recente foi aberta entretanto
  let chat = `<div class="empty" style="margin:auto">${list.length ? 'Escolhe uma conversa.' : 'Ainda não tens mensagens. Abre o perfil de um criador e toca no ícone de mensagem.'}</div>`;
  if (cur) {
    const p = peerOf(cur!.t), iAmCreator = cur!.t.creator_id === uid;
    chat = `<div class="hd"><button class="tbtn back" data-act="closeThread" aria-label="Voltar">${ic('back')}</button>${avatarOf(p)}<div style="flex:1;min-width:0"><b style="color:var(--ink)">${esc(p.name || p.handle)}</b><div class="small muted">@${esc(p.handle)}</div></div>${p.isCreator ? `<a class="btn out sm" href="#perfil-${esc(p.handle)}">Ver perfil</a>` : ''}</div>
     <div class="scroll" id="chatScroll">${msgsHTML(cur!.msgs) || '<p class="empty">Diz olá.</p>'}</div>
     <form class="compose" id="chatForm"><button type="button" class="tbtn" style="border:0" data-act="chatAttach" aria-label="Anexar foto ou vídeo" title="Anexar foto ou vídeo">${ic('upload')}</button><input type="file" id="chatFile" accept="image/*,video/mp4" multiple hidden>
      ${iAmCreator ? `<button type="button" class="tbtn" style="border:0" data-act="ppvNew" aria-label="Enviar conteúdo pago" title="Enviar conteúdo pago">${ic('lock')}</button>` : `<button type="button" class="tbtn" style="border:0" data-act="tip" data-id="${cur!.t.creator_id}" aria-label="Enviar gorjeta" title="Enviar gorjeta">${ic('gift')}</button>`}
      <input type="text" id="chatInput" placeholder="Escreve uma mensagem" autocomplete="off" maxlength="2000" aria-label="Mensagem"><button class="btn pri" style="padding:11px 14px" aria-label="Enviar">${ic('send')}</button></form>`;
  }
  return `<div class="box msgs ${cur ? 'inchat' : ''}">
   <div class="tlist"><div class="hd"><h2 style="margin-bottom:12px">Mensagens</h2><label class="search" style="height:42px;margin:0">${ic('search')}<input id="tq" type="search" placeholder="Procurar conversas" value="${esc(S.tq || '')}" aria-label="Procurar conversas"></label></div>
    <div class="items">${list.map((t) => { const p = peerOf(t), u = unreadFor(t) && S.thread !== t.id; return `<button class="titem ${S.thread === t.id ? 'on' : ''}" data-act="openThread" data-id="${t.id}">${avatarOf(p)}<span class="t"><b style="color:var(--ink)">${esc(p.name || p.handle)}</b><span class="l2">@${esc(p.handle)}</span></span><span class="r">${fmtDate(t.last_message_at)}${u ? '<span class="count">•</span>' : ''}</span></button>`; }).join('')}</div></div>
   <div class="chat">${chat}</div></div>`;
}

/** Recebe mensagens novas em tempo real.
 *  O canal filtra pela conversa aberta (channelThread) e, em segundo plano, só alerta a lista lateral.
 *  Antes subscrevia a TODAS as mensagens da plataforma sem filtro, o que entregava o corpo de
 *  mensagens alheias ao browser de cada utilizador e disparava uma query por cada uma. */
let channel: ReturnType<typeof sb.channel> | null = null;
let channelThread: string | null = null;

export function startMessagesRealtime(): void {
  if (channel || !S.me) return;
  const uid = S.me.id;
  channel = sb.channel('msgs-' + uid)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (x) => {
      const m = x.new as unknown as Msg;
      if (m.sender_id === uid) return;
      // Só a conversa aberta é desenhada em tempo real; o resto passa pela lista de conversas,
      // que é recarregada quando se abre a página. A RLS é o que garante que x.new é mesmo
      // desta pessoa — daí o filtro explícito da conversa no canal.
      if (channelThread && m.thread_id !== channelThread) return;
      if (cur && m.thread_id === cur.t.id && location.hash === '#mensagens') {
        const fresh = await loadThread(cur.t.id); if (!fresh) return; cur = fresh;
        const sc = $('#chatScroll'); if (sc) { sc.innerHTML = msgsHTML(cur!.msgs); sc.scrollTop = sc.scrollHeight; }
      } else {
        await loadCounts(); document.dispatchEvent(new CustomEvent('apf:header'));
        toast('Nova mensagem');
      }
    }).subscribe();
}
/** Restringe o canal à conversa aberta (usado ao abrir/fechar uma conversa). */
export function setRealtimeThread(id: string | null): void { channelThread = id || null; }
export function stopMessagesRealtime(): void { if (channel) { void sb.removeChannel(channel); channel = null; } }

export const msgActions: Actions = {
  openThread(d) { loadSeq++; S.thread = d.id; setRealtimeThread(d.id!); rerender(); },
  closeThread() { loadSeq++; S.thread = null; setRealtimeThread(null); rerender(); },
  /** Relê o preço no servidor. O data-price é controlado por quem compra: não pode ser a fonte. */
  async buyMsg(d) {
    const { data: m } = await sb.from('messages').select('id,ppv_price,thread_id').eq('id', d.id).maybeSingle();
    if (!m || !(m as any).ppv_price) return toast('Este conteúdo já não está à venda.');
    openPay({ kind: 'message', target_id: (m as any).id as string, amount: Number((m as any).ppv_price), title: 'Desbloquear conteúdo', sub: 'Fica disponível nesta conversa.', okText: 'Conteúdo desbloqueado.', onPaid: () => rerender() });
  },
  ppvNew() {
    S.ppvFiles = [];
    modal(`<h3>Enviar conteúdo pago</h3><p class="small muted">O fã vê a descrição e desbloqueia pagando.</p>
     <div class="field"><label for="ppvLabel">Descrição</label><input id="ppvLabel" maxlength="120" placeholder="Ex.: 10 fotos dos bastidores"></div>
     <div class="field"><label for="ppvPrice">Preço (Kz)</label><input id="ppvPrice" type="number" min="200" step="100" value="1500"></div>
     <label class="drop">${ic('upload', 'style="width:22px;height:22px"')}<b style="color:var(--ink)">Anexar fotos ou vídeos</b><span class="small muted" id="ppvF">JPG, PNG ou MP4, até 5 ficheiros</span><input type="file" accept="image/*,video/mp4" multiple id="ppvFile"></label>
     <span class="err" id="ppvErr" hidden></span><button class="btn pri block" data-act="ppvSend" id="ppvBtn">Enviar</button>`);
  },
  async ppvSend() {
    if (!S.me || !cur) return toast('A sessão expirou. Entra outra vez.');
    const label = field('#ppvLabel').value.trim(), price = +field('#ppvPrice').value, files = S.ppvFiles;
    if (label.length < 3) return showErr('#ppvErr', 'Escreve uma descrição curta.');
    if (!Number.isFinite(price) || price < 200) return showErr('#ppvErr', 'O preço mínimo é 200 Kz.');
    if (!files.length) return showErr('#ppvErr', 'Anexa pelo menos um ficheiro.');
    const btn = $<HTMLButtonElement>('#ppvBtn'); busy(btn, true, 'A enviar…');
    try {
      const uid = await myId(), id = uuid(), tId = cur!.t.id, media: Array<{ path: string; type: string }> = [];
      for (const f of files) media.push({ path: await upload('messages', `${tId}/${id}/${Date.now()}-${safeName(f.name)}`, f), type: f.type });
      const { error } = await sb.from('messages').insert({ id, thread_id: tId, sender_id: uid, body: label, ppv_price: price, media });
      if (error) throw error;
      closeModal(); toast('Conteúdo pago enviado'); rerender();
    } catch (e) { busy(btn, false); showErr('#ppvErr', errText(e)); }
  },
  chatAttach() { $<HTMLInputElement>('#chatFile')?.click(); },
};

export const msgSubmit: SubmitFn = async (f) => {
  if (f.id !== 'chatForm') return false;
  const i = $<HTMLInputElement>('#chatInput'), v = i?.value.trim() ?? '';
  if (!v || !cur) return true;
  i!.value = '';
  const tId = cur.t.id, uid = await myId();
  const { error } = await sb.from('messages').insert({ thread_id: tId, sender_id: uid, body: v });
  if (error) { toast(errText(error)); i!.value = v; return true; }
  const fresh = await loadThread(tId); if (fresh) cur = fresh;
  const sc = $('#chatScroll'); if (sc) { sc.innerHTML = msgsHTML(cur!.msgs); sc.scrollTop = sc.scrollHeight; }
  $<HTMLInputElement>('#chatInput')?.focus();
  return true;
};

async function sendChatFiles(files: File[]): Promise<void> {
  if (!cur) return;
  const tId = cur.t.id, uid = await myId(), id = uuid(), media: Array<{ path: string; type: string }> = [];
  try {
    for (const f of files) media.push({ path: await upload('messages', `${tId}/${id}/${Date.now()}-${safeName(f.name)}`, f), type: f.type });
    const { error } = await sb.from('messages').insert({ id, thread_id: tId, sender_id: uid, body: '', media });
    if (error) throw error;
  } catch (e) { toast(errText(e)); return; }
  const fresh = await loadThread(tId); if (fresh) cur = fresh;
  const sc = $('#chatScroll'); if (sc) { sc.innerHTML = msgsHTML(cur!.msgs); sc.scrollTop = sc.scrollHeight; }
}

export const msgChange: ChangeFn = (t) => {
  if (t.id === 'ppvFile') {
    const inp = t as HTMLInputElement;
    const files = [...(inp.files || [])].slice(0, 5);
    if (files.some((f) => f.size > 200e6)) { toast('Cada ficheiro pode ter até 200 MB.'); return true; }
    S.ppvFiles = files; const lbl = $('#ppvF'); if (lbl) lbl.textContent = files.map((f) => f.name).join(', ');
    return true;
  }
  if (t.id === 'chatFile') {
    const inp = t as HTMLInputElement;
    const files = [...(inp.files || [])].slice(0, 4);
    inp.value = '';
    if (files.length && !files.some((f) => f.size > 200e6)) void sendChatFiles(files);
    else if (files.some((f) => f.size > 200e6)) toast('Cada ficheiro pode ter até 200 MB.');
    return true;
  }
  return false;
};

register({ actions: msgActions, submit: msgSubmit, change: msgChange });
