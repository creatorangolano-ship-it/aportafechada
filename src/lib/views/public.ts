// Páginas públicas: entrar, criar conta, etapas de registo, páginas de informação
import { sb, $, $$, esc, kz, dots, ic, GOOGLE, LOGO, avatarOf, toast, modal, closeModal, showErr, busy, errText, fn, isEmail, upload, safeName, rerender, go, shrinkImage } from '../lib';
import { register } from '../registry';
import { INFO } from '../rotas';
import { S, loadMe, netPct, isStaff } from '../state';
import type { RegData } from '../state';
import { CATS, CITIES, BANKS, COUNTRIES } from '../config';
import { captcha } from '../captcha';
import { pixelEvento } from '../pixel';
import { authShell, pwField, registoHtml, inicioHtml, CONVITE } from './entrada';
import { infoHtml } from './info';

import type { FormControl } from '../types';


/* A identidade legal da empresa (COMPANY) e o texto destas páginas vivem em `info.ts`. */

/* A moldura da página inicial e o formulário de registo vivem em `entrada.ts` (o servidor também os desenha). */

/* ---------- Perfil público (sem sessão) ----------
   O que vê quem abre /perfil/<nome> sem conta: o Google, quem recebe o link no
   WhatsApp, um visitante novo. Só a montra do criador (vinda de `perfil_publico`,
   que devolve apenas campos públicos de criadores aprovados); os conteúdos ficam
   atrás da conta. Perfis de fãs não têm versão pública. */
export async function vPerfilPublico(handle: string): Promise<string> {
  const { data } = await sb.rpc('perfil_publico', { p_handle: handle });
  const c = (data as any[] | null)?.[0];
  if (!c) return `<div class="empty"><h1 style="font-size:24px">Perfil só para membros</h1><p style="margin-top:8px">Entra ou cria conta para veres este perfil.</p>
    <div class="row" style="gap:10px;justify-content:center;margin-top:16px"><a class="btn pri" href="#registar">Criar conta</a><a class="btn out" href="#inicio">Entrar</a></div></div>`;
  const nome = c.name || c.handle;
  const capa = c.cover_url ? `background-image:url('${String(c.cover_url).replace(/["'\\()<>]/g, encodeURIComponent)}')` : '';
  const preco = c.price ? `Subscrição de ${kz(c.price)} por mês` : 'Perfil gratuito · segue para ver';
  return `<div class="cover" style="${capa}"></div>
   <section class="phead">${c.avatar_url ? `<div class="big"><img src="${esc(c.avatar_url)}" alt="${esc(nome)}"></div>` : `<div class="big">${esc(nome[0].toUpperCase())}</div>`}
    <div class="info"><h1 style="display:flex;align-items:center;gap:8px">${esc(nome)}<span style="color:var(--acc);display:inline-flex" title="Identidade verificada">${ic('badge', 'style="width:22px;height:22px"')}</span></h1>
     <div class="muted">@${esc(c.handle)}</div>
     ${c.bio ? `<p style="margin-top:10px;max-width:62ch;white-space:pre-line">${esc(c.bio)}</p>` : ''}
     <div class="meta">${c.city ? `<span>${ic('pin')}${esc(c.city)}, Angola</span>` : ''}${c.category ? `<span>${esc(c.category)}</span>` : ''}</div>
     <div class="stats3"><div><b>${dots(c.post_count)}</b><span class="small muted">publicações</span></div><div><b>${dots(c.follower_count)}</b><span class="small muted">seguidores</span></div></div>
    </div>
    <div class="acts"><span class="tag plain" style="justify-content:center;padding:10px">${preco}</span>
     <a class="btn pri" href="#registar">Criar conta para ver</a><a class="btn out" href="#inicio">Já tenho conta · Entrar</a></div></section>
   <div class="box pad" style="margin-top:18px;text-align:center"><h2 style="font-size:19px">Os conteúdos de ${esc(nome)} estão atrás da porta</h2>
    <p class="muted" style="margin-top:6px">Cria conta grátis para seguir, subscrever e ver as publicações, as mensagens e as lives. Só para maiores de 18.</p></div>`;
}

/* ---------- Convite na página de entrada ----------
   Três fotos de criadores (função `contagem_publica`) e uma frase de convite.
   O número de membros deixou de aparecer, a pedido do dono. Preenche-se depois
   de a página aparecer, para não atrasar o formulário de entrada. */
let provaSocial: Promise<string> | null = null;
function htmlProvaSocial(): Promise<string> {
  provaSocial ??= Promise.resolve(sb.rpc('contagem_publica')).then(({ data }) => {
    const d = (data as Array<{ fotos: string[] | null }> | null)?.[0];
    const fotos = (d?.fotos || []).map((u) => `<img src="${esc(u)}" alt="" width="26" height="26" decoding="async">`).join('');
    return `${fotos ? `<span class="fotos">${fotos}</span>` : ''}<span>${CONVITE}</span>`;
  }).catch(() => `<span>${CONVITE}</span>`);
  return provaSocial;
}
export function preencherProvaSocial(): void {
  void htmlProvaSocial().then((h) => {
    const el = $('#provaSocial'); if (el && h) el.innerHTML = h;
  });
}

export function vInicio() {
  preencherProvaSocial();
  return inicioHtml();
}

export function vSignup() {
  return registoHtml(S.reg?.data ?? {});
}

export function vConfirmEmail() {
  const email = S.reg?.data?.email || '';
  return `<div class="auth single"><form id="codeForm" class="formcard" novalidate>
    <div class="hd"><h1>Confirma o teu email</h1><p>Enviámos um código de 6 dígitos para <b style="color:var(--ink)">${esc(email)}</b>.</p></div>
    <div class="code" role="group" aria-label="Código de confirmação">${[0, 1, 2, 3, 4, 5].map((i) => `<input inputmode="numeric" pattern="[0-9]*" ${i === 0 ? 'autocomplete="one-time-code"' : 'autocomplete="off"'} class="cd" id="cd${i}" aria-label="Dígito ${i + 1}">`).join('')}</div>
    <p class="small muted">Não chegou? Vê a pasta de spam ou <button type="button" class="btn link small" data-act="resend">envia outro código</button>.</p>
    <span class="err" id="cErr" hidden></span>
    <div class="actions"><a class="btn out" href="#registar">Voltar</a><button class="btn pri">Confirmar</button></div>
  </form></div>`;
}

export function vNovaSenha() {
  return `<div class="auth single"><form id="newPassForm" class="formcard" novalidate>
    <div class="hd"><h1>Nova palavra-passe</h1><p>Escolhe uma palavra-passe com pelo menos 8 caracteres, com letras e números.</p></div>
    <div class="field"><label for="np1">Nova palavra-passe</label><input id="np1" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="np2">Repetir</label><input id="np2" type="password" autocomplete="new-password"></div>
    <span class="err" id="npErr" hidden></span>
    <button class="btn pri lg">Guardar e entrar</button></form></div>`;
}

/* ---------- Etapas depois de criar conta ---------- */
const STEP: Record<string, { t: string; d: string }> = {
  perfil: { t: 'Perfil', d: 'Utilizador e data de nascimento' },
  tipo: { t: 'Tipo de conta', d: 'Fã ou criador' },
  interesses: { t: 'Interesses', d: 'O que queres ver' },
  criador: { t: 'Perfil de criador', d: 'Categoria e preço' },
  identidade: { t: 'Identidade', d: 'Documento e selfie' },
  banco: { t: 'Pagamentos', d: 'Conta para receber' },
};
export function startOnboarding(upgrade = false, appeal = null) {
  const c = S.creator;
  S.reg = { i: appeal ? 1 : 0, upgrade, appeal, files: {}, data: { tipo: upgrade ? 'criador' : 'fa', interests: [], name: S.me?.name || '', handle: S.me?.handle || '', ...(c ? { cat: c.category ?? undefined, bio: c.bio ?? undefined, city: c.city ?? undefined, price: c.price || 2500, pmode: c.price ? 'paid' : 'free' } : {}) } };
}
function flow() {
  const r = S.reg!;
  if (r.upgrade) return ['criador', 'identidade', 'banco'];
  return ['perfil', 'tipo', ...(r.data.tipo === 'criador' ? ['criador', 'identidade', 'banco'] : ['interesses'])];
}
export function vOnboarding() {
  if (!S.reg) startOnboarding(S.me?.onboarded);
  const r = S.reg!, d = r.data, fl = flow(), id = fl[r.i];
  const rail = `<aside class="rail" aria-label="Etapas"><ol>${fl.map((k, i) => `<li class="${i === r.i ? 'on' : i < r.i ? 'done' : ''}"><i>${i < r.i ? '✓' : i + 1}</i><span>${STEP[k].t}<small>${STEP[k].d}</small></span></li>`).join('')}</ol></aside>`;
  const m = `<div class="mstep"><span class="small muted">Passo ${r.i + 1} de ${fl.length}</span><div class="bar"><i style="width:${(r.i + 1) / fl.length * 100}%"></i></div></div>`;
  let b = '';
  if (id === 'perfil') b = `<div class="hd"><h1>Completa o teu perfil</h1><p>O nome de utilizador aparece nos comentários e nas mensagens.</p></div>
    <div class="grid2"><div class="field"><label for="oName">Nome</label><input id="oName" autocomplete="name" value="${esc(d.name)}"></div>
    <div class="field"><label for="oHandle">Nome de utilizador</label><input id="oHandle" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(d.handle)}" placeholder="ex.: anacristina"></div></div>
    <div class="field"><label for="oBirth">Data de nascimento</label><input id="oBirth" type="date" max="${new Date(Date.now() - 18 * 365.25 * 864e5).toISOString().slice(0, 10)}" value="${esc(d.birth || '')}"><span class="hint">Não aparece no perfil. Serve só para confirmar que tens 18 anos ou mais.</span></div>`;
  else if (id === 'tipo') b = `<div class="hd"><h1>Como vais usar a plataforma?</h1><p>Podes tornar-te criador mais tarde, nas definições da conta.</p></div>
    <div class="choice" role="radiogroup">
     <label class="opt"><input type="radio" name="tipo" value="fa" ${d.tipo !== 'criador' ? 'checked' : ''}>${ic('heart', 'style="width:22px;height:22px;color:var(--acc)"')}<b>Quero acompanhar criadores</b><span>Subscrever, comprar conteúdos, enviar mensagens e gorjetas.</span></label>
     <label class="opt"><input type="radio" name="tipo" value="criador" ${d.tipo === 'criador' ? 'checked' : ''}>${ic('star', 'style="width:22px;height:22px;color:var(--acc)"')}<b>Quero ser criador</b><span>Publicar e ganhar dinheiro. Pede verificação de identidade.</span></label>
    </div>`;
  else if (id === 'interesses') b = `<div class="hd"><h1>O que gostas de ver?</h1><p>Escolhe pelo menos um tema. Usamos isto para te sugerir criadores.</p></div>
    <div class="interests">${CATS.map((c) => `<label><input type="checkbox" class="int" value="${c}" ${d.interests.includes(c) ? 'checked' : ''}><span>${c}</span></label>`).join('')}</div>`;
  else if (id === 'criador') b = `<div class="hd"><h1>O teu perfil de criador</h1><p>Podes mudar tudo isto mais tarde no teu estúdio.</p></div>
    <div class="grid2"><div class="field"><label for="oCat">Categoria principal</label><select id="oCat">${CATS.map((c) => `<option ${d.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    <div class="field"><label for="oCity">Cidade</label><select id="oCity">${CITIES.map((c) => `<option ${d.city === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
    <div class="field"><span class="flabel">Como queres cobrar?</span><div class="opts">
     <label class="opt"><input type="radio" name="pmode" value="free" ${d.pmode === 'free' ? 'checked' : ''}><span><b>Perfil gratuito</b><span>Quem te segue vê o conteúdo para seguidores. Podes vender publicações à parte e receber gorjetas.</span></span></label>
     <label class="opt"><input type="radio" name="pmode" value="paid" ${d.pmode !== 'free' ? 'checked' : ''}><span><b>Subscrição paga</b><span>Os fãs pagam por mês para ver o conteúdo exclusivo.</span></span></label></div>
     <span class="hint">Podes mudar quando quiseres no estúdio.</span></div>
    <div class="field" id="oPriceRow" ${d.pmode === 'free' ? 'hidden' : ''} style="max-width:320px"><label for="oPrice">Preço da subscrição (Kz por mês)</label><input id="oPrice" type="number" min="${S.cfg.min_price}" step="100" value="${esc(d.price ?? 2500)}"><span class="hint">Mínimo ${kz(S.cfg.min_price)}. Recebes 90% no primeiro mês, 85% no segundo e ${netPct()}% depois.</span></div>
    <div class="field"><label for="oBio">Apresentação</label><textarea id="oBio" maxlength="500" placeholder="Em duas ou três frases, o que vão encontrar no teu perfil.">${esc(d.bio || '')}</textarea></div>`;
  else if (id === 'identidade') {
    const f = r.files;
    const drop = (k: any, l: any, hint: any, icn: any) => `<label class="drop ${f[k] ? 'has' : ''}">${ic(f[k] ? 'check' : icn, 'style="width:24px;height:24px"')}<b style="color:var(--ink)">${l}</b><span class="small muted">${f[k] ? esc(f[k].name) : hint}</span><input type="file" accept="image/*" class="kycfile" data-k="${k}" aria-label="${l}"></label>`;
    b = `<div class="hd"><h1>Confirma a tua identidade</h1><p>Verificamos todos os criadores antes de poderem receber pagamentos. Só a equipa de verificação vê estes ficheiros.</p></div>
    <div class="grid2">${drop('front', 'Frente do BI ou passaporte', 'JPG ou PNG, legível', 'upload')}${drop('back', 'Verso do BI', 'JPG ou PNG, legível', 'upload')}</div>
    ${drop('selfie', 'Selfie a segurar o documento', 'A cara e o documento têm de estar visíveis', 'user')}
    <div class="aside">${ic('shield')}<span>Todas as pessoas que aparecem nos teus conteúdos têm de ter 18 anos ou mais e dar consentimento.</span></div>`;
  } else if (id === 'banco') b = `<div class="hd"><h1>Onde queres receber</h1><p>O titular da conta tem de ser a pessoa do documento.</p></div>
    <div class="grid2"><div class="field"><label for="oBank">Banco</label><select id="oBank">${BANKS.map((x) => `<option ${d.bank === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label for="oHolder">Titular da conta</label><input id="oHolder" value="${esc(d.holder || d.name || S.me?.name || '')}"></div></div>
    <div class="field"><label for="oIban">IBAN</label><div class="iban"><span class="iban-pre" aria-hidden="true">AO06</span><input id="oIban" value="${esc((d.iban || '').replace(/^AO06/, '').replace(/(\d{4})(?=\d)/g, '$1 '))}" placeholder="0000 0000 0000 0000 0000 0" autocomplete="off" spellcheck="false" inputmode="numeric" maxlength="40" aria-describedby="oIbanH"></div><span class="hint" id="oIbanH">O AO06 já está escrito: põe só os 21 dígitos que vêm a seguir.</span></div>
    <label class="check"><input type="checkbox" id="oTerms" ${d.cterms ? 'checked' : ''}><span>Li e aceito os <a href="#regras">termos para criadores</a> e confirmo que tenho os direitos de tudo o que publicar.</span></label>
    <div class="progress" id="upProg" hidden><i style="width:0"></i></div>`;
  const last = r.i === fl.length - 1;
  return `<div class="auth">${rail}<form id="obForm" class="formcard" novalidate>${m}${b}<span class="err" id="oErr" hidden></span>
   <div class="actions">${r.i > 0 ? '<button type="button" class="btn out" data-act="obBack">Voltar</button>' : (r.upgrade ? '<a class="btn out" href="#conta">Cancelar</a>' : '<button type="button" class="btn link" data-act="logout">Sair</button>')}
   <button class="btn pri" id="obBtn">${last ? (d.tipo === 'criador' || r.upgrade ? 'Enviar para verificação' : 'Concluir') : 'Continuar'}</button></div></form></div>`;
}
/** «ao06.0040-0000…», «AO06 0040 …» ou só os 21 dígitos ficam todos «AO06…» (25 caracteres). */
function normalizarIban(v: string): string {
  const x = v.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^AO06/, '');
  return 'AO06' + x;
}
function readOb() {
  const d = S.reg!.data as Record<string, any>, v = (id: any) => { const e = $('#' + id); return e ? e.value.trim() : undefined; };
  const map: Record<string, string> = { oName: 'name', oHandle: 'handle', oBirth: 'birth', oCat: 'cat', oPrice: 'price', oBio: 'bio', oCity: 'city', oBank: 'bank', oHolder: 'holder', oIban: 'iban' };
  for (const k in map) { const x = v(k); if (x !== undefined) d[map[k]] = x; }
  if (d.iban) d.iban = normalizarIban(d.iban);
  const t = $('#oTerms'); if (t) d.cterms = t.checked;
  const tp = $('input[name=tipo]:checked'); if (tp) d.tipo = tp.value;
  const pm = $('input[name=pmode]:checked'); if (pm) d.pmode = pm.value;
  const ints = $$('.int'); if (ints.length) d.interests = ints.filter((i) => i.checked).map((i) => i.value);
}
function validOb(id: any) {
  const d = S.reg!.data;
  if (id === 'perfil') {
    if (!d.name || d.name.length < 2) return 'Escreve o teu nome.';
    if (!/^[a-z0-9._]{3,20}$/i.test(d.handle || '')) return 'O nome de utilizador tem 3 a 20 caracteres: letras, números, ponto ou traço baixo.';
    if (!d.birth) return 'Indica a data de nascimento.';
    if ((Date.now() - new Date(d.birth!).getTime()) / 31557600000 < 18) return 'A Porta Fechada só está disponível para maiores de 18 anos.';
  }
  if (id === 'interesses' && !d.interests.length) return 'Escolhe pelo menos um tema.';
  if (id === 'criador') {
    if (d.pmode !== 'free' && !(Number(d.price) >= S.cfg.min_price)) return `O preço mínimo é ${kz(S.cfg.min_price)}. Se não quiseres cobrar, escolhe Perfil gratuito.`;
    if (!d.bio || d.bio.length < 20) return 'Escreve uma apresentação com pelo menos 20 caracteres.';
  }
  if (id === 'identidade' && (!S.reg!.files.front || !S.reg!.files.back || !S.reg!.files.selfie)) return 'Envia a frente e o verso do documento e a selfie.';
  if (id === 'banco') {
    if (!/^AO06\d{21}$/.test(d.iban || '')) return `O IBAN tem 21 dígitos depois do AO06 (escreveste ${(d.iban || '').replace(/^AO06/, '').replace(/\D/g, '').length}).`;
    if (!d.holder) return 'Indica o titular da conta.';
    if (!d.cterms) return 'Aceita os termos para criadores para continuar.';
  }
  return null;
}
async function finishOb(btn: any) {
  const r = S.reg!, d = r.data;
  busy(btn, true, 'A guardar…');
  try {
    if (!r.upgrade) {
      let ref = null; try { ref = localStorage.getItem('apf-ref'); } catch { /* */ }
      const { error } = await sb.rpc('complete_profile', { p_handle: d.handle, p_name: d.name, p_birthdate: d.birth, p_interests: d.interests, p_country: S.me?.country || 'Angola', p_ref: ref });
      if (error) throw error;
      pixelEvento('CompleteRegistration', { content_name: d.tipo === 'criador' ? 'criador' : 'fa' });
    }
    if (d.tipo === 'criador' || r.upgrade) {
      const uid = S.session!.user.id, prog = $('#upProg'); if (prog) prog.hidden = false;
      const paths: Record<string, string> = {}; let n = 0;
      for (const k of ['front', 'back', 'selfie']) {
        const f = r.files[k]!;
        paths[k] = await upload('kyc', `${uid}/${Date.now()}-${k}-${safeName(f.name)}`, f);
        n++; if (prog) prog.firstElementChild.style.width = (n / 3 * 100) + '%';
      }
      const { error } = await sb.rpc('submit_creator_application', {
        p_category: d.cat || CATS[0], p_bio: d.bio, p_city: d.city || 'Luanda', p_price: d.pmode === 'free' ? 0 : (Number(d.price) || 0), p_appeal: r.appeal || null,
        p_bank: d.bank || BANKS[0], p_holder: d.holder, p_iban: d.iban, p_doc_front: paths.front, p_doc_back: paths.back, p_selfie: paths.selfie,
      });
      if (error) throw error;
      pixelEvento('SubmitApplication', { content_name: 'criador' });
      await loadMe(); S.reg = null; S.stTab = 'visao';
      toast(r.appeal ? 'Recurso enviado com os documentos novos. Respondemos em até 48 horas.' : 'Pedido enviado. Vamos verificar os teus documentos em até 48 horas.');
      return go('estudio');
    }
    await loadMe(); S.reg = null;
    toast('Conta pronta. Bem-vindo, ' + (S.me?.name || '').split(' ')[0] + '!');
    go('explorar');
  } catch (e) {
    busy(btn, false);
    const m = errText(e);
    showErr('#oErr', /Load failed|Failed to fetch|NetworkError|network/i.test(m)
      ? 'O envio dos documentos falhou. Verifica a ligação e carrega outra vez em «Enviar para verificação».'
      : m);
    $('#oErr')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

/* ---------- Páginas de informação ---------- */
export { INFO };
export function vInfo(r: string) {
  return infoHtml(r, S.cfg, S.me);
}
export function installModal() {
  modal(`<h3>Instalar a app</h3><p class="muted small">Fica no ecrã principal como uma app, sem ocupar espaço.</p><div class="stack" style="gap:10px"><div class="aside">${ic('phone')}<span><b>Android (Chrome):</b> abre o menu ⋮ e toca em “Adicionar ao ecrã principal” ou “Instalar app”.</span></div><div class="aside">${ic('phone')}<span><b>iPhone (Safari):</b> toca em Partilhar e depois em “Adicionar ao ecrã principal”.</span></div></div><button class="btn pri block" data-act="closeModal">Percebi</button>`);
}

/* ---------- Ações ---------- */
// onAuthStateChange (main.js) já faz loadMe + render no SIGNED_IN. Aqui só pedimos o segundo
// fator quando falta; o desenho da página fica para o render que o evento já treats.
async function afterLogin() {
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') return mfaPrompt();
  toast('Sessão iniciada');
}
function mfaPrompt() {
  modal(`<h3>Verificação em dois passos</h3><p class="small muted">Escreve o código de 6 dígitos da tua app de autenticação.</p><div class="field"><label for="mfaCode">Código</label><input id="mfaCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div><span class="err" id="mfaErr" hidden></span><button class="btn pri block" data-act="mfaVerify">Confirmar</button><button class="btn link" data-act="logout">Sair</button>`, { noClose: true });
}

export const publicActions = {
  eye(d: Record<string, string>) { const p = $('#' + d.for); p.type = p.type === 'password' ? 'text' : 'password'; },
  async google() {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/' } });
    if (error) toast(errText(error));
  },
  async forgot() {
    const e = $('#lEmail').value.trim();
    if (!isEmail(e)) return showErr('#lErr', 'Escreve o teu email no primeiro campo e carrega outra vez em “Esqueceu a palavra-passe?”.');
    let captchaToken: string | undefined;
    try { captchaToken = await captcha(); } catch (x) { return showErr('#lErr', errText(x)); }
    const { error } = await sb.auth.resetPasswordForEmail(e, { redirectTo: location.origin + '/#nova-senha', captchaToken });
    if (error) return showErr('#lErr', errText(error));
    toast('Se existir uma conta com esse email, enviámos um link para escolher uma nova palavra-passe.');
  },
  async resend() {
    const em = S.reg?.data?.email;
    if (!em) return showErr('#cErr', 'Recomeça o registo.'), true;
    let captchaToken: string | undefined;
    try { captchaToken = await captcha(); } catch (x) { return toast(errText(x)); }
    const { error } = await sb.auth.resend({ type: 'signup', email: em, options: { captchaToken } });
    toast(error ? errText(error) : 'Enviámos um novo código.');
  },
  obBack() { readOb(); S.reg!.i--; rerender(); },
  installApp() { installModal(); },
  async mfaVerify() {
    const code = ($('#mfaCode')?.value || '').trim();
    if (!code) return;                                  // o ecrã já não está aberto
    if (!/^\d{6}$/.test(code)) return showErr('#mfaErr', 'O código tem 6 dígitos.');
    const { data: f, error: lerr } = await sb.auth.mfa.listFactors();
    if (lerr) return showErr('#mfaErr', errText(lerr));
    const factor = f?.totp?.find((x) => x.status === 'verified');
    // A MFA pode ter sido desligada noutro dispositivo entre a verificação de nível e este ecrã.
    if (!factor) {
      closeModal();
      toast('A verificação em dois passos já não está ativa nesta conta. Entra outra vez.');
      await sb.auth.signOut();
      return;
    }
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (error) return showErr('#mfaErr', 'Código errado. Confirma a hora do telemóvel e tenta outra vez.');
    closeModal();
    toast('Sessão iniciada');
    rerender();
  },
};

export async function publicSubmit(f: HTMLFormElement) {
  if (f.id === 'loginForm') {
    const who = $('#lEmail').value.trim(), pw = $('#lPass').value, btn = f.querySelector('button.pri');
    if (who.length < 3) return showErr('#lErr', 'Escreve o teu email ou nome de utilizador.'), true;
    if (!pw) return showErr('#lErr', 'Escreve a tua palavra-passe.'), true;
    busy(btn, true, 'A entrar…');
    try {
      const captchaToken = await captcha();
      if (who.includes('@')) {
        const { error } = await sb.auth.signInWithPassword({ email: who, password: pw, options: { captchaToken } });
        if (error) throw error;
      } else {
        const s = await fn<{ access_token: string; refresh_token: string }>('login-handle', { handle: who, password: pw, captcha: captchaToken });
        const { error } = await sb.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
        if (error) throw error;
      }
      await afterLogin();
    } catch (e) { busy(btn, false); showErr('#lErr', errText(e)); }
    return true;
  }
  if (f.id === 'signupForm') {
    const name = $('#rName').value.trim(), email = $('#rEmail').value.trim(), pass = $('#rPass').value, country = $('#rCountry').value;
    S.reg = { i: 0, upgrade: false, files: {}, data: { tipo: 'fa', interests: [], handle: '', name, email, country } };
    if (name.length < 2) return showErr('#rErr', 'Escreve o teu nome.'), true;
    if (!isEmail(email)) return showErr('#rErr', 'Escreve um email válido, por exemplo nome@exemplo.com.'), true;
    if (!(pass.length >= 8 && /[a-z]/i.test(pass) && /\d/.test(pass))) return showErr('#rErr', 'A palavra-passe precisa de 8 caracteres ou mais, com pelo menos uma letra e um número.'), true;
    const btn = f.querySelector('button.pri'); busy(btn, true, 'A criar conta…');
    let ref = null; try { ref = localStorage.getItem('apf-ref'); } catch { /* */ }
    let captchaToken: string | undefined;
    try { captchaToken = await captcha(); } catch (x) { busy(btn, false); showErr('#rErr', errText(x)); return true; }
    const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { name, country, ref }, emailRedirectTo: location.origin + '/', captchaToken } });
    if (error) { busy(btn, false); showErr('#rErr', errText(error)); return true; }
    if (data.user && !data.user.identities?.length) { busy(btn, false); showErr('#rErr', 'Já existe uma conta com este email. Entra ou recupera a palavra-passe.'); return true; }
    pixelEvento('Lead');
    if (data.session) { await afterLogin(); return true; }
    go('confirmar');
    return true;
  }
  if (f.id === 'codeForm') {
    const code = $$('.cd').map((i) => i.value).join('');
    if (!/^\d{6}$/.test(code)) return showErr('#cErr', 'Escreve os 6 dígitos do código.'), true;
    const btn = f.querySelector('button.pri'); busy(btn, true, 'A confirmar…');
    const em = S.reg?.data?.email;
    if (!em) return showErr('#cErr', 'Recomeça o registo.'), true;
    const { error } = await sb.auth.verifyOtp({ email: em, token: code, type: 'signup' });
    if (error) { busy(btn, false); showErr('#cErr', errText(error)); return true; }
    await afterLogin(); return true;
  }
  if (f.id === 'newPassForm') {
    const a = $('#np1').value, b = $('#np2').value;
    if (!(a.length >= 8 && /[a-z]/i.test(a) && /\d/.test(a))) return showErr('#npErr', 'Pelo menos 8 caracteres, com letras e números.'), true;
    if (a !== b) return showErr('#npErr', 'As duas palavras-passe não são iguais.'), true;
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) return showErr('#npErr', errText(error)), true;
    S.recovery = false; toast('Palavra-passe alterada'); await loadMe();
    // Vai para a página certa para o papel: um criador ou admin não deve aterrar no feed de Torch.
    go(isStaff() ? 'admin' : S.creator ? 'estudio' : 'feed');
    return true;
  }
  if (f.id === 'obForm') {
    readOb();
    const fl = flow(), id = fl[S.reg!.i], err = validOb(id);
    if (err) return showErr('#oErr', err), true;
    if (id === 'perfil') {
      const { data: taken } = await sb.from('profiles').select('id').eq('handle', S.reg!.data.handle).neq('id', S.session!.user.id).maybeSingle();
      if (taken) return showErr('#oErr', 'Esse nome de utilizador já existe. Escolhe outro.'), true;
    }
    if (S.reg!.i >= fl.length - 1) { await finishOb(f.querySelector('#obBtn')); return true; }
    S.reg!.i++; rerender(); return true;
  }
  if (f.id === 'contactForm') {
    const name = $('#ctName').value.trim(), email = $('#ctMail').value.trim(), body = $('#ctMsg').value.trim();
    if (name.length < 2 || !isEmail(email) || body.length < 10) return showErr('#ctErr', 'Preenche o nome, um email válido e uma mensagem com pelo menos 10 caracteres.'), true;
    const { error } = await sb.from('contact_messages').insert({ name, email, subject: $('#ctSubj').value, body, user_id: S.me?.id || null });
    if (error) return showErr('#ctErr', errText(error)), true;
    f.reset(); $('#ctErr').hidden = true; toast('Mensagem enviada. Respondemos em até 24 horas úteis.'); return true;
  }
  return false;
}

/**
 * Lê a foto para a memória já no momento da escolha, reduzida a no máximo 2000 px em JPEG.
 * No iPhone (Safari), o ficheiro escolhido é só uma referência temporária que deixa de se
 * poder ler depois de o ecrã mudar; como os documentos só são enviados no último passo
 * (o do IBAN), o envio falhava ali com «Load failed», antes de chegar ao servidor.
 */
async function fotoEmMemoria(f: File): Promise<File> {
  let r: File = f;
  try { r = await shrinkImage(f, 2000); } catch { /* formato que o browser não desenha: segue o original */ }
  const dados = await r.arrayBuffer();
  const tipo = r.type && r.type.startsWith('image/') ? r.type : 'image/jpeg';
  return new File([dados], r.name || 'foto.jpg', { type: tipo });
}

export function publicChange(t: FormControl) {
  if (t.name === 'pmode' && $('#oPriceRow')) { $('#oPriceRow').hidden = t.value === 'free'; return true; }
  if (t.classList.contains('kycfile') && (t as HTMLInputElement).files![0]) {
    const f = (t as HTMLInputElement).files![0], k = t.dataset.k!;
    readOb();
    const drop = t.closest('.drop'); drop?.classList.add('a-ler');
    void fotoEmMemoria(f).then((pronta) => {
      if (pronta.size > 10e6) { drop?.classList.remove('a-ler'); toast('A imagem tem mais de 10 MB. Escolhe uma mais pequena.'); return; }
      if (S.reg) { S.reg.files[k] = pronta; rerender(); }
    }).catch(() => { drop?.classList.remove('a-ler'); toast('Não foi possível ler esta foto. Tira outra ou escolhe outra da galeria.'); });
    return true;
  }
  return false;
}

register({ actions: publicActions, submit: publicSubmit, change: publicChange });
