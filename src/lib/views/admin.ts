// Administração: verificações, denúncias, levantamentos, mensagens de contacto, definições
import { sb, $, esc, kz, dots, ic, avatarOf, toast, modal, closeModal, showErr, errText, fmtDate, signedUrls, upload, publicUrl, safeName, safeHref, busy, rerender } from '../lib';
import { S, loadCfg, isStaff, isAdmin, SETTINGS_SPEC, checkSetting, netPct } from '../state';

import type { FormControl, Profile } from '../types';
/**
 * `S.me` com o nulo resolvido.
 *
 * Estas vistas só são chamadas com sessão iniciada — o router (`lib/main.ts`)
 * redirecciona para #inicio quando não há `S.me`, e para #registar quando o
 * perfil ainda não está onboarding. O `.js` original confiava nisso e usava
 * `me_().name` em todo o lado; o compilador não pode saber, e um `!` repetido em
 * cada acesso era ilegível.
 *
 * O nome tem um underscore porque já existem locals chamados `me` neste ficheiro
 * (`msgHTML`, `mediaHTML`) — um `me()` ao nível do módulo seria sombreado por
 * eles, e `me().id` passava a ser `true.id`.
 */
const me_ = (): Profile => S.me!;

/** Fecha uma denúncia. `remove` esconde o conteúdo ou suspende o perfil (ver repResolve). */
async function resolveReport(d: Record<string, string>, remove: any) {
  const { error } = await sb.rpc('admin_resolve_report', { p_report: d.id, p_remove: !!remove });
  toast(error ? errText(error) : remove ? 'Conteúdo removido' : 'Denúncia arquivada'); rerender();
}

const tabsFor = (isAdmin: any) => [
  ['visao', 'Visão geral', 'home'],
  ['verificacoes', 'Verificações', 'shield'],
  ['denuncias', 'Denúncias', 'flag'],
  ...(isAdmin ? [['levantamentos', 'Levantamentos', 'wallet']] : []),
  ['utilizadores', 'Utilizadores', 'users'],
  ...(isAdmin ? [['mensagens', 'Mensagens', 'send']] : []),
  ['contactos', 'Contactos', 'chat'],
  ...(isAdmin ? [['promocoes', 'Promoções', 'bell']] : []),
  ...(isAdmin ? [['definicoes', 'Definições', 'settings']] : []),
];
const tagSt = (s: string): string => ({ pending: '<span class="tag warn">Por analisar</span>', approved: '<span class="tag ok">Aprovado</span>', rejected: '<span class="tag plain">Rejeitado</span>', open: '<span class="tag warn">Aberta</span>', removed: '<span class="tag plain">Removido</span>', kept: '<span class="tag ok">Mantido</span>', review: '<span class="tag info">Em revisão</span>', paid: '<span class="tag ok">Pago</span>', resolved: '<span class="tag ok">Resolvida</span>', suspended: '<span class="tag plain">Suspenso</span>' } as Record<string, string>)[s] || esc(s);
const age = (d: string | null | undefined) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 31557600000) : '—';
const REJ_REASONS = ['A selfie não mostra o documento com clareza', 'Documento ilegível ou cortado', 'A pessoa da selfie não parece ser a do documento', 'Idade abaixo dos 18 anos', 'O titular do IBAN não corresponde ao nome no documento'];

function waitingBadge(created_at: string | null) {
  const h = (Date.now() - new Date(created_at ?? 0).getTime()) / 3600000;
  if (h < 24) return '';
  const d = Math.floor(h / 24);
  return ` <span class="tag ${h > 48 ? 'warn' : 'plain'}">${d <= 0 ? 'há ' + Math.floor(h) + 'h' : `há ${d}d`} em espera</span>`;
}

async function kycTable(limit: number) {
  const sel = '*, user:profiles!kyc_requests_user_id_fkey(handle,name,birthdate,country,avatar_url)';
  // Fila justa: pedidos por analisar primeiro (os mais antigos no topo, para não passar ninguém à frente), já tratados no fim (mais recentes primeiro)
  const { data: pend } = await sb.from('kyc_requests').select(sel).eq('status', 'pending').order('created_at', { ascending: true }).limit(limit);
  const restLimit = Math.max(0, limit - (pend?.length || 0));
  const { data: done } = restLimit ? await sb.from('kyc_requests').select(sel).neq('status', 'pending').order('created_at', { ascending: false }).limit(restLimit) : { data: [] };
  const list = [...(pend || []), ...(done || [])];
  if (!list.length) return '<div class="box empty">Sem pedidos de verificação.</div>';
  return `<div class="tw"><table><thead><tr><th>Pessoa</th><th>Idade</th><th>Pedido</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((k) => `<tr><td><div class="row">${avatarOf(k.user, 'sm')}<span>${esc(k.user?.name)}<br><span class="small muted">@${esc(k.user?.handle)}</span></span></div></td><td>${age(k.user?.birthdate)}</td><td>${fmtDate(k.created_at, true)}${k.appeal ? '<br><span class="tag info">Recurso</span>' : ''}</td><td>${tagSt(k.status)}${k.status === 'pending' ? waitingBadge(k.created_at) : ''}</td><td style="text-align:right">${k.status === 'pending' ? `<button class="btn pri sm" data-act="kycOpen" data-id="${k.id}">Analisar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
async function reportTable(limit: number, canSuspend = true) {
  const { data } = await sb.from('reports').select('*, reporter:profiles!reports_reporter_id_fkey(handle)').order('created_at', { ascending: false }).limit(limit);
  const list = data || [];
  if (!list.length) return '<div class="box empty">Sem denúncias.</div>';
  // target_id vem de quem presenta a denúncia (fan.js), por isso tem de ser escapado como qualquer
  // outro valor da base de dados — aqui corre com a sessão de admin autenticada.
  const id = (r: any) => esc(r.target_id);
  const link = (r: any) => r.target_type === 'post' ? `#p-${r.target_id}` : r.target_type === 'live' ? `#live-${r.target_id}` : null;
  // Suspender um perfil é powers de admin. Um moderador pode esconder conteúdo, mas arquivar.
  const actions = (r: any) => {
    if (r.status !== 'open') return '';
    const keep = `<button class="btn out sm" data-act="repResolve" data-id="${id(r)}" data-rm="0">Arquivar</button>`;
    if (r.target_type === 'creator' && !canSuspend) return `${keep}<span class="small muted" style="align-self:center">só o admin suspende</span>`;
    const remove = r.target_type === 'creator'
      ? `<button class="btn out sm" data-act="repSuspend" data-id="${id(r)}" data-rm="1">Suspender perfil</button>`
      : `<button class="btn pri sm" data-act="repResolve" data-id="${id(r)}" data-rm="1">Remover</button>`;
    return `<div class="row" style="gap:6px;justify-content:flex-end">${remove}${keep}</div>`;
  };
  return `<div class="tw"><table><thead><tr><th>Motivo</th><th>Alvo</th><th>Por</th><th>Data</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((r) => `<tr><td><b>${esc(r.reason)}</b>${r.details ? `<div class="small muted">${esc(r.details)}</div>` : ''}</td><td>${esc(({ post: 'Publicação', creator: 'Perfil', message: 'Mensagem', live: 'Live' } as Record<string, string>)[r.target_type] || r.target_type)}${link(r) ? ` · <a href="${esc(link(r))}">ver</a>` : r.target_type === 'creator' ? ` · <button class="btn link small" data-act="adProfile" data-id="${id(r)}">ver</button>` : ''}</td><td>@${esc(r.reporter?.handle || '—')}</td><td>${fmtDate(r.created_at)}</td><td>${tagSt(r.status)}</td><td style="text-align:right">${actions(r)}</td></tr>`).join('')}</tbody></table></div>`;
}

export async function vAdmin() {
  const isAdmin = S.me?.role === 'admin';
  const TABS = tabsFor(isAdmin);
  const t = TABS.find((x) => x[0] === S.adTab) ? S.adTab : 'visao';
  let b = '';
  if (t === 'visao' && isAdmin) {
    const { data: s, error } = await sb.rpc('admin_stats');
    if (error) return `<p class="empty">${esc(errText(error))}</p>`;
    b = `<div class="pagehead"><div><h1>Administração</h1><p>Últimos 30 dias.</p></div></div>
     <div class="kpis"><div class="kpi"><div class="l">Verificações por analisar</div><div class="v">${s.kyc_pending}</div></div><div class="kpi"><div class="l">Denúncias abertas</div><div class="v">${s.reports_open}</div></div><div class="kpi"><div class="l">Levantamentos por tratar</div><div class="v">${s.payouts_pending}</div></div></div>
     <div class="kpis"><div class="kpi"><div class="l">Volume de vendas</div><div class="v">${kz(s.gross_30d)}</div></div><div class="kpi"><div class="l">Receita da plataforma</div><div class="v">${kz(s.platform_30d)}</div></div><div class="kpi"><div class="l">Saldos por levantar</div><div class="v">${kz(s.creators_balance)}</div></div><div class="kpi"><div class="l">Utilizadores · criadores</div><div class="v">${dots(s.users)} · ${dots(s.creators)}</div></div></div>
     <div class="sech"><h3>Verificações recentes</h3><button class="btn link" data-act="adTab" data-v="verificacoes">Ver todas</button></div>${await kycTable(5)}
     <div class="sech"><h3>Denúncias recentes</h3><button class="btn link" data-act="adTab" data-v="denuncias">Ver todas</button></div>${await reportTable(5, true)}`;
  } else if (t === 'visao') {
    const { data: s, error } = await sb.rpc('admin_stats_staff');
    if (error) return `<p class="empty">${esc(errText(error))}</p>`;
    b = `<div class="pagehead"><div><h1>Moderação</h1><p>Sem acesso a vendas, receita ou mensagens — só o admin completo vê isso.</p></div></div>
     <div class="kpis"><div class="kpi"><div class="l">Verificações por analisar</div><div class="v">${s.kyc_pending}</div></div><div class="kpi"><div class="l">Denúncias abertas</div><div class="v">${s.reports_open}</div></div><div class="kpi"><div class="l">Mensagens de suporte por responder</div><div class="v">${s.contacts_open}</div></div></div>
     <div class="sech"><h3>Verificações recentes</h3><button class="btn link" data-act="adTab" data-v="verificacoes">Ver todas</button></div>${await kycTable(5)}
     <div class="sech"><h3>Denúncias recentes</h3><button class="btn link" data-act="adTab" data-v="denuncias">Ver todas</button></div>${await reportTable(5, false)}`;
  } else if (t === 'verificacoes') b = `<div class="pagehead"><div><h1>Verificações</h1><p>Confirma documento, selfie, idade e titular do IBAN antes de aprovar.</p></div></div>${await kycTable(200)}`;
  else if (t === 'denuncias') b = `<div class="pagehead"><div><h1>Denúncias</h1><p>“Remover” esconde a publicação, apaga a mensagem ou termina a live. Suspender um perfil é exclusivo do admin completo.</p></div></div>${await reportTable(200, isAdmin)}`;
  else if (t === 'levantamentos') {
    const { data } = await sb.from('payouts').select('*, user:profiles!payouts_user_id_fkey(handle,name)').order('created_at', { ascending: false }).limit(200);
    b = `<div class="pagehead"><div><h1>Levantamentos</h1><p>Faz a transferência no banco e depois marca como pago.</p></div></div>
     ${(data || []).length ? `<div class="tw"><table><thead><tr><th>Pedido</th><th>Pessoa</th><th class="num">Valor</th><th>Banco · titular · IBAN</th><th>Estado</th><th></th></tr></thead><tbody>${(data || []).map((p) => `<tr><td>${fmtDate(p.created_at, true)}</td><td>${esc(p.user?.name || '(conta eliminada)')}<br><span class="small muted">@${esc(p.user?.handle || '—')}</span></td><td class="num">${kz(p.amount)}</td><td class="small">${esc(p.bank)} · ${esc(p.holder)}<br><span style="font-variant-numeric:tabular-nums">${esc(p.iban)}</span></td><td>${tagSt(p.status)}${p.note ? `<div class="small muted">${esc(p.note)}</div>` : ''}</td><td>${['pending', 'review'].includes(p.status) ? `<div class="row" style="gap:6px;justify-content:flex-end">${p.status === 'pending' ? `<button class="btn out sm" data-act="payoutSet" data-id="${p.id}" data-s="review">Em revisão</button>` : ''}<button class="btn out sm" data-act="payoutReject" data-id="${p.id}">Recusar</button><button class="btn pri sm" data-act="payoutSet" data-id="${p.id}" data-s="paid">Marcar pago</button></div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="box empty">Sem pedidos de levantamento.</div>'}`;
  } else if (t === 'utilizadores') {
    const { data: users, error } = await sb.rpc('admin_users', { p_search: S.uq || null });
    const RL: Record<string, string> = { fan: 'Fã', creator: 'Criador', admin: 'Administração', moderator: 'Moderação' };
    b = `<div class="pagehead"><div><h1>Utilizadores</h1><p>${dots((users || []).length)} resultado(s)${isAdmin ? '' : ' · sem saldos nem ganhos, isso só o admin completo vê'}.</p></div></div>
     <div class="field" style="max-width:360px"><input id="uq" placeholder="Procurar por nome, @utilizador ou email" value="${esc(S.uq || '')}"></div>
     ${error ? `<p class="empty">${esc(errText(error))}</p>` : (users || []).length ? `<div class="tw"><table><thead><tr><th>Pessoa</th><th>Email</th><th>Desde</th><th>Papel</th><th>Criador</th><th></th></tr></thead><tbody>${users.map((u: any) => `<tr><td>@${esc(u.handle)}<br><span class="small muted">${esc(u.name)}</span></td><td class="small" style="user-select:all">${esc(u.email)}</td><td>${fmtDate(u.created_at)}</td><td>${isAdmin && u.id !== me_().id ? `<select data-act="uRoleSel" data-id="${u.id}">${['fan', 'creator', 'moderator', 'admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${RL[r]}</option>`).join('')}</select>` : RL[u.role] || esc(u.role)}</td><td>${u.is_creator ? `${tagSt(u.creator_status)} · ${kz(u.creator_price || 0)}/mês` : '—'}</td><td style="text-align:right">${isAdmin && u.is_creator ? (u.creator_status === 'suspended' ? `<button class="btn out sm" data-act="uCreatorStatus" data-id="${u.id}" data-s="approved">Reativar</button>` : `<button class="btn out sm" data-act="uCreatorStatus" data-id="${u.id}" data-s="suspended">Suspender</button>`) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="box empty">Sem resultados.</div>'}`;
  } else if (t === 'mensagens' && isAdmin) {
    const { data: threads, error } = await sb.rpc('admin_threads');
    b = `<div class="pagehead"><div><h1>Mensagens</h1><p>Conversas privadas entre criadores e fãs. Só tu (admin completo) vês isto — cada vez que abres uma conversa fica registado, para responsabilização.</p></div></div>
     ${error ? `<p class="empty">${esc(errText(error))}</p>` : (threads || []).length ? `<div class="tw"><table><thead><tr><th>Fã</th><th>Criador</th><th>Mensagens</th><th>Última</th><th></th></tr></thead><tbody>${threads.map((t2: any) => `<tr><td>@${esc(t2.fan_handle)}<br><span class="small muted">${esc(t2.fan_name)}</span></td><td>@${esc(t2.creator_handle)}<br><span class="small muted">${esc(t2.creator_name)}</span></td><td>${dots(t2.message_count)}</td><td>${fmtDate(t2.last_message_at, true)}</td><td style="text-align:right"><button class="btn pri sm" data-act="adThread" data-id="${t2.id}" data-fan="${esc(t2.fan_handle)}" data-cri="${esc(t2.creator_handle)}">Ver</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="box empty">Sem conversas.</div>'}`;
  } else if (t === 'contactos') {
    const { data: open } = await sb.from('contact_messages').select('*').eq('status', 'open').order('created_at', { ascending: true }).limit(100);
    const { data: done } = await sb.from('contact_messages').select('*').eq('status', 'resolved').order('created_at', { ascending: false }).limit(Math.max(0, 100 - (open?.length || 0)));
    const data = [...(open || []), ...(done || [])];
    const mailto = (m: any) => `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent('Re: ' + m.subject)}&body=${encodeURIComponent(`Olá ${m.name},\n\n`)}`;
    b = `<div class="pagehead"><div><h1>Mensagens de contacto</h1><p>"Responder por email" abre o teu email já com o destinatário e assunto preenchidos.</p></div></div>${data.length ? `<div class="stack">${data.map((m) => `<div class="box pad stack" style="gap:6px">
      <div class="row between wrapf"><b style="color:var(--ink)">${esc(m.subject)}</b><span class="row" style="gap:8px"><span class="small muted">${fmtDate(m.created_at, true)}</span>${tagSt(m.status)}</span></div>
      <span class="small">${esc(m.name)} · <span style="user-select:all">${esc(m.email)}</span></span>
      <p style="white-space:pre-line">${esc(m.body)}</p>
      <div class="row" style="gap:8px"><a class="btn out sm" href="${mailto(m)}">Responder por email</a>${m.status === 'open' ? `<button class="btn link sm" data-act="ctResolve" data-id="${m.id}">Marcar resolvida</button>` : ''}</div>
     </div>`).join('')}</div>` : '<div class="box empty">Sem mensagens.</div>'}`;
  } else if (t === 'promocoes' && isAdmin) {
    const { data: promos } = await sb.from('promos').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
    const posL: Record<string, string> = { topo: 'Topo', esquerda: 'Lado esquerdo', direita: 'Lado direito' };
    const typeL: Record<string, string> = { card: 'Cartão', media: 'Vídeo/GIF', html: 'HTML' };
    b = `<div class="pagehead"><div><h1>Promoções</h1><p>Aparecem no Início e no Explorar, na posição que escolheres. "Ativa" controla se está visível já.</p></div><button class="btn pri" data-act="promoNew">Nova promoção</button></div>
     ${(promos || []).length ? `<div class="tw"><table><thead><tr><th></th><th>Título</th><th>Tipo</th><th>Posição</th><th>Ordem</th><th>Estado</th><th></th></tr></thead><tbody>${(promos || []).map((p) => `<tr><td>${p.image_url ? (p.media_type?.startsWith('video') ? `<video src="${esc(p.image_url)}" style="width:56px;height:36px;object-fit:cover;border-radius:6px" muted></video>` : `<img src="${esc(p.image_url)}" alt="" style="width:56px;height:36px;object-fit:cover;border-radius:6px">`) : '·'}</td><td><b style="color:var(--ink)">${esc(p.title)}</b>${p.subtitle ? `<div class="small muted">${esc(p.subtitle)}</div>` : ''}</td><td>${typeL[p.content_type] || p.content_type}${(p.mobile_image_url || p.mobile_html) ? ' <span class="small muted">(+ mobile)</span>' : ''}</td><td>${posL[p.position] || p.position}</td><td>${p.sort_order}</td><td>${p.active ? '<span class="tag ok">Ativa</span>' : '<span class="tag plain">Desativada</span>'}</td><td style="text-align:right"><div class="row" style="gap:6px;justify-content:flex-end"><button class="btn out sm" data-act="promoEdit" data-id="${p.id}">Editar</button><button class="btn link sm" data-act="promoDel" data-id="${p.id}">Apagar</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="box empty">Sem promoções ainda.</div>'}`;
  } else {
    const { data } = await sb.from('settings').select('*').order('key');
    b = `<div class="pagehead"><div><h1>Definições</h1><p>As alterações aplicam-se às vendas seguintes.</p></div></div>
     <form class="box pad stack" id="setForm" style="max-width:620px" novalidate>${(data || []).map((s) => {
      const spec = SETTINGS_SPEC[s.key] || {};
      const max = spec.max ?? 10_000_000;
      return `<div class="field"><label for="set-${esc(s.key)}">${esc(spec.label || s.key)}</label><input id="set-${esc(s.key)}" data-key="${esc(s.key)}" class="setinp" type="number" min="${spec.min ?? 0}" max="${max}" step="${spec.int ? 1 : 'any'}" value="${esc(s.value)}"${spec.max ? ' data-max="' + spec.max + '"' : ''}></div>`;
    }).join('')}<span class="err" id="setErr" hidden></span><button class="btn pri" style="align-self:flex-start">Guardar</button></form>`;
  }
  return `<div class="dash"><aside class="side" aria-label="Administração">${TABS.map(([k, l, i]) => `<button class="${t === k ? 'on' : ''}" data-act="adTab" data-v="${k}">${ic(i)}${l}</button>`).join('')}</aside><div>${b}</div></div>`;
}

/** Todo o painel é staff. `only` restringe ainda mais: 'admin' para o que mexe em dinheiro,
 *  mensagens privadas, promoções, papéis ou definições.
 *  RLS é a fronteira real; isto garante que um handler nunca executa por um clique sintético
 *  (o dispatcher de main.js é global e não verifica rota nem papel). */
function guard(level = 'staff') {
  if (level === 'admin' ? !isAdmin() : !isStaff()) { toast('Sem permissão para esta ação.'); return false; }
  return true;
}

export const adminActions = {
  adTab(d: Record<string, string>) { S.adTab = d.v; rerender(false); },
  async kycOpen(d: Record<string, string>) {
    const { data: k } = await sb.from('kyc_requests').select('*, user:profiles!kyc_requests_user_id_fkey(id,handle,name,birthdate,country)').eq('id', d.id).single();
    const [{ data: c }, { data: bank }] = await Promise.all([
      sb.from('creators').select('*').eq('id', k.user_id).maybeSingle(),
      sb.from('payout_info').select('*').eq('user_id', k.user_id).maybeSingle(),
    ]);
    const u = await signedUrls('kyc', [k.doc_front, k.doc_back, k.selfie], 600);
    const img = (p: any, l: any) => u[p] ? `<a href="${esc(u[p])}" target="_blank" rel="noopener"><img src="${esc(u[p])}" alt="${l}" style="width:100%;border-radius:8px;border:1px solid var(--line)"></a>` : `<div class="docph">${l}</div>`;
    modal(`<h3>Verificar ${esc(k.user.name)}</h3>${waitingBadge(k.created_at)}${k.appeal ? `<div class="aside">${ic('info')}<span><b>Recurso:</b> ${esc(k.appeal)}</span></div>` : ''}${k.reason ? `<div class="aside"><span><b>Motivo da rejeição anterior:</b> ${esc(k.reason)}</span></div>` : ''}
     <dl class="kv"><dt>Utilizador</dt><dd>@${esc(k.user.handle)}</dd><dt>Nascimento</dt><dd>${fmtDate(k.user.birthdate)} (${age(k.user.birthdate)} anos)</dd><dt>País</dt><dd>${esc(k.user.country)}</dd><dt>Categoria</dt><dd>${esc(c?.category || '—')} · ${c ? kz(c.price) + '/mês' : ''}</dd><dt>Banco</dt><dd>${esc(bank?.bank || '—')} · ${esc(bank?.holder || '')}</dd><dt>IBAN</dt><dd>${esc(bank?.iban || '—')}</dd></dl>
     <div class="grid2">${img(k.doc_front, 'BI · frente')}${img(k.doc_back, 'BI · verso')}</div>${img(k.selfie, 'Selfie com documento')}
     <div class="stack" style="gap:8px">${['Nome e data de nascimento coincidem com o documento', 'A pessoa da selfie é a do documento', 'Tem 18 anos ou mais', 'O titular do IBAN é a mesma pessoa'].map((x) => `<label class="check"><input type="checkbox" class="vchk"><span>${x}</span></label>`).join('')}</div>
     <div class="field"><label for="kycQuick">Motivo da rejeição (se rejeitares)</label>
      <select id="kycQuick"><option value="">Escolher um motivo comum…</option>${REJ_REASONS.map((r) => `<option>${esc(r)}</option>`).join('')}</select>
      <input id="kycReason" maxlength="200" placeholder="Ou escreve um motivo à medida" style="margin-top:8px"></div>
     <span class="err" id="kycErr" hidden></span>
     <div class="grid2"><button class="btn out" data-act="kycDecide" data-id="${k.id}" data-ok="0">Rejeitar</button><button class="btn pri" data-act="kycDecide" data-id="${k.id}" data-ok="1">Aprovar criador</button></div>`);
  },
  async kycDecide(d: Record<string, string>) {
    if (!guard()) return;
    const ok = d.ok === '1', reason = $('#kycReason').value.trim();
    if (ok && [...document.querySelectorAll<HTMLInputElement>('.vchk')].some((c) => !c.checked)) return showErr('#kycErr', 'Confirma os quatro pontos antes de aprovar.');
    if (!ok && reason.length < 5) return showErr('#kycErr', 'Escreve o motivo, para a pessoa saber o que corrigir.');
    const { error } = await sb.rpc('admin_review_kyc', { p_request: d.id, p_approve: ok, p_reason: ok ? null : reason });
    if (error) return showErr('#kycErr', errText(error));
    closeModal(); toast(ok ? 'Criador aprovado' : 'Pedido rejeitado'); rerender();
  },
  /** Arquivar, ou esconder conteúdo (publicação/mensagem/live). Nunca suspender perfis. */
  async repResolve(d: Record<string, string>) {
    if (!guard()) return;
    if (d.rm !== '1') { await resolveReport(d, false); return; }
    const { data: r } = await sb.from('reports').select('target_type,target_id,reason').eq('id', d.id).maybeSingle();
    if (r?.target_type === 'creator') return toast('Para suspender um perfil, usa “Suspender perfil”.');
    await resolveReport(d, true);
  },
  /** Suspender/reativar um perfil a partir de uma denúncia. Exclusivo do admin completo. */
  async repSuspend(d: Record<string, string>) {
    if (!guard('admin')) return;
    const { data: r } = await sb.from('reports').select('reason,target_id').eq('id', d.id).maybeSingle();
    const what = r?.reason ? ` Motivo reportado: “${r.reason}”.` : '';
    if (!confirm(`Suspender este perfil? A conta perde o acesso ao estúdio e deixa de receber subscrições.${what}`)) return;
    const { error } = await sb.rpc('admin_resolve_report', { p_report: d.id, p_remove: true });
    toast(error ? errText(error) : 'Perfil suspenso e denúncia arquivada'); rerender();
  },
  async adProfile(d: Record<string, string>) {
    if (!guard()) return;
    const { data } = await sb.from('profiles').select('handle').eq('id', d.id).maybeSingle();
    if (data) location.hash = 'perfil-' + data.handle;
  },
  async payoutSet(d: Record<string, string>) {
    if (!guard('admin')) return;
    if (!['pending', 'review', 'paid', 'rejected'].includes(d.s)) return toast('Estado inválido.');
    // Marcar como pago move dinheiro real e é irreversível: a transferência já foi feita no banco.
    if (d.s === 'paid' && !confirm('Confirmas que a transferência bancária JÁ foi feita?\n\nEsta ação não pode ser desfeita.')) return;
    const { error } = await sb.rpc('admin_set_payout', { p_payout: d.id, p_status: d.s, p_note: null });
    toast(error ? errText(error) : d.s === 'paid' ? 'Marcado como pago' : 'Em revisão'); rerender();
  },
  payoutReject(d: Record<string, string>) {
    if (!guard('admin')) return;
    modal(`<h3>Recusar levantamento</h3><p class="small muted">O valor volta ao saldo da pessoa.</p><div class="field"><label for="poNote">Motivo</label><input id="poNote" maxlength="200" placeholder="Ex.: o IBAN não corresponde ao titular"></div><span class="err" id="poErr" hidden></span><button class="btn pri block" data-act="payoutRejectOk" data-id="${d.id}">Recusar</button>`);
  },
  async payoutRejectOk(d: Record<string, string>) {
    if (!guard('admin')) return;
    const note = $('#poNote').value.trim(); if (note.length < 5) return showErr('#poErr', 'Escreve o motivo.');
    const { error } = await sb.rpc('admin_set_payout', { p_payout: d.id, p_status: 'rejected', p_note: note });
    if (error) return showErr('#poErr', errText(error));
    closeModal(); toast('Levantamento recusado'); rerender();
  },
  async uCreatorStatus(d: Record<string, string>) {
    if (!guard('admin')) return;
    if (!['approved', 'suspended', 'rejected', 'pending'].includes(d.s)) return toast('Estado inválido.');
    if (d.id === me_().id) return toast('Não podes mudar o teu próprio estado.');
    if (d.s === 'suspended' && !confirm('Suspender este criador? A conta perde o estúdio e as subscrições.')) return;
    const { error } = await sb.rpc('admin_set_creator_status', { p_creator: d.id, p_status: d.s });
    toast(error ? errText(error) : 'Estado atualizado'); rerender();
  },
  async ctResolve(d: Record<string, string>) {
    if (!guard()) return;
    const { error } = await sb.from('contact_messages').update({ status: 'resolved' }).eq('id', d.id);
    toast(error ? errText(error) : 'Marcada como resolvida'); rerender();
  },
  async adThread(d: Record<string, string>) {
    if (!guard('admin')) return;
    const { data: msgs, error } = await sb.rpc('admin_thread_messages', { p_thread: d.id });
    if (error) return toast(errText(error));
    const paths = (msgs || []).flatMap((m: any) => (m.media || []).map((x: any) => x.path));
    const urls = paths.length ? await signedUrls('messages', paths, 600) : {};
    const row = (m: any) => `<div class="box pad stack" style="gap:4px"><div class="row between"><b style="color:var(--ink)">@${esc(m.sender_handle)}</b><span class="small muted">${fmtDate(m.created_at, true)}</span></div>
      ${m.body ? `<p style="white-space:pre-line">${esc(m.body)}</p>` : ''}
      ${m.ppv_price ? `<span class="tag acc">Conteúdo pago · ${kz(m.ppv_price)}</span>` : ''}
      ${(m.media || []).map((x: any) => urls[x.path] ? (x.type?.startsWith('video') ? `<video src="${esc(urls[x.path])}" controls style="max-width:220px;border-radius:8px"></video>` : `<a href="${esc(urls[x.path])}" target="_blank" rel="noopener"><img src="${esc(urls[x.path])}" style="max-width:220px;border-radius:8px;display:block"></a>`) : '<span class="small muted">(ficheiro já não disponível)</span>').join('')}
     </div>`;
    modal(`<h3>Conversa: @${esc(d.fan)} · @${esc(d.cri)}</h3><p class="small muted">Esta abertura ficou registada no histórico de auditoria.</p>
     <div class="stack" style="max-height:60vh;overflow-y:auto">${(msgs || []).length ? (msgs || []).map(row).join('') : '<div class="box empty">Sem mensagens.</div>'}</div>`);
  },
  promoNew() { if (guard('admin')) promoForm(null); },
  async promoEdit(d: Record<string, string>) {
    if (!guard('admin')) return;
    const { data: p } = await sb.from('promos').select('*').eq('id', d.id).maybeSingle();
    if (p) promoForm(p);
  },
  async promoDel(d: Record<string, string>) {
    if (!guard('admin')) return;
    if (!confirm('Apagar esta promoção?')) return;
    const { error } = await sb.from('promos').delete().eq('id', d.id);
    toast(error ? errText(error) : 'Promoção apagada'); rerender();
  },
  async promoSave() {
    if (!guard('admin')) return;
    const title = $('#promoTitle').value.trim();
    // Lê o subtítulo do bloco visível: cartão e vídeo têm inputs separados.
    const subtitle = ($('#promoType').value === 'media' ? $('#promoMediaSubtitle') : $('#promoSubtitle'))?.value.trim() || '';
    const raw = $('#promoLink').value.trim();
    // Um link de promoção é clicado por toda a gente: só passa https/http/mailto ou rota interna.
    const link = safeHref(raw);
    if (raw && !link) return showErr('#promoErr', 'O link tem de começar por https://, mailto: ou # (rota interna).');
    const sort = +$('#promoSort').value || 0, active = $('#promoActive').checked, position = $('#promoPos').value;
    const content_type = $('#promoType').value;
    if (content_type !== 'html' && title.length < 2) return showErr('#promoErr', 'Escreve um título.');
    if (!['topo', 'esquerda', 'direita'].includes(position)) return showErr('#promoErr', 'Posição inválida.');
    if (!['card', 'media', 'html'].includes(content_type)) return showErr('#promoErr', 'Tipo inválido.');
    const btn = $('#promoBtn'); busy(btn, true, 'A guardar…');
    try {
      let image_url = S.promoImageUrl || null, mobile_image_url = S.promoMobileImageUrl || null, media_type = S.promoMediaType || null, html = null, mobile_html = null;
      const f = S.promoFile, fm = S.promoFileMobile;
      if (content_type === 'html') {
        html = $('#promoHtml').value;
        mobile_html = $('#promoHtmlMobile').value.trim() || null;
        if (!html.trim()) throw new Error('Cola o código HTML do anúncio.');
      } else {
        if (f) {
          const path = `${Date.now()}-${safeName(f.name)}`;
          await upload('promos', path, f, { upsert: true });
          image_url = publicUrl('promos', path);
          media_type = f.type || null;
        }
        if (fm) {
          const path = `${Date.now()}-m-${safeName(fm.name)}`;
          await upload('promos', path, fm, { upsert: true });
          mobile_image_url = publicUrl('promos', path);
        }
      }
      const row = { title: title || (content_type === 'html' ? 'Anúncio HTML' : ''), subtitle: subtitle || null, link_url: link || null, sort_order: sort, active, position, content_type, image_url: content_type === 'html' ? null : image_url, mobile_image_url: content_type === 'html' ? null : mobile_image_url, media_type: content_type === 'media' ? media_type : null, html, mobile_html };
      const { error } = S.promoEditId ? await sb.from('promos').update(row).eq('id', S.promoEditId) : await sb.from('promos').insert(row);
      if (error) throw error;
      S.promoFile = null; S.promoFileMobile = null; S.promoImageUrl = null; S.promoMobileImageUrl = null; S.promoMediaType = null; S.promoEditId = null;
      closeModal(); toast('Promoção guardada'); rerender();
    } catch (e) { busy(btn, false); showErr('#promoErr', errText(e)); }
  },
};

function promoForm(p: any) {
  S.promoFile = null; S.promoFileMobile = null; S.promoImageUrl = p?.image_url || null; S.promoMobileImageUrl = p?.mobile_image_url || null; S.promoMediaType = p?.media_type || null; S.promoEditId = p?.id || null;
  const ct = p?.content_type || 'card';
  modal(`<h3>${p ? 'Editar promoção' : 'Nova promoção'}</h3>
   <div class="field"><label for="promoType">Tipo de conteúdo</label><select id="promoType">
     <option value="card" ${ct === 'card' ? 'selected' : ''}>Cartão (imagem + texto)</option>
     <option value="media" ${ct === 'media' ? 'selected' : ''}>Vídeo ou GIF</option>
     <option value="html" ${ct === 'html' ? 'selected' : ''}>Código HTML personalizado</option>
    </select></div>
   <div class="field"><label for="promoTitle">Título${ct === 'html' ? ' (só para organização interna)' : ''}</label><input id="promoTitle" maxlength="80" value="${esc(p?.title || '')}" placeholder="Ex.: Promoção de lançamento"></div>
   <div id="promoCardFields" ${ct !== 'card' ? 'hidden' : ''}>
    <div class="field"><label for="promoSubtitle">Subtítulo (opcional)</label><input id="promoSubtitle" maxlength="120" value="${esc(p?.subtitle || '')}" placeholder="Ex.: 30 dias grátis para novos criadores"></div>
    <label class="drop">${ic('upload', 'style="width:22px;height:22px"')}<b style="color:var(--ink)">Imagem de fundo (usada também em telemóvel, salvo se deres uma versão mobile abaixo)</b><span class="small muted" id="promoF">${ct === 'card' && p?.image_url ? 'Já tem imagem, escolhe para substituir' : 'JPG ou PNG'}</span><input type="file" accept="image/*" id="promoFile"></label>
    <label class="drop">${ic('upload', 'style="width:22px;height:22px"')}<b style="color:var(--ink)">Versão mobile (opcional)</b><span class="small muted" id="promoFM">${ct === 'card' && p?.mobile_image_url ? 'Já tem imagem mobile, escolhe para substituir' : 'Só se quiseres um recorte diferente em ecrãs pequenos'}</span><input type="file" accept="image/*" id="promoFileMobile"></label>
   </div>
   <div id="promoMediaFields" ${ct !== 'media' ? 'hidden' : ''}>
    <div class="field"><label for="promoMediaSubtitle">Legenda sobre o vídeo (opcional)</label><input id="promoMediaSubtitle" maxlength="120" value="${ct === 'media' ? esc(p?.subtitle || '') : ''}" placeholder="Ex.: Nova coleção disponível"></div>
    <label class="drop">${ic('upload', 'style="width:22px;height:22px"')}<b style="color:var(--ink)">Vídeo ou GIF</b><span class="small muted" id="promoMediaF">${ct === 'media' && p?.image_url ? 'Já tem ficheiro, escolhe para substituir' : 'MP4 ou GIF, toca sozinho e em loop'}</span><input type="file" accept="video/mp4,image/gif" id="promoMediaFile"></label>
    <label class="drop">${ic('upload', 'style="width:22px;height:22px"')}<b style="color:var(--ink)">Versão mobile (opcional)</b><span class="small muted" id="promoMediaFM">${ct === 'media' && p?.mobile_image_url ? 'Já tem ficheiro mobile, escolhe para substituir' : 'Só se quiseres um vídeo/GIF diferente em ecrãs pequenos'}</span><input type="file" accept="video/mp4,image/gif" id="promoMediaFileMobile"></label>
   </div>
   <div id="promoHtmlFields" ${ct !== 'html' ? 'hidden' : ''}>
    <div class="field"><label for="promoHtml">Código HTML (desktop)</label><textarea id="promoHtml" rows="6" placeholder="&lt;div style=&quot;...&quot;&gt;o teu anúncio&lt;/div&gt;">${esc(p?.html || '')}</textarea><span class="small muted">Inserido tal como está na página. Deve ser responsivo por si só (usa % em vez de pixels fixos); usa apenas HTML de confiança.</span></div>
    <div class="field"><label for="promoHtmlMobile">Código HTML mobile (opcional)</label><textarea id="promoHtmlMobile" rows="5" placeholder="Deixa em branco para usar o mesmo HTML em telemóvel">${esc(p?.mobile_html || '')}</textarea></div>
   </div>
   <div class="field"><label for="promoLink">Link ao tocar (opcional, ignorado no HTML personalizado)</label><input id="promoLink" value="${esc(p?.link_url || '')}" placeholder="#explorar ou https://..."></div>
   <div class="field"><label for="promoPos">Posição</label><select id="promoPos">
     <option value="topo" ${(!p || p.position === 'topo') ? 'selected' : ''}>Topo (cartão horizontal)</option>
     <option value="esquerda" ${p?.position === 'esquerda' ? 'selected' : ''}>Lado esquerdo (cartão vertical)</option>
     <option value="direita" ${p?.position === 'direita' ? 'selected' : ''}>Lado direito (cartão vertical)</option>
    </select></div>
   <div class="field"><label for="promoSort">Ordem (menor aparece primeiro)</label><input id="promoSort" type="number" value="${p?.sort_order ?? 0}"></div>
   <label class="check"><input type="checkbox" id="promoActive" ${p?.active !== false ? 'checked' : ''}><span>Ativa (visível no site)</span></label>
   <span class="err" id="promoErr" hidden></span><button class="btn pri block" data-act="promoSave" id="promoBtn">Guardar</button>`);
}

/** Muda o papel de alguém. Só o admin completo; nunca a si próprio (evita ficar sem gestão). */
async function setRole(userId: any, newRole: any) {
  if (!guard('admin')) return;
  if (!['fan', 'creator', 'moderator', 'admin'].includes(newRole)) return toast('Papel inválido.');
  if (userId === me_().id) return toast('Não podes mudar o teu próprio papel.');
  const { error } = await sb.rpc('admin_set_role', { p_user: userId, p_role: newRole });
  toast(error ? errText(error) : 'Papel atualizado'); rerender();
}

/** Mudanças em campos da administração fora dos formulários habituais (ex.: o menu de papel na lista de utilizadores). */
export async function adminChange(t: FormControl) {
  if (t.dataset?.act === 'uRoleSel') {
    await setRole(t.dataset.id, t.value);
    return true;
  }
  // Os blocos de cartão e de vídeo estão ambos no DOM (alternados com hidden), por isso cada
  // input tem o seu próprio id e o seu próprio alvo de feedback.
  if (t.id === 'promoFile' || t.id === 'promoMediaFile') {
    const f = (t as HTMLInputElement).files![0];
    if (f) { S.promoFile = f; $(t.id === 'promoFile' ? '#promoF' : '#promoMediaF').textContent = f.name; }
    return true;
  }
  if (t.id === 'promoFileMobile' || t.id === 'promoMediaFileMobile') {
    const f = (t as HTMLInputElement).files![0];
    if (f) { S.promoFileMobile = f; $(t.id === 'promoFileMobile' ? '#promoFM' : '#promoMediaFM').textContent = f.name; }
    return true;
  }
  if (t.id === 'promoType') {
    const v = t.value;
    if (!['card', 'media', 'html'].includes(v)) return true;
    $('#promoCardFields').hidden = v !== 'card';
    $('#promoMediaFields').hidden = v !== 'media';
    $('#promoHtmlFields').hidden = v !== 'html';
    // Um ficheiro escolhido num tipo e depois mudado de tipo já não se aplica: limpa para não
    // guardares o vídeo de uma promoção que passou a cartão (ou o contrário).
    S.promoFile = null; S.promoFileMobile = null;
    return true;
  }
  return false;
}

export async function adminSubmit(f: HTMLFormElement) {
  if (f.id !== 'setForm') return false;
  if (!guard('admin')) return true;
  // Valida tudo ANTES de escrever qualquer coisa. Um UPDATE por linha sem trans-atomicidade
  // deixava as primeiras já gravadas quando a quinta falhava.
  const rows = [];
  for (const i of document.querySelectorAll<HTMLInputElement>('.setinp')) {
    const r = checkSetting(i.dataset.key!, i.value);
    if (r.error) return showErr('#setErr', r.error), true;
    rows.push({ key: i.dataset.key!, value: r.value });
  }
  for (const r of rows) {
    const { error } = await sb.from('settings').update({ value: r.value }).eq('key', r.key);
    if (error) return showErr('#setErr', `Falhou a guardar “${SETTINGS_SPEC[r.key]?.label || r.key}”: ${errText(error)}`), true;
  }
  await loadCfg();
  if (netPct() <= 0) return showErr('#setErr', 'A taxa da plataforma ficou em 100% ou mais: os criadores recebiam zero ou um valor negativo. Corrige antes de vender.'), true;
  toast('Definições guardadas'); return true;
}
