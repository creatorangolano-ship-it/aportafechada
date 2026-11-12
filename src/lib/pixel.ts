/**
 * Pixel da Meta (Facebook/Instagram) para medir os anúncios.
 *
 * Mede só o necessário para os anúncios aprenderem quem se regista:
 * - PageView em cada página (menos a consola de administração);
 * - Lead quando alguém cria conta (antes de confirmar o email);
 * - CompleteRegistration quando a conta fica pronta (perfil completo);
 * - SubmitApplication quando um criador envia o pedido de verificação.
 *
 * Não envia emails, nomes nem nada que identifique a pessoa. Só corre em
 * aportafechada.net (nunca em localhost nem nas pré-visualizações).
 */
import { META_PIXEL_ID } from './config';

type Fbq = ((...a: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[]; push: unknown; loaded: boolean; version: string };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

let iniciado = false;
const ativo = (): boolean => typeof window !== 'undefined' && !!META_PIXEL_ID && /(^|\.)aportafechada\.net$/.test(location.hostname);

function iniciar(): boolean {
  if (iniciado) return true;
  if (!ativo()) return false;
  // Código oficial da Meta, escrito por extenso.
  const f = function (...a: unknown[]) { if (f.callMethod) f.callMethod(...a); else f.queue.push(a); } as Fbq;
  f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
  window.fbq = f; window._fbq = f;
  const s = document.createElement('script');
  s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  f('init', META_PIXEL_ID);
  iniciado = true;
  return true;
}

let ultimaPagina = '';
/** Em cada mudança de página. A consola de administração não é medida. */
export function pixelPagina(rota: string): void {
  if (rota === 'admin' || !iniciar()) return;
  const aqui = location.pathname + location.search;
  if (aqui === ultimaPagina) return;
  ultimaPagina = aqui;
  window.fbq!('track', 'PageView');
}

type Evento = 'Lead' | 'CompleteRegistration' | 'SubmitApplication';
export function pixelEvento(ev: Evento, dados?: Record<string, string | number>): void {
  if (!iniciar()) return;
  try { window.fbq!('track', ev, dados || {}); } catch { /* nunca estraga o registo */ }
}
