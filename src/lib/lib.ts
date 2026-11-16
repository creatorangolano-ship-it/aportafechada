// Utilitários da interface: DOM, ícones, formatação, modais, imagens.
// O acesso ao Supabase (cliente, funções, armazenamento) vive em src/infrastructure/supabase
// e é reexportado no fim deste ficheiro para as áreas que ainda não foram migradas.
import type { Profile } from './types';
import { caminhoDe } from './caminhos';
import { esc, ic, GOOGLE, LOGO } from './marcacao';
export { esc, ic, GOOGLE, LOGO };

/* ---------- DOM ---------- */

/**
 * `$` e `$$` devolvem `any` por omissão, e é deliberado.
 *
 * As vistas fazem `$('#payPhone').value`, `$('#aName').checked`,
 * `$('#set-fee_pct').value` — um elemento escolhido por selector CSS e usado logo
 * numa propriedade concreta. Anotar cada um com o tipo certo daria ~200 anotações que
 * não apanham nada: se o selector estiver errado, o elemento é `null` e rebenta
 * em runtime; o compilador nunca apanha isso, porque não pode saber o que o
 * selector devolve.
 *
 * A alternativa honesta — `$(sel)` devolvendo `HTMLElement | null` — obrigava a
 * um `!` em cada acesso, que é pior: escondia os casos em que o elemento
 * realmente pode não estar lá, e dava uma falsa sensação de segurança.
 *
 * Onde o tipo importa, escreve-se: `$<HTMLInputElement>('#payPhone')` falha em
 * tempo de compilação se usares `.value = 3`. É essa a forma de usar isto.
 */
export const $ = <T = any>(s: string, r: ParentNode = document): T => r.querySelector(s) as T;
export const $$ = <T = any>(s: string, r: ParentNode = document): T[] =>
  [...r.querySelectorAll(s)] as T[];

/** Um elemento que tem de existir. Lança se não existir, em vez de devolver null
 *  e explodir três linhas mais abaixo com "cannot read property of null". */
const need = <T extends Element>(el: T | null, what: string): T => {
  if (!el) throw new Error(`Elemento em falta: ${what}`);
  return el;
};

/* ---------- Formatação ---------- */

export const dots = (n: number | string | null | undefined): string =>
  String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
export const kz = (n: number | string | null | undefined): string => dots(n) + ' Kz';

/** Só deixa passar esquemas de URL que não executam código. `esc()` não chega: um `href="javascript:…"`
 *  escapado continua a ser um link executável quando alguém clica. Tudo o que for `javascript:`,
 *  `data:`, `vbscript:` ou um esquema desconhecido é trocado por '#'. */
export function safeHref(url: unknown): string {
  const u = String(url ?? '').trim();
  if (!u) return '';
  // Relativas internas (#rota, /caminho) e esquemas seguros. `https:`, `http:`, `mailto:`, `tel:`.
  if (/^[#/?]/.test(u)) return u;
  if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
  return '';
}
/** Versão para atributos href/src: nunca devolve string vazia (devolve '#' em vez disso). */
export const safeLink = (url: unknown): string => safeHref(url) || '#';
/** true se o URL abre noutro separador de forma segura (usar sempre com rel="noopener"). */
export const isExternal = (url: unknown): boolean => /^https?:/i.test(String(url || ''));
export const uuid = (): string => crypto.randomUUID();
export const isEmail = (v: unknown): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export function fmtDate(d: string | Date | null | undefined, withTime = false): string {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const s = `${x.getDate()} ${MESES[x.getMonth()]} ${x.getFullYear()}`;
  return withTime
    ? `${s}, ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
    : s;
}
export function monthName(ym: string): string {
  const [, m] = ym.split('-');
  return MESES[Number(m) - 1] ?? '';
}
export function ago(d: string | Date | null | undefined): string {
  if (!d) return '';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) { const n = Math.floor(s / 86400); return n === 1 ? 'ontem' : `há ${n} dias`; }
  return fmtDate(d);
}
export function hhmm(d: string | Date | null | undefined): string {
  if (!d) return '';
  const x = new Date(d);
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
}

/* ---------- Ícones ---------- */

// Os ícones, o logótipo e o `esc` vivem em `marcacao.ts` (o servidor também os usa).

/** A porta do logótipo na cor do texto (`currentColor`), com a fechadura recortada (transparente).
 *  Usada nos conteúdos bloqueados, onde o logótipo vermelho não se lia sobre a imagem desfocada. */
export const PORTA = (s = 40): string =>
  `<svg width="${s}" height="${Math.round(s * 130 / 112)}" viewBox="4 8 112 130" aria-hidden="true"><mask id="pfh"><rect x="0" y="0" width="120" height="140" fill="#fff"/><circle cx="67" cy="72" r="4.5" fill="#000"/><polygon points="65,75 69,75 70.5,87 63.5,87" fill="#000"/></mask><g fill="currentColor" mask="url(#pfh)"><polygon points="8,125 112,134 88,122 25,122"/><polygon points="25,28 82,12 82,122 25,122"/><polygon points="85,12 90,15 90,122 85,122"/></g></svg>`;

export function avatarOf(p: Partial<Profile> | null | undefined, cls = ''): string {
  if (p?.avatar_url) return `<span class="avatar ${cls}"><img loading="lazy" decoding="async" src="${esc(p.avatar_url)}" alt=""></span>`;
  return `<span class="avatar ${cls}">${esc(((p?.name || p?.handle || '?') + '')[0].toUpperCase())}</span>`;
}

/* ---------- Toast e modais ---------- */

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(t: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = t;
  const root = need($('#toastRoot'), '#toastRoot');
  root.innerHTML = '';
  root.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}

/** Funções a correr quando o modal fecha. `cropImage` usa isto para saber que
 *  foi cancelado, em vez de ficar à espera de um clique que nunca vem. */
const closeHooks: Array<() => void> = [];

export function modal(html: string, o: { noClose?: boolean } = {}): void {
  $('#modalRoot')!.innerHTML =
    `<div class="scrim" data-scrim ${o.noClose ? 'data-lock' : ''}><div class="modal" role="dialog" aria-modal="true">` +
    `${o.noClose ? '' : `<button class="x" data-act="closeModal" aria-label="Fechar">${ic('x')}</button>`}` +
    `${html}</div></div>`;
  // `$` devolve `any` por omissão, e um `any` não aceita argumentos de tipo
  // ("untyped function calls may not accept type arguments"). Pedir `Element` ao
  // `$` resolve e é o que a linha seguinte precisa mesmo de ser.
  const f = $<Element>('#modalRoot .modal')!.querySelector<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
  >('input:not([type=radio]):not([type=checkbox]),select,textarea,button:not(.x)');
  f?.focus();
}

export function closeModal(): void {
  $('#modalRoot')!.innerHTML = '';
  const hooks = closeHooks.splice(0, closeHooks.length);
  hooks.forEach((h) => h());
}
/** Registar um callback a correr no fecho do modal. Devolve a função que o remove. */
export const onModalClose = (h: () => void) => { closeHooks.push(h); };

export function showErr(sel: string, msg: string): void {
  const e = $(sel);
  if (e) { e.hidden = false; e.textContent = msg; }
}
/**
 * Estado "a carregar" de um botão.
 *
 * O parâmetro é `Element` e não `HTMLButtonElement` porque os chamadores fazem
 * `$('#x').querySelector('button.pri')`, cujo tipo estático é `Element | null` —
 * o compilador não sabe o que o selector devolve. Castar cada chamador resolveria
 * o mesmo problema em sete sítios; aqui assume-se uma vez, e em troca.
 *
 * O que `busy` escreve (`disabled`, `dataset`, `innerHTML`) é comum a todos os
 * controlos de formulário, portanto o cast não perde nada de útil.
 */
export function busy(btn: Element | null | undefined, on: boolean, label?: string): void {
  if (!btn) return;
  const b = btn as HTMLButtonElement;
  if (on) {
    b.dataset.label = b.innerHTML;
    b.disabled = true;
    b.innerHTML = `<span class="btn-spin" aria-hidden="true"></span><span>${esc(label || 'Aguarda…')}</span>`;
  } else {
    b.disabled = false;
    if (b.dataset.label) b.innerHTML = b.dataset.label;
  }
}

/** Animação de "porta a abrir" mostrada ao entrar na conta. É só decorativa (nunca bloqueia cliques,
 *  mesmo que algo corra mal — tem sempre um limite de tempo que garante que desaparece).
 * Uso: const openDoor = doorTransition(); <trocar o conteúdo por trás, ex. rerender()>; await openDoor();
 * Devolve uma função que, quando chamada, faz a porta abrir e remove a sobreposição. */
export function doorTransition(): () => Promise<void> {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return async () => {};
  try {
    const el = document.createElement('div');
    el.className = 'door-overlay';
    el.innerHTML = `<div class="door-leaf">${LOGO(100, 124)}</div><div class="door-label">A Porta Fechada</div>`;
    document.body.appendChild(el);
    el.offsetHeight; // força o layout antes de animar
    return () => new Promise<void>((resolve) => {
      let done = false;
      const finish = () => { if (done) return; done = true; el.remove(); resolve(); };
      setTimeout(finish, 1100); // rede de segurança: garante que nunca fica presa no ecrã
      requestAnimationFrame(() => {
        el.classList.add('open');
        el.querySelector('.door-leaf')?.classList.add('open');
      });
      el.addEventListener('transitionend', (e) => {
        if (e.target === el && e.propertyName === 'opacity') finish();
      });
    });
  } catch {
    return async () => {};
  }
}

/** Abre uma imagem em ecrã cheio, com opção de a colocar em ecrã inteiro de verdade (Fullscreen API).
 *  Só deve ser chamada com conteúdo a que o utilizador já tem acesso (nunca com pré-visualizações trancadas). */
/** Formato mínimo e máximo do visualizador: do vertical de telemóvel ao panorâmico. */
const VISOR_MIN = 9 / 16, VISOR_MAX = 16 / 9;

/**
 * Visualizador de uma foto ou vídeo (clicar numa publicação abre-o).
 *
 * No feed todas as publicações têm o mesmo enquadramento; aqui cada ficheiro
 * aparece no seu formato real, limitado entre 9:16 e 16:9. Fora desse
 * intervalo, o ficheiro aparece inteiro com barras (object-fit: contain) — nunca cortado.
 */
export function lightbox(url: string | null | undefined, tipo: 'image' | 'video' = 'image'): void {
  if (url) galeria([{ url, tipo }]);
}

export type ItemDoVisor = { url: string; tipo: 'image' | 'video' };

/**
 * O mesmo visualizador, com vários ficheiros: passa-se de um para o outro sem fechar
 * (botões, setas do teclado ou deslizar no telemóvel). Com um só ficheiro não há navegação.
 */
export function galeria(itens: ItemDoVisor[], inicio = 0): void {
  const lista = itens.filter((x) => x.url);
  if (!lista.length) return;
  let i = Math.min(Math.max(inicio, 0), lista.length - 1);
  const varios = lista.length > 1;
  const el = document.createElement('div');
  el.className = 'lbox';
  el.innerHTML =
    `<div class="lbox-frame"><span class="wm c">@aportafechada.net</span></div>` +
    (varios
      ? `<button class="lbox-nav lbox-prev" aria-label="Anterior" title="Anterior">${ic('back')}</button>` +
        `<button class="lbox-nav lbox-next" aria-label="Seguinte" title="Seguinte">${ic('back')}</button>` +
        `<span class="lbox-n" aria-live="polite"></span>`
      : '') +
    `<button class="lbox-full" aria-label="Ecrã inteiro" title="Ecrã inteiro">${ic('expand')}</button>` +
    `<button class="lbox-x" aria-label="Fechar" title="Fechar">${ic('x')}</button>`;
  document.body.appendChild(el);
  const frame = el.querySelector<HTMLElement>('.lbox-frame')!;

  // Enquadramento: formato real limitado a [9:16, 16:9], o maior que caiba em 92% do ecrã.
  let r = 1;
  const ajustar = () => {
    const w = Math.min(innerWidth * 0.92, innerHeight * 0.92 * r);
    frame.style.width = Math.round(w) + 'px';
    frame.style.height = Math.round(w / r) + 'px';
  };
  const mostrar = () => {
    const it = lista[i], video = it.tipo === 'video';
    frame.querySelector('img,video')?.remove();
    const m = document.createElement(video ? 'video' : 'img') as HTMLImageElement | HTMLVideoElement;
    if (m instanceof HTMLVideoElement) {
      m.controls = true; m.autoplay = true; m.playsInline = true; m.disablePictureInPicture = true;
      m.setAttribute('controlsList', 'nodownload noremoteplayback');
    } else { m.alt = ''; m.draggable = false; }
    m.oncontextmenu = () => false;
    r = video ? 16 / 9 : 1;
    const medir = () => {
      if (m !== frame.firstElementChild) return;   // já se passou para outro ficheiro
      const nw = m instanceof HTMLVideoElement ? m.videoWidth : m.naturalWidth;
      const nh = m instanceof HTMLVideoElement ? m.videoHeight : m.naturalHeight;
      if (nw && nh) r = Math.min(VISOR_MAX, Math.max(VISOR_MIN, nw / nh));
      ajustar();
    };
    m.addEventListener(video ? 'loadedmetadata' : 'load', medir);
    m.src = it.url;
    frame.prepend(m);
    ajustar();
    const n = el.querySelector('.lbox-n'); if (n) n.textContent = `${i + 1} / ${lista.length}`;
  };
  const ir = (passo: number) => { if (!varios) return; i = (i + passo + lista.length) % lista.length; mostrar(); };
  mostrar();
  addEventListener('resize', ajustar);

  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); removeEventListener('resize', ajustar); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') ir(1);
    else if (e.key === 'ArrowLeft') ir(-1);
  };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelector('.lbox-x')!.addEventListener('click', close);
  el.querySelector('.lbox-prev')?.addEventListener('click', () => ir(-1));
  el.querySelector('.lbox-next')?.addEventListener('click', () => ir(1));
  // Deslizar no telemóvel. Nos vídeos não: o gesto horizontal é o de avançar o vídeo.
  let tx = 0, ty = 0;
  el.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (lista[i].tipo === 'video') return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) ir(dx < 0 ? 1 : -1);
  }, { passive: true });
  el.querySelector('.lbox-full')!.addEventListener('click', () => {
    const req = frame.requestFullscreen || (frame as any).webkitRequestFullscreen;
    req?.call(frame);
  });
}

/** Mensagem de erro legível a partir de erros do Supabase ou das funções. */
export function errText(e: unknown): string {
  const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e ?? '');
  if (/Invalid login credentials/i.test(m)) return 'Email ou palavra-passe incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirma primeiro o teu email.';
  if (/User already registered/i.test(m)) return 'Já existe uma conta com este email. Entra ou recupera a palavra-passe.';
  if (/Password should be/i.test(m)) return 'A palavra-passe precisa de pelo menos 8 caracteres.';
  if (/rate limit/i.test(m)) return 'Demasiadas tentativas. Espera um minuto e tenta outra vez.';
  if (/captcha/i.test(m)) return 'A verificação de segurança falhou. Atualiza a página e tenta outra vez.';
  if (/banned/i.test(m)) return 'Esta conta está banida. Se achas que é um engano, fala connosco em Contacto.';
  if (/Token has expired|invalid.*otp/i.test(m)) return 'O código expirou ou está errado. Pede um novo.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem ligação à internet. Tenta outra vez.';
  if (/duplicate key.*handle/i.test(m)) return 'Esse nome de utilizador já existe.';
  if (/row-level security policy/i.test(m)) return 'A tua sessão pode ter expirado. Atualiza a página e tenta outra vez.';
  return m || 'Algo correu mal. Tenta outra vez.';
}

/** Campo obrigatório de um formulário ou modal.
 *  O despachante de ações em main.ts é global: um handler pode ser chamado sem a janela estar
 *  aberta (clique sintético, ou um re-render que removeu o formulário entre o mousedown e o
 *  clique). Ler `$(sel).value` diretamente daí dá um TypeError cru; isto dá uma mensagem útil.
 *  A Window de erro do main.ts mostra-a ao utilizador. */
export function field<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement = HTMLInputElement>(sel: string): T {
  const el = $(sel);
  if (!el) throw new Error('Este formulário já não está aberto. Fecha e abre outra vez.');
  return el as T;
}
/** Igual a field(), mas devolve '' em vez de rebentar quando é opcional. */
export const fieldOr = (sel: string, fallback = ''): string => ($(sel) as HTMLInputElement | null)?.value ?? fallback;

/* ---------- Ficheiros ---------- */

export type ImageKind = { type: 'image/jpeg' | 'image/png' | 'image/webp'; ext: 'jpg' | 'png' | 'webp' };

/** Confirma que o ficheiro é mesmo uma imagem pelos bytes, não pelo atributo File.type.
 *  `accept="image/*"` e um File.type inventado não chegam: um .html/.svg/.swf guardado num
 *  bucket público com esse MIME seria servido e executado na origem do Supabase. */
export async function assertImage(file: File | null | undefined, label = 'a imagem'): Promise<ImageKind> {
  if (!file) throw new Error('Escolhe um ficheiro.');
  // 20 MB: qualquer foto de telemóvel. A foto é reduzida antes de ser guardada (shrinkImage).
  if (file.size > 20e6) throw new Error(`${label.charAt(0).toUpperCase() + label.slice(1)} é demasiado grande (máx. 20 MB).`);
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const isJpeg = head[0] === 0xff && head[1] === 0xd8;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const isWebp = String.fromCharCode(...head.slice(0, 4)) === 'RIFF' && String.fromCharCode(...head.slice(8, 12)) === 'WEBP';
  if (!(isJpeg || isPng || isWebp)) {
    throw new Error(`${label.charAt(0).toUpperCase() + label.slice(1)} tem de ser JPG, PNG ou WebP.`);
  }
  return isJpeg
    ? { type: 'image/jpeg', ext: 'jpg' }
    : isPng ? { type: 'image/png', ext: 'png' }
    : { type: 'image/webp', ext: 'webp' };
}

export const safeName = (n: string | null | undefined): string =>
  String(n || 'ficheiro').normalize('NFD').replace(/[^\w.\-]+/g, '_').slice(-60);

/** Miniatura muito pequena e desfocada de uma imagem (mostrada a quem ainda não tem acesso). */
export async function blurPreview(file: File | null | undefined): Promise<Blob | null> {
  if (!file?.type?.startsWith('image/')) return null;
  const img = await createImageBitmap(file);
  const w = 32, h = Math.max(1, Math.round((img.height / img.width) * 32));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d')!; ctx.filter = 'blur(2px)'; ctx.drawImage(img, 0, 0, w, h);
  return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.6));
}

/** Redimensiona imagens grandes antes de enviar (avatares e capas). */
export async function shrinkImage(file: File, max = 1600): Promise<File> {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') return file;
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  if (k === 1 && file.size < 1.5e6) return file;
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.86));
  return new File([b as Blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

/** Deixa o utilizador arrastar e ampliar a foto antes de a guardar como perfil ou capa.
 * aspect = largura/altura do enquadramento final (1 = quadrado, 3 = capa larga).
 * shape = 'round' (perfil) ou 'rect' (capa). Devolve um File já cortado, ou null se cancelar. */
export function cropImage(file: File, aspect = 1, { shape = 'rect', output = 900 }: { shape?: string; output?: number } = {}): Promise<File | null> {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') return Promise.resolve(file);
  return new Promise(async (resolve) => {
    let img: ImageBitmap;
    try { img = await createImageBitmap(file); } catch { return resolve(file); }
    const stageW = Math.min(420, Math.round(320 * Math.max(aspect, 1)));
    const stageH = Math.round(stageW / aspect);
    const baseScale = Math.max(stageW / img.width, stageH / img.height);
    let mult = 1, offX = 0, offY = 0;
    const clamp = () => {
      const dw = img.width * baseScale * mult, dh = img.height * baseScale * mult;
      offX = Math.min(0, Math.max(stageW - dw, offX));
      offY = Math.min(0, Math.max(stageH - dh, offY));
    };
    const center = () => {
      const dw = img.width * baseScale * mult, dh = img.height * baseScale * mult;
      offX = Math.min(0, Math.max(stageW - dw, (stageW - dw) / 2));
      offY = Math.min(0, Math.max(stageH - dh, (stageH - dh) / 2));
    };
    center();
    modal(
      `<h3>Ajustar imagem</h3><p class="muted small">Arrasta para posicionar e usa a barra para aproximar.</p>
       <div style="display:flex;justify-content:center;padding:6px 0">
        <canvas id="cropStage" width="${stageW}" height="${stageH}" style="touch-action:none;cursor:grab;border-radius:${shape === 'round' ? '50%' : '14px'};background:#000;max-width:100%"></canvas>
       </div>
       <div class="field"><label for="cropZoom">Zoom</label><input id="cropZoom" type="range" min="100" max="300" value="100"></div>
       <div class="row" style="gap:10px;justify-content:flex-end">
        <button class="btn out" id="cropCancel" type="button">Cancelar</button>
        <button class="btn pri" id="cropOk" type="button">Usar esta imagem</button>
       </div>`,
      { noClose: true },
    );
    const cv = $<HTMLCanvasElement>('#cropStage')!;
    const ctx = cv.getContext('2d')!;
    const draw = () => {
      ctx.clearRect(0, 0, stageW, stageH);
      const dw = img.width * baseScale * mult, dh = img.height * baseScale * mult;
      ctx.drawImage(img, offX, offY, dw, dh);
    };
    draw();
    let dragging = false, sx = 0, sy = 0, ox0 = 0, oy0 = 0;
    cv.addEventListener('pointerdown', (e) => {
      dragging = true; sx = e.clientX; sy = e.clientY; ox0 = offX; oy0 = offY;
      cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing';
    });
    cv.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      offX = ox0 + (e.clientX - sx); offY = oy0 + (e.clientY - sy);
      clamp(); draw();
    });
    const stop = () => { dragging = false; cv.style.cursor = 'grab'; };
    cv.addEventListener('pointerup', stop);
    cv.addEventListener('pointercancel', stop);
    $<HTMLInputElement>('#cropZoom')!.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      const dw0 = img.width * baseScale * mult, dh0 = img.height * baseScale * mult;
      const cx = offX - dw0 / 2 + stageW / 2, cy = offY - dh0 / 2 + stageH / 2; // guarda o centro relativo
      mult = Number(t.value) / 100;
      const dw1 = img.width * baseScale * mult, dh1 = img.height * baseScale * mult;
      offX = cx + dw1 / 2 - stageW / 2; offY = cy + dh1 / 2 - stageH / 2;
      clamp(); draw();
    });
    // Primeiro entrega o resultado, só depois fecha: `closeModal` dispara o gancho de
    // fecho abaixo (`resolve(null)`), e uma Promise fica com o primeiro valor que recebe.
    // Na ordem inversa a imagem escolhida era sempre trocada por «cancelado» e nada era enviado.
    const finish = (result: File | null) => { resolve(result); closeModal(); };
    onModalClose(() => resolve(null));
    $<HTMLButtonElement>('#cropCancel')!.addEventListener('click', () => finish(null));
    $<HTMLButtonElement>('#cropOk')!.addEventListener('click', () => {
      const outW = output, outH = Math.round(output / aspect);
      const dw = img.width * baseScale * mult, dh = img.height * baseScale * mult;
      const sxImg = -offX / (dw / img.width), syImg = -offY / (dh / img.height);
      const swImg = stageW / (dw / img.width), shImg = stageH / (dh / img.height);
      const c = document.createElement('canvas'); c.width = outW; c.height = outH;
      c.getContext('2d')!.drawImage(img, sxImg, syImg, swImg, shImg, 0, 0, outW, outH);
      c.toBlob((b) => finish(new File([b!], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.88);
    });
  });
}

export function loadScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src === src)) return res();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error('Não foi possível carregar ' + src));
    document.head.appendChild(s);
  });
}

export async function copyText(t: string): Promise<void> {
  try { await navigator.clipboard.writeText(t); toast('Copiado'); }
  catch { toast('Copia manualmente: ' + t); }
}

/* ---------- Navegação ---------- */

/** Volta a desenhar a página atual (keep = manter a posição do scroll). */
export const rerender = (keep = true): void => {
  document.dispatchEvent(new CustomEvent('apf:render', { detail: { keep } }));
};
/** Navegar para uma rota: o endereço passa a ser o caminho real (`/perfil/x`), sem recarregar. */
export const go = (r: string): void => {
  const c = caminhoDe(r);
  if (location.pathname === c) { rerender(false); return; }
  history.pushState(null, '', c);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

/* ---------- Acesso a dados (legado) ----------
 * Reexportado para as áreas da interface que ainda chamam o Supabase
 * directamente. As áreas migradas (administração, pagamentos) passam pela
 * camada de aplicação (src/application) e não usam nada disto.
 * `npm run check:arch` conta quantas chamadas directas ainda restam. */
export { sb } from '../infrastructure/supabase/client';
export { fn, accessToken } from '../infrastructure/supabase/functions';
export { signedUrls, clearUrlCache, upload, publicUrl } from '../infrastructure/supabase/storage';
