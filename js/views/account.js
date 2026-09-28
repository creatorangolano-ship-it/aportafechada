// Conta: perfil, pagamentos, afiliados, segurança, tornar-se criador
import { sb, $, $$, esc, kz, ic, avatarOf, toast, modal, closeModal, showErr, errText, fmtDate, fn, upload, publicUrl, shrinkImage, cropImage, assertImage, rerender, go } from '../lib.js';
import { S, refreshMe } from '../state.js';
import { CATS, COUNTRIES } from '../config.js';
import { startOnboarding } from './public.js';
import { affiliateBlock, payoutBlock } from './studio.js';

const KIND = { topup: 'Carregamento da carteira', subscription: 'Subscrição', post: 'Publicação', tip: 'Gorjeta', ticket: 'Bilhete de live', message: 'Mensagem paga' };
const METHOD = { wallet: 'Carteira', reference: 'Referência', mcx: 'Multicaixa Express', paypal: 'PayPal' };
const STATUS = { paid: '<span class="tag ok">Pago</span>', pending: '<span class="tag warn">Por pagar</span>', failed: '<span class="tag plain">Falhou</span>', expired: '<span class="tag plain">Expirou</span>' };

export async function vConta() {
  const r = S.me.role, cr = !!S.creator, staff = r === 'admin' || r === 'moderator';
  const it = [['perfil', 'Perfil', 'user'], ['pagamentos', 'Pagamentos', 'card'], ...(cr || staff ? [] : [['afiliados', 'Afiliados', 'link'], ['criador', 'Tornar-me criador', 'star']]), ['seguranca', 'Segurança', 'lock']];
  const t = it.find((x) => x[0] === S.ctTab) ? S.ctTab : 'perfil';
  let b = '';
  if (t === 'perfil') b = `<div class="pagehead"><div><h1>Definições da conta</h1><p>O email e a data de nascimento só tu os vês.</p></div></div>
   <form class="box pad stack" id="accForm" style="max-width:720px" novalidate>
    <div class="row">${avatarOf(S.me, 'lg')}<div style="flex:1"><h3>${esc(S.me.name || S.me.handle)}</h3><span class="small muted">@${esc(S.me.handle)} · ${cr ? 'criador' : { admin: 'administração', moderator: 'moderação' }[r] || 'fã'} · desde ${fmtDate(S.me.created_at)}</span></div>
     <label class="btn out sm" style="position:relative">Mudar foto<input type="file" accept="image/*" id="accAvatar" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div>
    <div class="grid2"><div class="field"><label for="aName">Nome</label><input id="aName" value="${esc(S.me.name)}" maxlength="60"></div>
     <div class="field"><label for="aCountry">País</label><select id="aCountry">${COUNTRIES.map((c) => `<option ${S.me.country === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
     <div class="field"><label>Email</label><input value="${esc(S.me.email || '')}" readonly><span class="hint">Para mudar o email, contacta o apoio.</span></div>
     <div class="field"><label>Nome de utilizador</label><input value="@${esc(S.me.handle)}" readonly></div></div>
    <label class="check"><input type="checkbox" id="aMailNotif" ${S.me.email_notifications !== false ? 'checked' : ''}><span>Receber por email as notificações importantes: verificação, pagamentos, subscrições, gorjetas e lives</span></label>
    <div class="field"><span class="flabel">Interesses</span><div class="interests">${CATS.map((c) => `<label><input type="checkbox" class="int" value="${c}" ${(S.me.interests || []).includes(c) ? 'checked' : ''}><span>${c}</span></label>`).join('')}</div></div>
    <span class="err" id="accErr" hidden></span><button class="btn pri" style="align-self:flex-start">Guardar alterações</button></form>`;
  else if (t === 'pagamentos') {
    const { data } = await sb.from('orders').select('*').eq('user_id', S.me.id).order('created_at', { ascending: false }).limit(100);
    b = `<div class="pagehead"><div><h1>Pagamentos</h1><p>Subscrições, gorjetas, compras e carregamentos.</p></div><a class="btn out" href="#carteira">${ic('wallet')}Carteira · ${kz(S.me.wallet_balance)}</a></div>
     <div class="tw"><table><thead><tr><th>Data</th><th>Descrição</th><th>Método</th><th class="num">Valor</th><th>Estado</th></tr></thead><tbody>${(data || []).length ? data.map((o) => `<tr><td>${fmtDate(o.created_at, true)}</td><td>${KIND[o.kind] || o.kind}</td><td>${METHOD[o.method] || o.method}</td><td class="num">${kz(o.amount)}</td><td>${STATUS[o.status] || o.status}</td></tr>`).join('') : '<tr><td colspan="5" class="muted">Ainda sem pagamentos.</td></tr>'}</tbody></table></div>`;
  } else if (t === 'afiliados') {
    b = await affiliateBlock();
    if (Number(S.me.earnings_balance) > 0) b += `<h2 style="margin:32px 0 14px">Levantar comissões</h2>${await payoutBlock()}`;
  } else if (t === 'criador') {
    b = `<div class="pagehead"><div><h1>Tornar-me criador</h1><p>São três etapas e demora cerca de 5 minutos. Depois da aprovação, o teu perfil aparece em Explorar.</p></div></div>
     <div class="box pad stack" style="max-width:640px">${['Perfil de criador: categoria, preço e apresentação', 'Identidade: BI ou passaporte e uma selfie com o documento', 'Pagamentos: banco e IBAN em teu nome'].map((s, i) => `<div class="row"><span class="avatar sm">${i + 1}</span><span>${s}</span></div>`).join('')}<button class="btn pri" style="align-self:flex-start" data-act="becomeCreator">Começar</button></div>`;
  } else {
    const { data: f } = await sb.auth.mfa.listFactors();
    const totp = (f?.totp || []).find((x) => x.status === 'verified');
    const google = (S.session?.user?.identities || []).some((i) => i.provider === 'google');
    b = `<div class="pagehead"><div><h1>Segurança</h1></div></div><div class="box pad stack" style="max-width:720px">
     ${google ? `<div class="row between wrapf"><div><b style="color:var(--ink)">Conta Google ligada</b><div class="small muted">${esc(S.me.email)}</div></div><span class="tag ok">Ligada</span></div>` : ''}
     <form id="pwForm" class="stack" novalidate><b style="color:var(--ink)">${google ? 'Criar' : 'Mudar'} palavra-passe</b><div class="grid2"><div class="field"><label for="pw1">Nova palavra-passe</label><input id="pw1" type="password" autocomplete="new-password"></div><div class="field"><label for="pw2">Repetir</label><input id="pw2" type="password" autocomplete="new-password"></div></div><span class="err" id="pwErr" hidden></span><button class="btn out sm" style="align-self:flex-start">Guardar palavra-passe</button></form>
     <div class="row between wrapf" style="border-top:1px solid var(--line);padding-top:16px"><div><b style="color:var(--ink)">Verificação em dois passos</b><div class="small muted">${totp ? 'Ativa. Pedimos um código da app de autenticação quando entras.' : 'Protege a conta com um código de uma app como Google Authenticator ou Authy.'}</div></div>
      ${totp ? `<button class="btn out sm" data-act="mfaOff" data-id="${totp.id}">Desativar</button>` : '<button class="btn pri sm" data-act="mfaOn">Ativar</button>'}</div>
     <div class="row between wrapf" style="border-top:1px solid var(--line);padding-top:16px"><div><b style="color:var(--ink)">Terminar sessão em todos os dispositivos</b><div class="small muted">Útil se usaste um computador partilhado.</div></div><button class="btn out sm" data-act="logoutAll">Terminar sessões</button></div>
     <div class="row between wrapf" style="border-top:1px solid var(--line);padding-top:16px"><div><b style="color:var(--ink)">Eliminar conta</b><div class="small muted">Apaga o perfil, as publicações, as mensagens e o saldo da carteira. Não pode ser desfeito.</div></div><button class="btn out sm" style="color:var(--acc-text)" data-act="delAccount">Eliminar conta</button></div></div>`;
  }
  return `<div class="dash"><aside class="side" aria-label="Conta">${it.map(([k, l, i]) => `<button class="${t === k ? 'on' : ''}" data-act="ctTab" data-v="${k}">${ic(i)}${l}</button>`).join('')}</aside><div>${b}</div></div>`;
}

export const accountActions = {
  ctTab(d) { S.ctTab = d.v; rerender(false); },
  ctGo(d) { S.ctTab = d.v; rerender(false); },
  becomeCreator() { S.menu = false; if (S.creator) { toast('Já tens conta de criador.'); return go('estudio'); } startOnboarding(true); go('registar'); },
  async logoutAll() { await sb.auth.signOut({ scope: 'global' }); },
  async mfaOn() {
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'App ' + Date.now() });
    if (error) return toast(errText(error));
    S.mfaEnroll = data.id;
    modal(`<h3>Ativar verificação em dois passos</h3><p class="small muted">1. Abre a app de autenticação e lê este código QR. 2. Escreve o código de 6 dígitos que aparece na app.</p>
     <div class="qr"><img src="${data.totp.qr_code}" alt="Código QR"></div><p class="small muted" style="word-break:break-all">Ou escreve a chave: <b>${esc(data.totp.secret)}</b></p>
     <div class="field"><label for="tfCode">Código</label><input id="tfCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></div><span class="err" id="tfErr" hidden></span><button class="btn pri block" data-act="mfaConfirm">Ativar</button>`);
  },
  async mfaConfirm() {
    const code = $('#tfCode').value.trim();
    if (!/^\d{6}$/.test(code)) return showErr('#tfErr', 'O código tem 6 dígitos.');
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: S.mfaEnroll, code });
    if (error) return showErr('#tfErr', 'Código errado. Confirma a hora do telemóvel e tenta outra vez.');
    closeModal(); toast('Verificação em dois passos ativa'); rerender();
  },
  async mfaOff(d) {
    const { error } = await sb.auth.mfa.unenroll({ factorId: d.id });
    toast(error ? errText(error) : 'Verificação em dois passos desativada'); rerender();
  },
  delAccount() {
    modal(`<h3>Eliminar conta</h3><p class="muted">Isto apaga o perfil, as publicações, as mensagens, as subscrições e o saldo da carteira. Não pode ser desfeito.</p><div class="field"><label for="delConf">Escreve ELIMINAR para confirmar</label><input id="delConf" autocomplete="off"></div><span class="err" id="delErr" hidden></span><button class="btn pri block" data-act="delAccountOk">Eliminar a minha conta</button>`);
  },
  async delAccountOk() {
    // A frase de confirmação era pedida ao utilizador mas nunca lida aqui: bastava um clique.
    // A verificação real também tem de existir no delete-account do servidor.
    const typed = $('#delConf')?.value.trim() || '';
    if (typed !== 'ELIMINAR') return showErr('#delErr', 'Escreve ELIMINAR em maiúsculas para confirmar.');
    try { await fn('delete-account', { confirm: typed }); } catch (e) { return showErr('#delErr', errText(e)); }
    closeModal(); await sb.auth.signOut(); toast('A tua conta foi eliminada');
  },
};

export async function accountSubmit(f) {
  if (f.id === 'accForm') {
    const name = $('#aName').value.trim();
    if (name.length < 2) return showErr('#accErr', 'Escreve o teu nome.'), true;
    const interests = $$('.int').filter((i) => i.checked).map((i) => i.value);
    const { error } = await sb.from('profiles').update({ name, country: $('#aCountry').value, interests, email_notifications: $('#aMailNotif').checked }).eq('id', S.me.id);
    if (error) return showErr('#accErr', errText(error)), true;
    await refreshMe(); toast('Alterações guardadas'); rerender(); return true;
  }
  if (f.id === 'pwForm') {
    const a = $('#pw1').value, b = $('#pw2').value;
    if (!(a.length >= 8 && /[a-z]/i.test(a) && /\d/.test(a))) return showErr('#pwErr', 'Pelo menos 8 caracteres, com letras e números.'), true;
    if (a !== b) return showErr('#pwErr', 'As duas palavras-passe não são iguais.'), true;
    const { error } = await sb.auth.updateUser({ password: a });
    if (error) return showErr('#pwErr', errText(error)), true;
    f.reset(); toast('Palavra-passe guardada'); return true;
  }
  return false;
}
export async function accountChange(t) {
  if (t.id !== 'accAvatar' || !t.files[0]) return false;
  const file = t.files[0]; t.value = '';
  try {
    // Bucket público: confirmar os bytes evita subir HTML/SVG com o content-type do cliente.
    await assertImage(file, 'a foto de perfil');
    const cropped = await cropImage(file, 1, { shape: 'round', output: 600 });
    if (!cropped) return true;
    const small = await shrinkImage(cropped, 600), path = `${S.me.id}/avatar-${Date.now()}.jpg`;
    await upload('avatars', path, new File([small], path.split('/').pop(), { type: 'image/jpeg' }), { upsert: true });
    const { error } = await sb.from('profiles').update({ avatar_url: publicUrl('avatars', path) }).eq('id', S.me.id);
    if (error) throw error;
    await refreshMe(); toast('Foto atualizada'); rerender();
  } catch (e) { toast(errText(e)); }
  return true;
}
