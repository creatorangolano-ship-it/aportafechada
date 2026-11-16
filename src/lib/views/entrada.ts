/**
 * A página de entrada (moldura) e o formulário de registo, como texto HTML puro.
 *
 * O servidor desenha `/registar` com isto antes de o JavaScript chegar (quem vem de um
 * anúncio, em rede móvel, vê o formulário logo), e o browser usa as mesmas funções em
 * `public.ts`. Por isso este ficheiro não pode importar nada que toque no DOM ou no Supabase.
 *
 * `onsubmit="return false"`: se a pessoa carregar em «Criar conta» antes de a app arrancar,
 * o browser não envia o formulário sozinho (iria parar ao endereço, com a palavra-passe).
 * Depois de a app arrancar, o tratamento normal do formulário corre na mesma.
 */
import { esc, ic, GOOGLE, LOGO } from '../marcacao';
import { COUNTRIES } from '../config';
import type { RegData } from '../state';

/** Frase da prova social, por baixo do «Entrar» (as fotos chegam depois, do Supabase). */
export const CONVITE = 'Descobre o que está por trás da Porta Fechada';

/** Página de entrada (/). A prova social já ocupa o seu lugar, para nada saltar quando as fotos chegam. */
export function inicioHtml(): string {
  return authShell(`<h1 class="sr-only">Entrar na A Porta Fechada</h1><form id="loginForm" class="stack" style="gap:12px" novalidate onsubmit="return false">
     <input class="linp" id="lEmail" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Email ou nome de utilizador" aria-label="Email ou nome de utilizador">
     ${pwField('lPass', 'Palavra-passe', 'current-password')}
     <button type="button" class="btn link small" style="align-self:flex-start" data-act="forgot">Esqueceu a palavra-passe?</button>
     <span class="err" id="lErr" hidden></span>
     <button class="btn pri block lg" style="margin-top:6px">Entrar</button>
    </form>
    <div class="provasocial" id="provaSocial"><span>${CONVITE}</span></div>
    <div class="or" style="margin:4px 0">ou</div>
    <button class="gbtn" data-act="google">${GOOGLE}Entrar com Google</button>`,
  `<a class="lcard lnew" href="#registar">Não tem uma conta? <b>Criar conta</b></a>`);
}

export function authShell(card: string, second: string): string {
  return `<section class="home">
   <div class="blob-wrap" aria-hidden="true"><div class="blob"></div></div>
   <div class="home-side">
    <div class="lcard">
     <div class="lbrand">${LOGO(34, 42)}<span>A Porta Fechada</span></div>
     <p class="ltag">Os teus criadores favoritos, os conteúdos que só partilham contigo.</p>
     ${card}
    </div>
    ${second}
   </div></section>`;
}
export const pwField = (id: string, ph: string, ac: string): string => `<div class="pw"><input class="linp" id="${id}" type="password" autocomplete="${ac}" placeholder="${ph}" aria-label="${ph}"><button type="button" class="eye" data-act="eye" data-for="${id}" aria-label="Mostrar palavra-passe">${ic('eye')}</button></div>`;

/** Formulário de registo, com os valores já escritos (se houver). */
export function registoHtml(d: Partial<RegData>): string {
  return authShell(`<h1 class="sr-only">Criar conta na A Porta Fechada</h1><form id="signupForm" class="stack" style="gap:12px" novalidate onsubmit="return false">
     <input class="linp" id="rName" autocomplete="name" placeholder="Nome" aria-label="Nome" value="${esc(d.name || '')}">
     <input class="linp" id="rEmail" type="email" autocomplete="email" placeholder="Email válido" aria-label="Email" value="${esc(d.email || '')}">
     <select class="linp" id="rCountry" aria-label="País">${COUNTRIES.map((c) => `<option ${(d.country || 'Angola') === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
     ${pwField('rPass', 'Palavra-passe', 'new-password')}
     <p class="small muted" style="line-height:1.6">Ao clicar em “Criar conta”, confirmas que tens 18 anos ou mais e aceitas os <a href="#termos">Termos e condições</a> e a <a href="#privacidade">Política de privacidade</a>.</p>
     <span class="err" id="rErr" hidden></span>
     <button class="btn pri block lg">Criar conta</button>
    </form>
    <div class="or" style="margin:4px 0">ou</div>
    <button class="gbtn" data-act="google">${GOOGLE}Criar conta com Google</button>`,
  `<a class="lcard lnew" href="#inicio">Já tem uma conta? <b>Entrar</b></a>`);
}
