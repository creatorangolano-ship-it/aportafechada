/**
 * CAPTCHA invisível (Cloudflare Turnstile) para entrar, criar conta, recuperar a
 * palavra-passe e reenviar o código. Trava robôs que tentam adivinhar palavras-passe
 * ou criar contas em massa, sem pedir nada a quem é pessoa: o desafio só aparece
 * quando a Cloudflare desconfia.
 *
 * A chave do site é pública (vai para o browser de qualquer maneira). A chave secreta
 * fica só no Supabase (Authentication → Attack Protection), que valida o token.
 * Sem chave do site, `captcha()` devolve `undefined` e tudo funciona como antes.
 *
 * Cada token só serve uma vez, por isso cada pedido gera o seu.
 */
import { TURNSTILE_SITE_KEY } from './config';

type Turnstile = {
  render: (el: HTMLElement, o: Record<string, unknown>) => string;
  execute: (id: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let carregar: Promise<Turnstile> | null = null;

function script(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!carregar) {
    carregar = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = SCRIPT; s.async = true;
      s.onload = () => (window.turnstile ? ok(window.turnstile) : falha(new Error('captcha')));
      s.onerror = () => { carregar = null; falha(new Error('Não foi possível carregar a verificação de segurança. Confirma a ligação à internet e tenta outra vez.')); };
      document.head.appendChild(s);
    });
  }
  return carregar;
}

/** Token para mandar ao Supabase em `captchaToken`, ou `undefined` se o CAPTCHA estiver desligado. */
export async function captcha(): Promise<string | undefined> {
  if (!TURNSTILE_SITE_KEY) return undefined;
  const ts = await script();
  const caixa = document.createElement('div');
  caixa.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999';
  document.body.appendChild(caixa);
  let id = '';
  try {
    return await new Promise<string>((ok, falha) => {
      id = ts.render(caixa, {
        sitekey: TURNSTILE_SITE_KEY,
        execution: 'execute',
        appearance: 'interaction-only',
        language: 'pt',
        callback: (t: string) => ok(t),
        'error-callback': () => falha(new Error('A verificação de segurança falhou. Tenta outra vez.')),
        'expired-callback': () => falha(new Error('A verificação de segurança expirou. Tenta outra vez.')),
        'timeout-callback': () => falha(new Error('A verificação de segurança demorou demasiado. Tenta outra vez.')),
      });
      ts.execute(id);
    });
  } finally {
    if (id) ts.remove(id);
    caixa.remove();
  }
}
