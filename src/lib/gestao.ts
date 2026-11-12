/**
 * App de gestão: a consola de administração instalada no telemóvel como uma app à
 * parte («A Porta Fechada · Gestão»), com ícone próprio e sem barra do navegador.
 *
 * - Manifest próprio (public/gestao/manifest.webmanifest), ligado só na rota /admin.
 *   Quem instala a partir de /admin fica com a app de gestão; no resto do site
 *   instala-se a app normal.
 * - A app abre em /admin?app=gestao. Esse sinal fica no sessionStorage, por isso só
 *   vale para a janela da app, não para o navegador.
 * - Na app, a sessão fecha-se sozinha ao fim de 15 minutos sem uso: um telemóvel
 *   perdido não fica com a administração aberta.
 */
import { sb, toast, modal } from './lib';
import { S } from './state';

const MANIFEST_SITE = '/manifest.webmanifest';
const MANIFEST_GESTAO = '/gestao/manifest.webmanifest';
const COR_SITE = '#D0103C';
const COR_GESTAO = '#141012';
const INACTIVIDADE_MS = 15 * 60 * 1000;
const CHAVE = 'apf-app';

type PedidoInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let pedido: PedidoInstalacao | null = null;

if (typeof window !== 'undefined') {
  // O Chrome avisa quando a app pode ser instalada; guarda-se o aviso para o botão «Instalar».
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedido = e as PedidoInstalacao; });
  window.addEventListener('appinstalled', () => { pedido = null; toast('App instalada. Já a encontras no ecrã principal.'); });
}

const ecraInteiro = (): boolean =>
  typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

/** Esta janela é a app de gestão instalada? */
export function emGestao(): boolean {
  try { return sessionStorage.getItem(CHAVE) === 'gestao'; } catch { return false; }
}

/** No arranque: reconhece a app de gestão (?app=gestao) e a aba pedida pelos atalhos do ícone. */
export function iniciarGestao(): void {
  const u = new URL(location.href);
  if (u.searchParams.get('app') !== 'gestao') return;
  try { sessionStorage.setItem(CHAVE, 'gestao'); } catch { /* modo privado */ }
  const aba = u.searchParams.get('aba');
  if (aba) S.adTab = aba;
  u.searchParams.delete('app'); u.searchParams.delete('aba');
  history.replaceState(null, '', u.pathname + (u.search || '') + location.hash);
  vigiarInactividade();
}

/** Em cada página: na consola, o manifest e a cor passam a ser os da app de gestão. */
export function manifestPara(rota: string): void {
  const gestao = rota === 'admin' || emGestao();
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  const alvo = gestao ? MANIFEST_GESTAO : MANIFEST_SITE;
  if (link && link.getAttribute('href') !== alvo) link.setAttribute('href', alvo);
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => { m.content = gestao ? COR_GESTAO : COR_SITE; });
}

/** O botão «Instalar app de gestão» só aparece fora da app já instalada. */
export const podeInstalar = (): boolean => !ecraInteiro();

export async function instalarGestao(): Promise<void> {
  if (pedido) {
    const p = pedido; pedido = null;
    await p.prompt();
    return;
  }
  const iphone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  modal(`<h3>Instalar a app de gestão</h3>
   <p class="muted small">Fica no ecrã principal com o ícone escuro da porta e abre directamente na administração, sem a barra do navegador.</p>
   <div class="stack" style="gap:10px">
    ${iphone ? '' : `<div class="aside"><span><b>Android (Chrome):</b> com esta página aberta, toca no menu ⋮ e depois em «Instalar app» ou «Adicionar ao ecrã principal».</span></div>`}
    <div class="aside"><span><b>iPhone (Safari):</b> com esta página aberta, toca em Partilhar e depois em «Adicionar ao ecrã principal».</span></div>
   </div>
   <p class="small muted">Por segurança, a app fecha a sessão sozinha ao fim de 15 minutos sem uso.</p>
   <button class="btn pri block" data-act="closeModal">Percebi</button>`);
}

/** Na app de gestão, fecha a sessão ao fim de 15 minutos sem toques nem teclas. */
let vigiar = false;
function vigiarInactividade(): void {
  if (vigiar) return;
  vigiar = true;
  let ultimo = Date.now();
  const mexeu = () => { ultimo = Date.now(); };
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) => window.addEventListener(ev, mexeu, { passive: true }));
  const verificar = async () => {
    if (!S.me || Date.now() - ultimo < INACTIVIDADE_MS) return;
    ultimo = Date.now();
    await sb.auth.signOut();
    toast('Sessão fechada por inactividade. Entra outra vez para continuar.');
  };
  // Ao voltar à app (estava em segundo plano) e de 30 em 30 segundos.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void verificar(); });
  setInterval(() => { void verificar(); }, 30_000);
}
