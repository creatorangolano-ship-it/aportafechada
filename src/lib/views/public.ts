// Páginas públicas: entrar, criar conta, etapas de registo, páginas de informação, Top 10
import { sb, $, $$, esc, kz, dots, ic, GOOGLE, LOGO, avatarOf, toast, modal, closeModal, showErr, busy, errText, fn, isEmail, upload, safeName, rerender, go } from '../lib';
import { register } from '../registry';
import { INFO } from '../rotas';
import { S, loadMe, netPct, isStaff } from '../state';
import type { RegData } from '../state';
import { CATS, CITIES, BANKS, COUNTRIES } from '../config';

import type { FormControl } from '../types';


/* ---------- Identidade legal da empresa ----------
   Preenche estes dados reais antes de publicares os Termos e a Privacidade.
   Enquanto tiverem "[...]" o texto continua a não estar pronto para lançamento. */
const COMPANY = {
  legalName: 'CDM Corporate',
  nif: '5000000000', // FICTÍCIO/TEMPORÁRIO — substitui pelo NIF real antes do lançamento
  address: 'Morro Bento, Luanda, Angola',
  email: 'Creatorangolano@gmail.com',
  dpoEmail: 'Creatorangolano@gmail.com',
};

/* ---------- Moldura da página inicial ---------- */
function authShell(card: any, second: any) {
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
const pwField = (id: any, ph: any, ac: any) => `<div class="pw"><input class="linp" id="${id}" type="password" autocomplete="${ac}" placeholder="${ph}" aria-label="${ph}"><button type="button" class="eye" data-act="eye" data-for="${id}" aria-label="Mostrar palavra-passe">${ic('eye')}</button></div>`;

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

/* ---------- Prova social na página de entrada ----------
   Número real de membros (função `contagem_publica`) e três fotos de criadores.
   Nunca um número inventado: enquanto a comunidade for pequena, uma frase de
   boas-vindas em vez do número. Preenche-se depois de a página aparecer, para
   não atrasar o formulário de entrada. */
const MIN_PARA_MOSTRAR_NUMERO = 100;
let provaSocial: Promise<string> | null = null;
function htmlProvaSocial(): Promise<string> {
  provaSocial ??= Promise.resolve(sb.rpc('contagem_publica')).then(({ data }) => {
    const d = (data as Array<{ membros: number; fotos: string[] | null }> | null)?.[0];
    if (!d) return '';
    const fotos = (d.fotos || []).map((u) => `<img src="${esc(u)}" alt="" loading="lazy" decoding="async">`).join('');
    const texto = d.membros >= MIN_PARA_MOSTRAR_NUMERO
      ? `<b>${Number(d.membros).toLocaleString('pt-PT')}</b> pessoas já estão na A Porta Fechada`
      : 'Junta-te aos primeiros membros e descobre o que está na Porta Fechada';
    return `${fotos ? `<span class="fotos">${fotos}</span>` : ''}<span>${texto}</span>`;
  }).catch(() => '');
  return provaSocial;
}
function preencherProvaSocial(): void {
  void htmlProvaSocial().then((h) => {
    const el = $('#provaSocial'); if (el && h) { el.innerHTML = h; el.hidden = false; }
  });
}

export function vInicio() {
  preencherProvaSocial();
  return authShell(`<h1 class="sr-only">Entrar na A Porta Fechada</h1><form id="loginForm" class="stack" style="gap:12px" novalidate>
     <input class="linp" id="lEmail" autocomplete="username" placeholder="Email ou nome de utilizador" aria-label="Email ou nome de utilizador">
     ${pwField('lPass', 'Palavra-passe', 'current-password')}
     <button type="button" class="btn link small" style="align-self:flex-start" data-act="forgot">Esqueceu a palavra-passe?</button>
     <span class="err" id="lErr" hidden></span>
     <button class="btn pri block lg" style="margin-top:6px">Entrar</button>
    </form>
    <div class="provasocial" id="provaSocial" hidden></div>
    <div class="or" style="margin:4px 0">ou</div>
    <button class="gbtn" data-act="google">${GOOGLE}Entrar com Google</button>`,
  `<a class="lcard lnew" href="#registar">Não tem uma conta? <b>Criar conta</b></a>`);
}

export function vSignup() {
  const d: Partial<RegData> = S.reg?.data ?? {};
  return authShell(`<h1 class="sr-only">Criar conta na A Porta Fechada</h1><form id="signupForm" class="stack" style="gap:12px" novalidate>
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

export function vConfirmEmail() {
  const email = S.reg?.data?.email || '';
  return `<div class="auth single"><form id="codeForm" class="formcard" novalidate>
    <div class="hd"><h1>Confirma o teu email</h1><p>Enviámos um código de 6 dígitos para <b style="color:var(--ink)">${esc(email)}</b>.</p></div>
    <div class="code" role="group" aria-label="Código de confirmação">${[0, 1, 2, 3, 4, 5].map((i) => `<input inputmode="numeric" maxlength="1" class="cd" id="cd${i}" aria-label="Dígito ${i + 1}">`).join('')}</div>
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
    <div class="field"><label for="oHandle">Nome de utilizador</label><input id="oHandle" value="${esc(d.handle)}" placeholder="ex.: anacristina"></div></div>
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
    <div class="field" id="oPriceRow" ${d.pmode === 'free' ? 'hidden' : ''} style="max-width:320px"><label for="oPrice">Preço da subscrição (Kz por mês)</label><input id="oPrice" type="number" min="${S.cfg.min_price}" step="100" value="${esc(d.price ?? 2500)}"><span class="hint">Mínimo ${kz(S.cfg.min_price)}. Recebes ${netPct()}% de cada subscrição.</span></div>
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
    <div class="field"><label for="oIban">IBAN</label><input id="oIban" value="${esc(d.iban || '')}" placeholder="AO06 0000 0000 0000 0000 0000 0" autocomplete="off"><span class="hint">Começa por AO06, seguido de 21 dígitos.</span></div>
    <label class="check"><input type="checkbox" id="oTerms" ${d.cterms ? 'checked' : ''}><span>Li e aceito os <a href="#regras">termos para criadores</a> e confirmo que tenho os direitos de tudo o que publicar.</span></label>
    <div class="progress" id="upProg" hidden><i style="width:0"></i></div>`;
  const last = r.i === fl.length - 1;
  return `<div class="auth">${rail}<form id="obForm" class="formcard" novalidate>${m}${b}<span class="err" id="oErr" hidden></span>
   <div class="actions">${r.i > 0 ? '<button type="button" class="btn out" data-act="obBack">Voltar</button>' : (r.upgrade ? '<a class="btn out" href="#conta">Cancelar</a>' : '<button type="button" class="btn link" data-act="logout">Sair</button>')}
   <button class="btn pri" id="obBtn">${last ? (d.tipo === 'criador' || r.upgrade ? 'Enviar para verificação' : 'Concluir') : 'Continuar'}</button></div></form></div>`;
}
function readOb() {
  const d = S.reg!.data as Record<string, any>, v = (id: any) => { const e = $('#' + id); return e ? e.value.trim() : undefined; };
  const map: Record<string, string> = { oName: 'name', oHandle: 'handle', oBirth: 'birth', oCat: 'cat', oPrice: 'price', oBio: 'bio', oCity: 'city', oBank: 'bank', oHolder: 'holder', oIban: 'iban' };
  for (const k in map) { const x = v(k); if (x !== undefined) d[map[k]] = x; }
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
    if (!/^AO06\d{21}$/i.test((d.iban || '').replace(/\s/g, ''))) return 'Confirma o IBAN: começa por AO06 e tem 21 dígitos depois disso.';
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
      await loadMe(); S.reg = null; S.stTab = 'visao';
      toast(r.appeal ? 'Recurso enviado com os documentos novos. Respondemos em até 48 horas.' : 'Pedido enviado. Vamos verificar os teus documentos em até 48 horas.');
      return go('estudio');
    }
    await loadMe(); S.reg = null;
    toast('Conta pronta. Bem-vindo, ' + (S.me?.name || '').split(' ')[0] + '!');
    go('explorar');
  } catch (e) { busy(btn, false); showErr('#oErr', errText(e)); }
}

/* ---------- Top 10 ---------- */
export async function vTop() {
  const { data, error } = await sb.rpc('top_creators', { p_period: S.topTab });
  const list = data || [];
  const inner = `<div class="pagehead"><div><h1>Top 10</h1><p>Os criadores que mais cresceram na plataforma.</p></div></div>
   <div class="tabs" role="tablist">${[['week', 'Esta semana'], ['month', 'Este mês']].map(([k, l]) => `<button role="tab" aria-selected="${S.topTab === k}" class="${S.topTab === k ? 'on' : ''}" data-act="topTab" data-v="${k}">${l}</button>`).join('')}</div>
   ${error ? `<p class="muted">${esc(errText(error))}</p>` : list.length ? `<div class="rank">${list.map((c: any, i: any) => `<a class="rw" href="#perfil-${esc(c.handle)}"><span class="n">${i + 1}</span>${avatarOf(c)}<span class="t"><b>${esc(c.name || c.handle)}</b><span>${esc(c.category)} · ${esc(c.city)}</span></span><span class="s"><b>${dots(c.follower_count)}</b>seguidores</span></a>`).join('')}</div>` : '<p class="muted">Ainda não há criadores suficientes para o ranking.</p>'}
   ${S.me ? '' : '<div class="creator-cta" style="margin-top:28px"><div><h3>Queres ver os perfis?</h3><p>Cria conta grátis para seguir e subscrever criadores.</p></div><a class="btn pri" href="#registar">Criar conta</a></div>'}`;
  return S.me ? inner : `<div class="doc" style="max-width:860px">${inner}</div>`;
}

/* ---------- Páginas de informação ---------- */
export { INFO };
export function vInfo(r: any) {
  const fee = S.cfg.fee_pct, net = netPct(), aff = S.cfg.affiliate_pct;
  const FAQ = [
    ['O que é A Porta Fechada?', 'Uma plataforma onde criadores vendem conteúdo exclusivo aos fãs através de subscrições, publicações pagas, gorjetas, mensagens e lives.'],
    ['Quem pode usar?', 'Só maiores de 18 anos. Todos os criadores confirmam a identidade com documento antes de poderem receber pagamentos.'],
    ['Como me torno criador?', 'Cria conta, escolhe “Quero ser criador” e completa três etapas: perfil de criador, documento com selfie e conta bancária. A equipa responde em até 48 horas.'],
    ['Que conteúdos posso publicar?', 'Fotografias, vídeos, texto e lives, dentro das regras da comunidade. Cada publicação pode ser grátis, para subscritores ou vendida à parte.'],
    ['Quanto custa usar a plataforma?', `Criar conta é grátis. Quando um criador vende, a plataforma fica com ${fee}% para pagamentos, servidores e impostos. O criador recebe ${net}%.`],
    ['Como pago?', 'Com Multicaixa Express, referência Multicaixa, PayPal ou cartão internacional. Também podes carregar a carteira e pagar com o saldo.'],
    ['Posso cancelar uma subscrição?', 'Sim, quando quiseres, em Subscrições. Manténs o acesso até ao fim do período já pago.'],
    ['Como funciona a renovação?', 'As subscrições renovam todos os meses com o saldo da carteira. Se não houver saldo, a subscrição termina e podes renovar no perfil do criador.'],
    ['Há reembolsos?', 'Conteúdo digital já desbloqueado não é reembolsado, salvo problema técnico comprovado.'],
    ['Quando recebe o criador?', `Depois de pedires o levantamento (mínimo ${kz(S.cfg.min_payout)}), a equipa analisa o pedido e, uma vez aprovado, o valor chega à tua conta em 2 a 4 dias úteis, conforme o banco. Não há taxa extra da plataforma sobre o levantamento: eventuais custos cobrados pelo banco na transferência são absorvidos pela plataforma, não descontados do valor pedido. Aceitamos contas nos bancos ${BANKS.join(', ')}, sempre em nome do titular da conta de criador. Se um pedido for recusado (por exemplo, dados bancários incorretos), o valor volta automaticamente ao teu saldo e explicamos o motivo, para corrigires e pedires de novo.`],
    ['Os meus dados ficam visíveis?', 'Não. O email, a data de nascimento e os dados de pagamento nunca aparecem no perfil. Perfis de fãs não aparecem nas pesquisas.'],
    ['Como protegem os conteúdos?', 'Os ficheiros pagos só abrem com links temporários para quem tem acesso, e cada conteúdo mostra o nome de utilizador de quem o está a ver.'],
    ['É um site de encontros?', 'Não. A plataforma é só para conteúdo digital. Não permitimos marcar encontros nem vender serviços presenciais.'],
    ['Posso ter mais do que uma conta?', 'Não. Cada pessoa pode ter uma conta. Contas duplicadas são eliminadas.'],
    ['Como denuncio um perfil ou conteúdo?', 'Usa “Denunciar” no perfil ou na publicação. Respondemos em até 24 horas.'],
  ];
  const P: Record<string, string> = {
    sobre: `<h1>Sobre a plataforma</h1><p class="lead">A Porta Fechada liga criadores angolanos a quem gosta do trabalho deles, com pagamentos em kwanzas.</p>
     <h2>Para quem é</h2><ul><li><b>Fãs</b> subscrevem criadores, compram conteúdos, enviam gorjetas e mensagens e assistem a lives.</li><li><b>Criadores</b> verificados publicam, definem os preços e recebem na conta bancária.</li><li><b>Afiliados</b> ganham ${aff}% sobre o que as pessoas que convidaram gastam ou ganham.</li></ul>
     <h2>Formas de ganhar</h2><ul><li>Subscrição mensal</li><li>Publicações vendidas à parte</li><li>Gorjetas em perfis e lives</li><li>Mensagens com conteúdo pago</li><li>Bilhetes para lives</li><li>Comissões de afiliado</li></ul>
     <h2>O que não somos</h2><p>Não somos um site de encontros nem uma agência. Só conteúdo digital, só maiores de 18.</p>`,
    funciona: `<h1>Como funciona</h1><p class="lead">Em poucos minutos tens conta. Criadores precisam de um passo extra: a verificação.</p>
     <h2>Se queres acompanhar criadores</h2><ol><li>Cria conta com email ou Google.</li><li>Escolhe os teus interesses e segue criadores.</li><li>Subscreve, compra publicações ou carrega a carteira.</li><li>Conversa por mensagem e entra nas lives.</li></ol>
     <h2>Se queres ser criador</h2><ol><li>Cria conta e escolhe “Quero ser criador”.</li><li>Define a categoria, o preço da subscrição e a apresentação.</li><li>Envia o BI (frente e verso) e uma selfie com o documento.</li><li>Indica o banco e o IBAN para receber.</li><li>Depois da aprovação, o perfil aparece em Explorar e podes levantar o saldo.</li></ol>
     <h2>Taxas</h2><p>A plataforma fica com ${fee}% de cada venda. O criador recebe ${net}%.</p>`,
    faq: `<h1>Perguntas frequentes</h1><p class="lead">Não encontras a resposta? <a href="#contacto">Fala connosco</a>.</p>${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}`,
    regras: `<h1>Regras da comunidade</h1><p class="lead">Estas regras protegem criadores e fãs. Quebrá-las pode levar à remoção do conteúdo ou da conta.</p>
     <ul><li>Só maiores de 18, tanto quem publica como quem aparece nos conteúdos.</li><li>Todas as pessoas nos conteúdos deram consentimento e estão verificadas.</li><li>Nada de violência, ódio, assédio ou conteúdo ilegal.</li><li>Publica só o que é teu ou aquilo para que tens autorização.</li><li>É proibido partilhar fora da plataforma conteúdos pagos de outros.</li><li>Não é permitido marcar encontros nem vender serviços presenciais.</li><li>Uma conta por pessoa. Pagamentos só para contas em nome do titular.</li></ul>`,
    termos: `<h1>Termos e condições</h1>
     <p class="lead">Bem-vindo à plataforma A Porta Fechada, operada por <b>${COMPANY.legalName}</b> (NIF ${COMPANY.nif}, sede em ${COMPANY.address}). Estes Termos e Condições regulam o uso da plataforma e dos serviços oferecidos. Ao acessar e utilizar a plataforma, concordas com os termos aqui descritos. Caso não concordes, por favor não utilizes a plataforma.</p>
     <h2>1. Definições</h2><p><b>A Porta Fechada:</b> a plataforma e os serviços nela oferecidos. <b>Utilizador:</b> qualquer pessoa que acede ou utiliza os serviços. <b>Criador:</b> utilizador que publica conteúdo e recebe pagamentos. <b>Conteúdo:</b> qualquer informação, texto, imagem, áudio ou vídeo disponibilizado na plataforma.</p>
     <h2>2. Uso da plataforma</h2><p>O utilizador deve ter 18 anos ou mais e usar a plataforma apenas para propósitos legais, de acordo com estes Termos. É proibido usar a plataforma para marcar encontros presenciais, fins ilegais ou fraudulentos, ou que possam prejudicar terceiros. Reservamo-nos o direito de suspender ou bloquear o acesso de utilizadores que violem estes Termos.</p>
     <h2>3. Conta de utilizador</h2><p>Para aceder a alguns serviços é preciso criar conta, com informações verdadeiras e atualizadas. Para te tornares criador e receberes pagamentos, confirmamos a tua identidade e idade com documento de identificação e uma selfie com esse documento. És responsável por manter a segurança da tua conta e palavra-passe; não nos responsabilizamos por acessos não autorizados. Cada pessoa só pode ter uma conta, e a conta de qualquer utilizador pode ser removida sem aviso prévio ao violar as regras da plataforma, ainda que tenha saldo ou ganhos por levantar (nesse caso, sujeitos a análise conforme a secção 7).</p>
     <h2>4. Serviços oferecidos</h2><p>Um espaço onde criadores publicam conteúdo digital e ganham através de subscrições, publicações vendidas à parte, gorjetas, mensagens pagas e bilhetes de live. A plataforma cobra uma percentagem de serviço sobre as vendas, que cobre pagamentos, alojamento e operação.</p>
     <h2>5. Privacidade e proteção de dados</h2><p>Respeitamos a privacidade dos utilizadores e protegemos os seus dados conforme a legislação angolana aplicável. Ao utilizares a plataforma, concordas com a coleta e uso de dados conforme descrito na nossa <a href="#privacidade">Política de Privacidade</a>.</p>
     <h2>6. Conteúdo e propriedade intelectual</h2><p>O criador mantém os direitos de autor sobre o que publica e concede à plataforma uma licença para o armazenar, processar e mostrar apenas a quem tenha acesso pago ou autorizado. O criador declara que tem 18 anos ou mais, que qualquer outra pessoa que apareça no conteúdo também tem 18 anos ou mais e deu consentimento para essa publicação, e que tem todos os direitos necessários sobre o conteúdo. É proibido publicar conteúdo que envolva menores, violência não consensual ou qualquer material ilegal em Angola, bem como copiar, descarregar ou redistribuir fora da plataforma conteúdo pago de outra pessoa.</p>
     <h2>7. Pagamentos, levantamentos e reembolsos</h2><p>Os preços de subscrição e de conteúdo são definidos por cada criador. As subscrições renovam mensalmente até serem canceladas. Conteúdo digital, uma vez desbloqueado, não é reembolsável, salvo erro técnico comprovado da nossa parte. Criadores recebem os seus ganhos por transferência bancária mediante pedido de levantamento, conforme detalhado nas <a href="#faq">Perguntas frequentes</a>; a conta bancária tem de estar em nome do titular da conta de criador, e pedidos podem ser recusados por dados incorretos ou suspeita de fraude, devolvendo-se o valor ao saldo do criador.</p>
     <h2>8. Regras da comunidade e moderação</h2><p>Todas as contas devem seguir as <a href="#regras">Regras da comunidade</a>. Podemos rever, ocultar ou remover conteúdo denunciado, e suspender ou encerrar contas que violem estas regras ou a lei angolana.</p>
     <h2>9. Limitação de responsabilidade</h2><p>Não garantimos que a plataforma estará sempre disponível ou livre de erros. O uso da plataforma é de inteira responsabilidade do utilizador; não nos responsabilizamos por perdas ou danos decorrentes do uso da plataforma, nem por qualquer tipo de atividade entre um assinante e o criador fora da plataforma.</p>
     <h2>10. Modificações nos termos</h2><p>Podemos modificar estes Termos a qualquer momento. As alterações entram em vigor a partir da publicação na plataforma. O utilizador deve rever periodicamente os Termos para se manter informado.</p>
     <h2>11. Lei aplicável e foro</h2><p>Estes Termos são regidos pelas leis de Angola. Qualquer disputa será resolvida no foro da comarca de Luanda, salvo disposição legal em contrário.</p>
     <h2>12. Contacto</h2><p>Para qualquer dúvida sobre estes Termos, contacta-nos pelo email <b>${COMPANY.email}</b>.</p>
     <p class="small muted" style="margin-top:24px">Data da última atualização: 27 de setembro de 2026.</p>`,
    privacidade: `<h1>Política de privacidade</h1>
     <p class="lead">A tua privacidade é importante para nós. Esta Política de Privacidade explica como <b>${COMPANY.legalName}</b> coleta, usa, armazena e protege os teus dados ao utilizares a plataforma A Porta Fechada. Ao acessar e utilizar a plataforma, concordas com os termos desta política.</p>
     <h2>1. Responsável pelo tratamento</h2><p><b>${COMPANY.legalName}</b>, NIF ${COMPANY.nif}, com sede em ${COMPANY.address}, é a entidade responsável pelos dados pessoais tratados nesta plataforma. Para qualquer pedido relacionado com proteção de dados, escreve para <b>${COMPANY.dpoEmail}</b>.</p>
     <h2>2. Coleta de dados pessoais</h2><p>Podemos coletar: nome completo, nome de utilizador, endereço de email, data de nascimento, documento de identificação e selfie de verificação (para criadores), dados bancários e de pagamento, endereço IP, dados de navegação e preferências, conteúdo publicado ou enviado, e outras informações fornecidas voluntariamente. A coleta ocorre quando o utilizador se cadastra, contacta-nos, utiliza os nossos serviços ou navega na plataforma.</p>
     <h2>3. Uso dos dados</h2><p>Os dados coletados podem ser utilizados para: criar e gerir a tua conta; verificar idade e identidade; processar pagamentos e levantamentos; melhorar a experiência do utilizador e personalizar conteúdo; enviar comunicações informativas; garantir a segurança e prevenção contra fraudes; e cumprir obrigações legais.</p>
     <h2>4. Partilha de dados</h2><p>Não vendemos, alugamos ou partilhamos dados pessoais com terceiros, exceto: com consentimento expresso do utilizador; para cumprimento de obrigações legais; ou com prestadores de serviços que auxiliam na operação da plataforma (processamento de pagamentos, alojamento), sob acordos de confidencialidade. O teu email, data de nascimento e dados bancários nunca são mostrados a outros utilizadores.</p>
     <h2>5. Proteção e armazenamento de dados</h2><p>Implementamos medidas de segurança adequadas para proteger os dados contra acesso não autorizado, alteração, divulgação ou destruição indevida. Os dados são armazenados em servidores seguros e mantidos pelo tempo necessário para cumprir as finalidades descritas nesta política, incluindo o cumprimento de obrigações fiscais e legais aplicáveis em Angola.</p>
     <h2>6. Os teus direitos</h2><p>Tens direito a: aceder aos teus dados armazenados; solicitar a correção de informações incorretas; solicitar a eliminação dos teus dados (salvo exceções legais); e revogar consentimentos dados anteriormente. Para exercer estes direitos, contacta-nos pelo email <b>${COMPANY.dpoEmail}</b> ou pelo <a href="#contacto">formulário de contacto</a>. Podes eliminar a tua conta a qualquer momento em Definições › Segurança.</p>
     <h2>7. Cookies e tecnologias de rastreamento</h2><p>A plataforma pode utilizar cookies e tecnologias semelhantes para melhorar a experiência do utilizador. Podes gerir as tuas preferências de cookies nas configurações do teu navegador.</p>
     <h2>8. Menores</h2><p>A plataforma é exclusivamente para maiores de 18 anos. Não recolhemos intencionalmente dados de menores; se identificarmos uma conta de um menor, é encerrada e os dados eliminados.</p>
     <h2>9. Alterações a esta política</h2><p>Podemos atualizar esta Política de Privacidade periodicamente. As alterações serão publicadas na plataforma e entram em vigor a partir dessa publicação.</p>
     <h2>10. Contacto</h2><p>Para qualquer dúvida sobre esta Política de Privacidade, contacta-nos pelo email <b>${COMPANY.dpoEmail}</b>.</p>`,
    dmca: `<h1>Direitos de autor</h1><p class="lead">Se encontraste um conteúdo teu publicado sem autorização, pedimos a remoção.</p><p>Envia pelo <a href="#contacto">formulário de contacto</a>, com o assunto “Direitos de autor”: o link do conteúdo, a prova de que é teu e os teus contactos. Removemos o conteúdo em até 48 horas depois de confirmado.</p>`,
    contacto: `<h1>Contacto</h1><p class="lead">Respondemos em até 24 horas úteis.</p><form class="box pad stack" id="contactForm" style="max-width:620px" novalidate><div class="grid2"><div class="field"><label for="ctName">Nome</label><input id="ctName" value="${esc(S.me?.name || '')}"></div><div class="field"><label for="ctMail">Email</label><input id="ctMail" type="email" value="${esc(S.me?.email || '')}"></div></div><div class="field"><label for="ctSubj">Assunto</label><select id="ctSubj"><option>Ajuda com a conta</option><option>Pagamentos</option><option>Verificação de criador</option><option>Direitos de autor</option><option>Parcerias e investidores</option><option>Outro</option></select></div><div class="field"><label for="ctMsg">Mensagem</label><textarea id="ctMsg"></textarea></div><span class="err" id="ctErr" hidden></span><button class="btn pri" style="align-self:flex-start">Enviar mensagem</button></form>`,
    afiliados: `<h1>Programa de afiliados</h1><p class="lead">Convida pessoas e ganha ${aff}% de tudo o que elas gastam ou ganham na plataforma.</p><ul><li>Recebes ${aff}% sobre subscrições, gorjetas e compras das pessoas que se registarem com o teu link.</li><li>Se convidares um criador, recebes ${aff}% das vendas dele.</li><li>Os ganhos de afiliado podem ser levantados para a tua conta bancária.</li></ul>${S.me ? '<a class="btn pri" href="#conta" data-act="ctGo" data-v="afiliados">Ver o meu link</a>' : '<a class="btn pri" href="#registar">Criar conta e receber o link</a>'}`,
    blog: `<h1>Blog</h1><p class="lead">Novidades e dicas para criadores e fãs.</p><div class="bloglist">${[['Como definir o preço da tua subscrição', 'O que ter em conta antes de escolher entre 1.000 e 5.000 Kz por mês.'], ['Cinco ideias de conteúdo exclusivo', 'Bastidores, perguntas e respostas, tutoriais e mais.'], ['Como proteger a tua conta', 'Palavras-passe, verificação em dois passos e cuidados com mensagens.']].map(([t, e]) => `<article class="box pad stack" style="gap:6px"><h3>${t}</h3><p class="small muted">${e}</p></article>`).join('')}</div>`,
  };
  return `<article class="doc">${P[r]}</article>`;
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
    await sb.auth.resetPasswordForEmail(e, { redirectTo: location.origin + '/#nova-senha' });
    toast('Se existir uma conta com esse email, enviámos um link para escolher uma nova palavra-passe.');
  },
  async resend() {
    const em = S.reg?.data?.email;
    if (!em) return showErr('#cErr', 'Recomeça o registo.'), true;
    const { error } = await sb.auth.resend({ type: 'signup', email: em });
    toast(error ? errText(error) : 'Enviámos um novo código.');
  },
  obBack() { readOb(); S.reg!.i--; rerender(); },
  topTab(d: Record<string, string>) { S.topTab = d.v; rerender(); },
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
      if (who.includes('@')) {
        const { error } = await sb.auth.signInWithPassword({ email: who, password: pw });
        if (error) throw error;
      } else {
        const s = await fn<{ access_token: string; refresh_token: string }>('login-handle', { handle: who, password: pw });
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
    const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { name, country, ref }, emailRedirectTo: location.origin + '/' } });
    if (error) { busy(btn, false); showErr('#rErr', errText(error)); return true; }
    if (data.session) { await afterLogin(); return true; }
    if (data.user && !data.user.identities?.length) { busy(btn, false); showErr('#rErr', 'Já existe uma conta com este email. Entra ou recupera a palavra-passe.'); return true; }
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
    go(S.creator ? 'estudio' : isStaff() ? 'admin' : 'feed');
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

export function publicChange(t: FormControl) {
  if (t.name === 'pmode' && $('#oPriceRow')) { $('#oPriceRow').hidden = t.value === 'free'; return true; }
  if (t.classList.contains('kycfile') && (t as HTMLInputElement).files![0]) {
    const f = (t as HTMLInputElement).files![0];
    if (f.size > 10e6) { toast('A imagem tem mais de 10 MB. Escolhe uma mais pequena.'); return true; }
    readOb(); S.reg!.files[t.dataset.k!] = f; rerender(); return true;
  }
  return false;
}

register({ actions: publicActions, submit: publicSubmit, change: publicChange });
