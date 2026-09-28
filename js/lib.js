// Utilitários: cliente Supabase, ícones, formatação, modais, ficheiros
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const dots = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const kz = (n) => dots(n) + ' Kz';
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uuid = () => crypto.randomUUID();
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export function fmtDate(d, withTime = false) {
  if (!d) return '';
  const x = new Date(d);
  const s = `${x.getDate()} ${MESES[x.getMonth()]} ${x.getFullYear()}`;
  return withTime ? `${s}, ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}` : s;
}
export function monthName(ym) { const [y, m] = ym.split('-'); return MESES[Number(m) - 1]; }
export function ago(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) { const n = Math.floor(s / 86400); return n === 1 ? 'ontem' : `há ${n} dias`; }
  return fmtDate(d);
}
export function hhmm(d) { const x = new Date(d); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; }

/* ---------- Ícones ---------- */
const I = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  chat: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z"/>',
  home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z"/>',
  doc: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.3c-.6-1-1.7-1.5-3-1.5-1.8 0-3 .9-3 2.2 0 3.3 6 1.6 6 4.8 0 1.3-1.3 2.3-3 2.3-1.4 0-2.6-.6-3.2-1.6M12 6v1.8M12 16.8V18"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  heart: '<path d="M12 20s-7.5-4.6-9.3-9.4C1.5 7.3 3.6 4 7 4c2 0 3.6 1.2 5 3 1.4-1.8 3-3 5-3 3.4 0 5.5 3.3 4.3 6.6C19.5 15.4 12 20 12 20Z"/>',
  share: '<path d="M14 5l6 6-6 6M20 11H10a6 6 0 0 0-6 6v1"/>',
  bookmark: '<path d="M6 3h12v18l-6-4.5L6 21V3Z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  badge: '<path d="M12 2.5 14.6 5l3.5-.3.6 3.5 3 1.9-1.6 3.1 1.6 3.1-3 1.9-.6 3.5-3.5-.3L12 23.5 9.4 21l-3.5.3-.6-3.5-3-1.9 1.6-3.1-1.6-3.1 3-1.9.6-3.5 3.5.3Z" fill="currentColor" stroke="none"/><path d="m8 12.5 2.8 2.7L16.5 9.5" stroke="#fff"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4.5" rx="1"/><path d="M5 12.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7.5M12 8v13M12 8c-1.5-3.5-5.5-4-5.5-1.5S12 8 12 8Zm0 0c1.5-3.5 5.5-4 5.5-1.5S12 8 12 8Z"/>',
  send: '<path d="m21 3-9.5 18-2-8-7.5-2.5L21 3Z"/><path d="m21 3-11.5 10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6L12 3Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16.5" height="12" rx="2"/><path d="M16 14h4.5"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 9.5h19M6 15h4"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M15.5 8.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 5.7l2.1 2.1M17.7 16.2l2.1 2.1M2.5 12h3M18.5 12h3M4.2 18.3l2.1-2.1M17.7 7.8l2.1-2.1"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  live: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10.5 5-3v9l-5-3"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',
  out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>',
  play: '<path d="M7 4.5v15l13-7.5L7 4.5Z" fill="currentColor"/>',
  volume: '<path d="M4 9.5v5h4l5 4v-13l-5 4H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  expand: '<path d="M4 9V4.5h4.5M20 9V4.5h-4.5M4 15v4.5h4.5M20 15v4.5h-4.5"/>',
};
export const ic = (n, x = '') => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${x}>${I[n] || ''}</svg>`;
export const GOOGLE = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
export const LOGO = (w = 26, h = 32) => `<svg width="${w}" height="${h}" viewBox="0 0 26 32" aria-hidden="true"><path d="M2 3.2 18.6.1A2.5 2.5 0 0 1 21.5 2.6v26.8a2.5 2.5 0 0 1-2.9 2.5L2 28.8A2.5 2.5 0 0 1 0 26.3V5.7a2.5 2.5 0 0 1 2-2.5Z" style="fill:var(--acc)"/><path d="M24.5 3v26" style="stroke:var(--ink)" stroke-width="2.2" stroke-linecap="round"/><circle cx="14.8" cy="16" r="1.9" fill="#fff"/></svg>`;

export function avatarOf(p, cls = '') {
  if (p?.avatar_url) return `<span class="avatar ${cls}"><img src="${esc(p.avatar_url)}" alt=""></span>`;
  return `<span class="avatar ${cls}">${esc(((p?.name || p?.handle || '?') + '')[0].toUpperCase())}</span>`;
}

/* ---------- Toast e modais ---------- */
export function toast(t) {
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t;
  const root = $('#toastRoot'); root.innerHTML = ''; root.appendChild(el);
  clearTimeout(toast.t); toast.t = setTimeout(() => el.remove(), 3200);
}
export function modal(html, o = {}) {
  $('#modalRoot').innerHTML = `<div class="scrim" data-scrim ${o.noClose ? 'data-lock' : ''}><div class="modal" role="dialog" aria-modal="true">${o.noClose ? '' : `<button class="x" data-act="closeModal" aria-label="Fechar">${ic('x')}</button>`}${html}</div></div>`;
  const f = $('#modalRoot .modal').querySelector('input:not([type=radio]):not([type=checkbox]),select,textarea,button:not(.x)');
  if (f) f.focus();
}
export function closeModal() { $('#modalRoot').innerHTML = ''; closeModal.hooks.forEach((h) => h()); closeModal.hooks = []; }
closeModal.hooks = [];
export function showErr(sel, msg) { const e = $(sel); if (e) { e.hidden = false; e.textContent = msg; } }
export function busy(btn, on, label) {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spin" aria-hidden="true"></span><span>${esc(label || 'Aguarda…')}</span>`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

/** Animação de "porta a abrir" mostrada ao entrar na conta. É só decorativa (nunca bloqueia cliques,
 * mesmo que algo corra mal — tem sempre um limite de tempo que garante que desaparece).
 * Uso: const openDoor = doorTransition(); <trocar o conteúdo por trás, ex. rerender()>; await openDoor();
 * Devolve uma função que, quando chamada, faz a porta abrir e remove a sobreposição. */
export function doorTransition() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return async () => {};
  try {
    const el = document.createElement('div');
    el.className = 'door-overlay';
    el.innerHTML = `<div class="door-leaf">${LOGO(100, 124)}</div><div class="door-label">À Porta Fechada</div>`;
    document.body.appendChild(el);
    el.offsetHeight; // força o layout antes de animar
    return () => new Promise((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; el.remove(); resolve(); };
      setTimeout(finish, 1100); // rede de segurança: garante que nunca fica presa no ecrã
      requestAnimationFrame(() => {
        el.classList.add('open');
        el.querySelector('.door-leaf')?.classList.add('open');
      });
      el.addEventListener('transitionend', (e) => { if (e.target === el && e.propertyName === 'opacity') finish(); });
    });
  } catch {
    return async () => {};
  }
}

/** Abre uma imagem em ecrã cheio, com opção de a colocar em ecrã inteiro de verdade (Fullscreen API).
 * Só deve ser chamada com conteúdo a que o utilizador já tem acesso (nunca com pré-visualizações trancadas). */
export function lightbox(url) {
  if (!url) return;
  const el = document.createElement('div');
  el.className = 'lbox';
  el.innerHTML = `<img src="${esc(url)}" alt="" draggable="false" oncontextmenu="return false"><span class="wm c">À PORTA FECHADA</span>
   <button class="lbox-full" aria-label="Ecrã inteiro" title="Ecrã inteiro">${ic('expand')}</button>
   <button class="lbox-x" aria-label="Fechar" title="Fechar">${ic('x')}</button>`;
  document.body.appendChild(el);
  const img = el.querySelector('img');
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelector('.lbox-x').addEventListener('click', close);
  el.querySelector('.lbox-full').addEventListener('click', () => {
    const req = img.requestFullscreen || img.webkitRequestFullscreen;
    req?.call(img);
  });
}

/** Mensagem de erro legível a partir de erros do Supabase ou das funções. */
export function errText(e) {
  const m = e?.message || String(e || '');
  if (/Invalid login credentials/i.test(m)) return 'Email ou palavra-passe incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirma primeiro o teu email.';
  if (/User already registered/i.test(m)) return 'Já existe uma conta com este email. Entra ou recupera a palavra-passe.';
  if (/Password should be/i.test(m)) return 'A palavra-passe precisa de pelo menos 8 caracteres.';
  if (/rate limit/i.test(m)) return 'Demasiadas tentativas. Espera um minuto e tenta outra vez.';
  if (/Token has expired|invalid.*otp/i.test(m)) return 'O código expirou ou está errado. Pede um novo.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem ligação à internet. Tenta outra vez.';
  if (/duplicate key.*handle/i.test(m)) return 'Esse nome de utilizador já existe.';
  if (/row-level security policy/i.test(m)) return 'A tua sessão pode ter expirado. Atualiza a página e tenta outra vez.';
  return m || 'Algo correu mal. Tenta outra vez.';
}

/** Chama uma função do servidor e devolve os dados ou lança um erro com a mensagem. */
export async function fn(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; } catch { /* sem corpo */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/* ---------- Ficheiros ---------- */
const urlCache = new Map();
/** URLs temporários para ficheiros privados. Os que o utilizador não pode ver ficam em falta. */
export async function signedUrls(bucket, paths, ttl = 3600) {
  const out = {};
  const need = paths.filter((p) => { const c = urlCache.get(bucket + p); if (c && c.exp > Date.now()) { out[p] = c.url; return false; } return true; });
  if (need.length) {
    const { data } = await sb.storage.from(bucket).createSignedUrls(need, ttl);
    for (const r of data || []) if (r.signedUrl && !r.error) { out[r.path] = r.signedUrl; urlCache.set(bucket + r.path, { url: r.signedUrl, exp: Date.now() + (ttl - 60) * 1000 }); }
  }
  return out;
}
export async function upload(bucket, path, file, opts = {}) {
  const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: !!opts.upsert, contentType: file.type || undefined, cacheControl: '3600' });
  if (error) throw new Error(/Payload too large|exceeded/i.test(error.message) ? 'O ficheiro é demasiado grande.' : error.message);
  return path;
}
export function publicUrl(bucket, path) { return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl; }
export const safeName = (n) => String(n || 'ficheiro').normalize('NFD').replace(/[^\w.\-]+/g, '_').slice(-60);

/** Miniatura muito pequena e desfocada de uma imagem (mostrada a quem ainda não tem acesso). */
export async function blurPreview(file) {
  if (!file?.type?.startsWith('image/')) return null;
  const img = await createImageBitmap(file);
  const w = 32, h = Math.max(1, Math.round((img.height / img.width) * 32));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.filter = 'blur(2px)'; ctx.drawImage(img, 0, 0, w, h);
  return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.6));
}
/** Redimensiona imagens grandes antes de enviar (avatares e capas). */
export async function shrinkImage(file, max = 1600) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') return file;
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  if (k === 1 && file.size < 1.5e6) return file;
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
  return new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
/** Deixa o utilizador arrastar e ampliar a foto antes de a guardar como perfil ou capa.
 * aspect = largura/altura do enquadramento final (1 = quadrado, 3 = capa larga).
 * shape = 'round' (perfil) ou 'rect' (capa). Devolve um File já cortado, ou null se cancelar. */
export function cropImage(file, aspect = 1, { shape = 'rect', output = 900 } = {}) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') return Promise.resolve(file);
  return new Promise(async (resolve) => {
    let img;
    try { img = await createImageBitmap(file); } catch { return resolve(file); }
    const stageW = Math.min(420, Math.round(320 * Math.max(aspect, 1)));
    const stageH = Math.round(stageW / aspect);
    const baseScale = Math.max(stageW / img.width, stageH / img.height);
    let mult = 1, offX = 0, offY = 0;
    const center = () => {
      const dw = img.width * baseScale * mult, dh = img.height * baseScale * mult;
      offX = Math.min(0, Math.max(stageW - dw, (stageW - dw) / 2));
      offY = Math.min(0, Math.max(stageH - dh, (stageH - dh) / 2));
    };
    center();
    modal(`<h3>Ajustar imagem</h3><p class="muted small">Arrasta para posicionar e usa a barra para aproximar.</p>
     <div style="display:flex;justify-content:center;padding:6px 0">
      <canvas id="cropStage" width="${stageW}" height="${stageH}" style="touch-action:none;cursor:grab;border-radius:${shape === 'round' ? '50%' : '14px'};background:#000;max-width:100%"></canvas>
     </div>
     <div class="field"><label for="cropZoom">Zoom</label><input id="cropZoom" type="range" min="100" max="300" value="100"></div>
     <div class="row" style="gap:10px;justify-content:flex-end">
      <button class="btn out" id="cropCancel" type="button">Cancelar</button>
      <button class="btn pri" id="cropOk" type="button">Usar esta imagem</button>
     </div>`, { noClose: true });
    const cv = $('#cropStage'), ctx = cv.getContext('2d');
    const draw = () => {
      ctx.clearRect(0, 0, stageW, stageH);
      const dw = img.width * baseScale * mult, dh = img.height * baseScale * mult;
      ctx.drawImage(img, offX, offY, dw, dh);
    };
    draw();
    let dragging = false, sx = 0, sy = 0, ox0 = 0, oy0 = 0;
    const clamp = () => {
      const dw = img.width * baseScale * mult, dh = img.height * baseScale * mult;
      offX = Math.min(0, Math.max(stageW - dw, offX));
      offY = Math.min(0, Math.max(stageH - dh, offY));
    };
    cv.addEventListener('pointerdown', (e) => { dragging = true; sx = e.clientX; sy = e.clientY; ox0 = offX; oy0 = offY; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', (e) => { if (!dragging) return; offX = ox0 + (e.clientX - sx); offY = oy0 + (e.clientY - sy); clamp(); draw(); });
    const stop = () => { dragging = false; cv.style.cursor = 'grab'; };
    cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
    $('#cropZoom').addEventListener('input', (e) => {
      const dw0 = img.width * baseScale * mult, dh0 = img.height * baseScale * mult;
      const cx = offX - dw0 / 2 + stageW / 2, cy = offY - dh0 / 2 + stageH / 2; // guarda o centro relativo
      mult = Number(e.target.value) / 100;
      const dw1 = img.width * baseScale * mult, dh1 = img.height * baseScale * mult;
      offX = cx + dw1 / 2 - stageW / 2; offY = cy + dh1 / 2 - stageH / 2;
      clamp(); draw();
    });
    const finish = (result) => { closeModal.hooks = closeModal.hooks.filter((h) => h !== onClose); closeModal(); resolve(result); };
    const onClose = () => resolve(null);
    closeModal.hooks.push(onClose);
    $('#cropCancel').addEventListener('click', () => finish(null));
    $('#cropOk').addEventListener('click', () => {
      const outW = output, outH = Math.round(output / aspect);
      const dw = img.width * baseScale * mult, dh = img.height * baseScale * mult;
      const sxImg = -offX / (dw / img.width), syImg = -offY / (dh / img.height);
      const swImg = stageW / (dw / img.width), shImg = stageH / (dh / img.height);
      const c = document.createElement('canvas'); c.width = outW; c.height = outH;
      c.getContext('2d').drawImage(img, sxImg, syImg, swImg, shImg, 0, 0, outW, outH);
      c.toBlob((b) => finish(new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.88);
    });
  });
}
export function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src === src)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Não foi possível carregar ' + src));
    document.head.appendChild(s);
  });
}
export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch { toast('Copia manualmente: ' + t); }
}

/** Volta a desenhar a página atual (keep = manter a posição do scroll). */
export const rerender = (keep = true) => document.dispatchEvent(new CustomEvent('apf:render', { detail: { keep } }));
/** Navegar para uma rota (#rota). */
export const go = (r) => { if (location.hash === '#' + r) rerender(false); else location.hash = r; };
