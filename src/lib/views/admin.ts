// Administração: verificações, denúncias, levantamentos, mensagens de contacto, definições
import { sb, $, esc, kz, dots, ic, LOGO, avatarOf, toast, modal, closeModal, showErr, errText, fmtDate, signedUrls, upload, publicUrl, safeName, safeHref, busy, rerender } from '../lib';
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

/* ---------- Estrutura da consola ----------
 * A navegação está agrupada pelo trabalho, não pelas tabelas: as filas (o que
 * alguém está à espera que a equipa trate) vêm primeiro e mostram quantos itens
 * têm por tratar; depois a comunidade; por fim a configuração da plataforma.
 * `admin: true` é o que mexe em dinheiro, em mensagens privadas ou na
 * configuração — um moderador nem vê a entrada. */
/** `null` = não foi possível contar (erro ou sem permissão). Nunca se mostra como 0/«em dia». */
type Contagens = { kyc: number | null; rep: number | null; pay: number | null; ct: number | null };
type Aba = { k: string; l: string; i: string; admin?: boolean; fila?: keyof Contagens };
const GRUPOS: Array<{ g: string | null; abas: Aba[] }> = [
  { g: null, abas: [{ k: 'visao', l: 'Visão geral', i: 'home' }] },
  { g: 'Filas de trabalho', abas: [
    { k: 'verificacoes', l: 'Verificações', i: 'shield', fila: 'kyc' },
    { k: 'denuncias', l: 'Denúncias', i: 'flag', fila: 'rep' },
    { k: 'levantamentos', l: 'Levantamentos', i: 'wallet', fila: 'pay', admin: true },
    { k: 'contactos', l: 'Suporte', i: 'chat', fila: 'ct' },
  ] },
  { g: 'Comunidade', abas: [
    { k: 'utilizadores', l: 'Utilizadores', i: 'users' },
    { k: 'mensagens', l: 'Auditoria de mensagens', i: 'send', admin: true },
  ] },
  { g: 'Plataforma', abas: [
    { k: 'promocoes', l: 'Promoções', i: 'bell', admin: true },
    { k: 'definicoes', l: 'Definições', i: 'settings', admin: true },
  ] },
];
const gruposPara = (adm: boolean) => GRUPOS.map((g) => ({ ...g, abas: g.abas.filter((a) => adm || !a.admin) })).filter((g) => g.abas.length);

/** Quantos itens cada fila tem por tratar. Contagens `head` — não trazem linhas.
 *  Um erro dá `null`, não 0: uma fila que não se consegue ler não está «em dia». */
async function contagens(adm: boolean): Promise<Contagens> {
  const n = { count: 'exact' as const, head: true };
  const [kyc, rep, ct, pay] = await Promise.all([
    sb.from('kyc_requests').select('id', n).eq('status', 'pending'),
    sb.from('reports').select('id', n).eq('status', 'open'),
    sb.from('contact_messages').select('id', n).eq('status', 'open'),
    adm ? sb.from('payouts').select('id', n).in('status', ['pending', 'review']) : Promise.resolve({ count: 0, error: null }),
  ]);
  const c = (r: { count: number | null; error?: unknown }) => (r.error ? null : r.count ?? 0);
  return { kyc: c(kyc), rep: c(rep), ct: c(ct), pay: c(pay) };
}

/** As filas como aparecem em «Precisa de atenção». `s` são os estados que contam como «por tratar». */
const FILAS: Array<{ k: string; fila: keyof Contagens; l: string; i: string; t: string; s: string[]; admin?: boolean }> = [
  { k: 'verificacoes', fila: 'kyc', l: 'Verificações por analisar', i: 'shield', t: 'kyc_requests', s: ['pending'] },
  { k: 'denuncias', fila: 'rep', l: 'Denúncias abertas', i: 'flag', t: 'reports', s: ['open'] },
  { k: 'levantamentos', fila: 'pay', l: 'Levantamentos por pagar', i: 'wallet', t: 'payouts', s: ['pending', 'review'], admin: true },
  { k: 'contactos', fila: 'ct', l: 'Pedidos de suporte', i: 'chat', t: 'contact_messages', s: ['open'] },
];

/** Há quanto tempo espera o item mais antigo de uma fila (o que define se a equipa está atrasada). */
async function maisAntigo(tabela: string, estados: string[]): Promise<string | null> {
  const { data } = await sb.from(tabela).select('created_at').in('status', estados).order('created_at', { ascending: true }).limit(1);
  return data?.[0]?.created_at ?? null;
}
const horasDesde = (d: string) => (Date.now() - new Date(d).getTime()) / 3600000;
const espera = (d: string) => { const h = horasDesde(d); return h < 1 ? 'há menos de 1 h' : h < 48 ? `há ${Math.floor(h)} h` : `há ${Math.floor(h / 24)} dias`; };

/** Filtros de cada fila. O primeiro é o de omissão: o que ainda está por tratar. */
const FILTROS: Record<string, Array<[string, string]>> = {
  verificacoes: [['pending', 'Por analisar'], ['done', 'Tratadas'], ['all', 'Todas']],
  denuncias: [['open', 'Abertas'], ['all', 'Todas']],
  levantamentos: [['open', 'Por tratar'], ['paid', 'Pagos'], ['rejected', 'Recusados'], ['all', 'Todos']],
  contactos: [['open', 'Por responder'], ['resolved', 'Resolvidos'], ['all', 'Todos']],
};
const filtro = (k: string): string => {
  const f = S.adFilter[k];
  return FILTROS[k].some(([v]) => v === f) ? f : FILTROS[k][0][0];
};
const chips = (k: string, pendentes: number | null = 0) => `<div class="adchips" role="tablist" aria-label="Filtrar">${FILTROS[k].map(([v, l], i) => {
  const on = filtro(k) === v;
  return `<button role="tab" aria-selected="${on}" class="${on ? 'on' : ''}" data-act="adFilter" data-k="${k}" data-v="${v}">${l}${i === 0 && pendentes ? ` <span class="count">${pendentes}</span>` : ''}</button>`;
}).join('')}</div>`;
const tagSt = (s: string): string => ({ pending: '<span class="tag warn">Por analisar</span>', approved: '<span class="tag ok">Aprovado</span>', rejected: '<span class="tag plain">Rejeitado</span>', open: '<span class="tag warn">Aberta</span>', removed: '<span class="tag plain">Removido</span>', kept: '<span class="tag ok">Mantido</span>', review: '<span class="tag info">Em revisão</span>', paid: '<span class="tag ok">Pago</span>', resolved: '<span class="tag ok">Resolvida</span>', suspended: '<span class="tag plain">Suspenso</span>' } as Record<string, string>)[s] || esc(s);
const age = (d: string | null | undefined) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 31557600000) : '—';
const REJ_REASONS = ['A selfie não mostra o documento com clareza', 'Documento ilegível ou cortado', 'A pessoa da selfie não parece ser a do documento', 'Idade abaixo dos 18 anos', 'O titular do IBAN não corresponde ao nome no documento'];

function waitingBadge(created_at: string | null) {
  const h = (Date.now() - new Date(created_at ?? 0).getTime()) / 3600000;
  if (h < 24) return '';
  const d = Math.floor(h / 24);
  return ` <span class="tag ${h > 48 ? 'warn' : 'plain'}">${d <= 0 ? 'há ' + Math.floor(h) + 'h' : `há ${d}d`} em espera</span>`;
}

async function kycTable(limit: number, f = 'all') {
  const sel = '*, user:profiles!kyc_requests_user_id_fkey(handle,name,birthdate,country,avatar_url)';
  // Fila justa: pedidos por analisar primeiro (os mais antigos no topo, para não passar ninguém à frente), já tratados no fim (mais recentes primeiro)
  const { data: pend } = f === 'done' ? { data: [] } : await sb.from('kyc_requests').select(sel).eq('status', 'pending').order('created_at', { ascending: true }).limit(limit);
  const restLimit = f === 'pending' ? 0 : Math.max(0, limit - (pend?.length || 0));
  const { data: done } = restLimit ? await sb.from('kyc_requests').select(sel).neq('status', 'pending').order('created_at', { ascending: false }).limit(restLimit) : { data: [] };
  const list = [...(pend || []), ...(done || [])];
  if (!list.length) return `<div class="box empty">${f === 'pending' ? 'Nada por analisar. A fila está em dia.' : 'Sem pedidos de verificação.'}</div>`;
  return `<div class="tw"><table><thead><tr><th>Pessoa</th><th>Idade</th><th>Pedido</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((k) => `<tr><td><div class="row">${avatarOf(k.user, 'sm')}<span>${esc(k.user?.name)}<br><span class="small muted">@${esc(k.user?.handle)}</span></span></div></td><td>${age(k.user?.birthdate)}</td><td>${fmtDate(k.created_at, true)}${k.appeal ? '<br><span class="tag info">Recurso</span>' : ''}</td><td>${tagSt(k.status)}${k.status === 'pending' ? waitingBadge(k.created_at) : ''}</td><td style="text-align:right">${k.status === 'pending' ? `<button class="btn pri sm" data-act="kycOpen" data-id="${k.id}">Analisar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
async function reportTable(limit: number, canSuspend = true, f = 'all') {
  const q = sb.from('reports').select('*, reporter:profiles!reports_reporter_id_fkey(handle)');
  // Abertas: as mais antigas primeiro, como qualquer fila. Todas: as mais recentes primeiro.
  const { data } = f === 'open'
    ? await q.eq('status', 'open').order('created_at', { ascending: true }).limit(limit)
    : await q.order('created_at', { ascending: false }).limit(limit);
  const list = data || [];
  if (!list.length) return `<div class="box empty">${f === 'open' ? 'Sem denúncias abertas. A fila está em dia.' : 'Sem denúncias.'}</div>`;
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

/** O conteúdo de uma secção: título e acções na barra de topo, `lead` por baixo, e o corpo. */
type Pagina = { h: string; lead?: string; acts?: string; body: string };

async function paginaVisao(adm: boolean, n: Contagens): Promise<Pagina> {
  const filas = FILAS.filter((q) => adm || !q.admin);
  const antigos = await Promise.all(filas.map((q) => (n[q.fila] ? maisAntigo(q.t, q.s) : Promise.resolve(null))));
  const cartoes = filas.map((q, i) => {
    const c = n[q.fila], a = antigos[i];
    const atrasada = !!(c && a && horasDesde(a) > 48);
    return `<button class="qcard ${c === null ? 'unk' : !c ? 'done' : atrasada ? 'late' : ''}" data-act="adTab" data-v="${q.k}">
      <span class="qh">${ic(q.i)}<span>${q.l}</span></span>
      <span class="qn">${c === null ? '—' : dots(c)}</span>
      <span class="qs">${c === null ? 'Não foi possível contar' : !c ? `${ic('check', 'style="width:14px;height:14px"')} Em dia` : a ? `Mais antigo ${espera(a)}` : ''}</span>
    </button>`;
  }).join('');
  const atencao = `<h2 class="adsec">Precisa de atenção</h2><div class="qgrid" style="--n:${filas.length}">${cartoes}</div>`;

  let numeros = '';
  if (adm) {
    const { data: s, error } = await sb.rpc('admin_stats');
    numeros = error
      ? `<div class="banner">${ic('info')}<span>Não foi possível carregar os números: ${esc(errText(error))}</span></div>`
      : `<h2 class="adsec">Últimos 30 dias</h2>
         <div class="kpis"><div class="kpi"><div class="l">Volume de vendas</div><div class="v">${kz(s.gross_30d)}</div></div><div class="kpi"><div class="l">Receita da plataforma</div><div class="v">${kz(s.platform_30d)}</div></div><div class="kpi"><div class="l">Saldos por levantar</div><div class="v">${kz(s.creators_balance)}</div><div class="s">Dinheiro dos criadores ainda na plataforma</div></div><div class="kpi"><div class="l">Utilizadores · criadores</div><div class="v">${dots(s.users)} · ${dots(s.creators)}</div></div></div>`;
  }

  const [kyc, rep] = await Promise.all([kycTable(5), reportTable(5, adm)]);
  return {
    h: adm ? 'Visão geral' : 'Moderação',
    lead: adm ? '' : 'Não tens acesso a vendas, receita, levantamentos nem mensagens privadas: isso é só do admin completo.',
    body: `${atencao}${numeros}
     <div class="sech"><h3>Verificações recentes</h3><button class="btn link" data-act="adTab" data-v="verificacoes">Abrir fila</button></div>${kyc}
     <div class="sech"><h3>Denúncias recentes</h3><button class="btn link" data-act="adTab" data-v="denuncias">Abrir fila</button></div>${rep}`,
  };
}

async function paginaLevantamentos(n: Contagens): Promise<Pagina> {
  const f = filtro('levantamentos');
  const q = sb.from('payouts').select('*, user:profiles!payouts_user_id_fkey(handle,name)');
  const { data } = f === 'open' ? await q.in('status', ['pending', 'review']).order('created_at', { ascending: true }).limit(200)
    : f === 'all' ? await q.order('created_at', { ascending: false }).limit(200)
    : await q.eq('status', f).order('created_at', { ascending: false }).limit(200);
  const list = data || [];
  const total = list.reduce((a, p) => a + (+p.amount || 0), 0);
  return {
    h: 'Levantamentos',
    lead: 'Faz primeiro a transferência no banco e só depois marca como pago: marcar como pago não pode ser desfeito.',
    body: `${chips('levantamentos', n.pay)}${f === 'open' && list.length ? `<p class="small muted" style="margin:-4px 0 12px">${dots(list.length)} pedido(s) · <b style="color:var(--ink)">${kz(total)}</b> por transferir</p>` : ''}
     ${list.length ? `<div class="tw"><table><thead><tr><th>Pedido</th><th>Pessoa</th><th class="num">Valor</th><th>Banco · titular · IBAN</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((p) => `<tr><td>${fmtDate(p.created_at, true)}${['pending', 'review'].includes(p.status) ? waitingBadge(p.created_at) : ''}</td><td>${esc(p.user?.name || '(conta eliminada)')}<br><span class="small muted">@${esc(p.user?.handle || '—')}</span></td><td class="num">${kz(p.amount)}</td><td class="small">${esc(p.bank)} · ${esc(p.holder)}<br><span style="font-variant-numeric:tabular-nums">${esc(p.iban)}</span></td><td>${tagSt(p.status)}${p.note ? `<div class="small muted">${esc(p.note)}</div>` : ''}</td><td>${['pending', 'review'].includes(p.status) ? `<div class="row" style="gap:6px;justify-content:flex-end">${p.status === 'pending' ? `<button class="btn out sm" data-act="payoutSet" data-id="${p.id}" data-s="review">Em revisão</button>` : ''}<button class="btn out sm" data-act="payoutReject" data-id="${p.id}">Recusar</button><button class="btn pri sm" data-act="payoutSet" data-id="${p.id}" data-s="paid">Marcar pago</button></div>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="box empty">${f === 'open' ? 'Nenhum levantamento por tratar.' : 'Sem pedidos de levantamento.'}</div>`}`,
  };
}

async function paginaUtilizadores(adm: boolean): Promise<Pagina> {
  const { data: users, error } = await sb.rpc('admin_users', { p_search: S.uq || null });
  const RL: Record<string, string> = { fan: 'Fã', creator: 'Criador', admin: 'Administração', moderator: 'Moderação' };
  return {
    h: 'Utilizadores',
    lead: adm ? 'Muda papéis e suspende criadores. O teu próprio papel não pode ser alterado daqui.' : 'Só consulta: papéis, suspensões, saldos e ganhos são do admin completo.',
    body: `<div class="row wrapf" style="gap:12px;margin-bottom:16px"><div class="field" style="flex:1;max-width:420px;margin:0"><input id="uq" type="search" placeholder="Procurar por nome, @utilizador ou email" aria-label="Procurar utilizadores" value="${esc(S.uq || '')}"></div><span class="small muted">${dots((users || []).length)} resultado(s)</span></div>
     ${error ? `<p class="empty">${esc(errText(error))}</p>` : (users || []).length ? `<div class="tw"><table><thead><tr><th>Pessoa</th><th>Email</th><th>Desde</th><th>Papel</th><th>Criador</th><th></th></tr></thead><tbody>${users.map((u: any) => `<tr><td>@${esc(u.handle)}<br><span class="small muted">${esc(u.name)}</span></td><td class="small" style="user-select:all">${esc(u.email)}</td><td>${fmtDate(u.created_at)}</td><td>${adm && u.id !== me_().id ? `<select data-act="uRoleSel" data-id="${u.id}" aria-label="Papel de @${esc(u.handle)}">${['fan', 'creator', 'moderator', 'admin'].map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${RL[r]}</option>`).join('')}</select>` : RL[u.role] || esc(u.role)}</td><td>${u.is_creator ? `${tagSt(u.creator_status)} · ${kz(u.creator_price || 0)}/mês` : '—'}</td><td style="text-align:right">${adm && u.is_creator ? (u.creator_status === 'suspended' ? `<button class="btn out sm" data-act="uCreatorStatus" data-id="${u.id}" data-s="approved">Reativar</button>` : `<button class="btn out sm" data-act="uCreatorStatus" data-id="${u.id}" data-s="suspended">Suspender</button>`) : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="box empty">Sem resultados.</div>'}`,
  };
}

async function paginaMensagens(): Promise<Pagina> {
  const { data: threads, error } = await sb.rpc('admin_threads');
  return {
    h: 'Auditoria de mensagens',
    lead: 'Conversas privadas entre criadores e fãs. Abre uma só quando houver motivo (denúncia, fraude): cada abertura fica registada no histórico de auditoria.',
    body: error ? `<p class="empty">${esc(errText(error))}</p>` : (threads || []).length ? `<div class="tw"><table><thead><tr><th>Fã</th><th>Criador</th><th class="num">Mensagens</th><th>Última</th><th></th></tr></thead><tbody>${threads.map((t2: any) => `<tr><td>@${esc(t2.fan_handle)}<br><span class="small muted">${esc(t2.fan_name)}</span></td><td>@${esc(t2.creator_handle)}<br><span class="small muted">${esc(t2.creator_name)}</span></td><td class="num">${dots(t2.message_count)}</td><td>${fmtDate(t2.last_message_at, true)}</td><td style="text-align:right"><button class="btn out sm" data-act="adThread" data-id="${t2.id}" data-fan="${esc(t2.fan_handle)}" data-cri="${esc(t2.creator_handle)}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="box empty">Sem conversas.</div>',
  };
}

async function paginaContactos(n: Contagens): Promise<Pagina> {
  const f = filtro('contactos');
  const { data: open } = f === 'resolved' ? { data: [] } : await sb.from('contact_messages').select('*').eq('status', 'open').order('created_at', { ascending: true }).limit(100);
  const rest = f === 'open' ? 0 : Math.max(0, 100 - (open?.length || 0));
  const { data: done } = rest ? await sb.from('contact_messages').select('*').eq('status', 'resolved').order('created_at', { ascending: false }).limit(rest) : { data: [] };
  const data = [...(open || []), ...(done || [])];
  const mailto = (m: any) => `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent('Re: ' + m.subject)}&body=${encodeURIComponent(`Olá ${m.name},\n\n`)}`;
  return {
    h: 'Suporte',
    lead: 'Mensagens do formulário de contacto. «Responder por email» abre o teu email com o destinatário e o assunto preenchidos; marca como resolvida depois de responderes.',
    body: `${chips('contactos', n.ct)}${data.length ? `<div class="stack">${data.map((m) => `<div class="box pad stack" style="gap:6px">
      <div class="row between wrapf"><b style="color:var(--ink)">${esc(m.subject)}</b><span class="row" style="gap:8px"><span class="small muted">${fmtDate(m.created_at, true)}</span>${tagSt(m.status)}${m.status === 'open' ? waitingBadge(m.created_at) : ''}</span></div>
      <span class="small">${esc(m.name)} · <span style="user-select:all">${esc(m.email)}</span></span>
      <p style="white-space:pre-line">${esc(m.body)}</p>
      <div class="row" style="gap:8px"><a class="btn out sm" href="${mailto(m)}">Responder por email</a>${m.status === 'open' ? `<button class="btn link sm" data-act="ctResolve" data-id="${m.id}">Marcar resolvida</button>` : ''}</div>
     </div>`).join('')}</div>` : `<div class="box empty">${f === 'open' ? 'Nenhum pedido por responder.' : 'Sem mensagens.'}</div>`}`,
  };
}

async function paginaPromocoes(): Promise<Pagina> {
  const { data: promos } = await sb.from('promos').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
  const posL: Record<string, string> = { topo: 'Topo', esquerda: 'Lado esquerdo', direita: 'Lado direito' };
  const typeL: Record<string, string> = { card: 'Cartão', media: 'Vídeo/GIF', html: 'HTML' };
  return {
    h: 'Promoções',
    lead: 'Aparecem no Início e no Explorar, na posição que escolheres. «Ativa» controla se está visível já.',
    acts: `<button class="btn pri sm" data-act="promoNew">${ic('plus')}Nova promoção</button>`,
    body: (promos || []).length ? `<div class="tw"><table><thead><tr><th></th><th>Título</th><th>Tipo</th><th>Posição</th><th class="num">Ordem</th><th>Estado</th><th></th></tr></thead><tbody>${(promos || []).map((p) => `<tr><td>${p.image_url ? (p.media_type?.startsWith('video') ? `<video src="${esc(p.image_url)}" style="width:56px;height:36px;object-fit:cover;border-radius:6px" muted></video>` : `<img src="${esc(p.image_url)}" alt="" style="width:56px;height:36px;object-fit:cover;border-radius:6px">`) : '·'}</td><td><b style="color:var(--ink)">${esc(p.title)}</b>${p.subtitle ? `<div class="small muted">${esc(p.subtitle)}</div>` : ''}</td><td>${typeL[p.content_type] || p.content_type}${(p.mobile_image_url || p.mobile_html) ? ' <span class="small muted">(+ mobile)</span>' : ''}</td><td>${posL[p.position] || p.position}</td><td class="num">${p.sort_order}</td><td>${p.active ? '<span class="tag ok">Ativa</span>' : '<span class="tag plain">Desativada</span>'}</td><td style="text-align:right"><div class="row" style="gap:6px;justify-content:flex-end"><button class="btn out sm" data-act="promoEdit" data-id="${p.id}">Editar</button><button class="btn link sm" data-act="promoDel" data-id="${p.id}">Apagar</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="box empty">Sem promoções ainda.</div>',
  };
}

async function paginaDefinicoes(): Promise<Pagina> {
  const { data } = await sb.from('settings').select('*').order('key');
  return {
    h: 'Definições',
    lead: 'Taxas e limites da plataforma. As alterações aplicam-se às vendas seguintes, não às que já foram feitas.',
    body: `<form class="box pad stack" id="setForm" style="max-width:620px" novalidate>${(data || []).map((s) => {
      const spec = SETTINGS_SPEC[s.key] || {};
      const max = spec.max ?? 10_000_000;
      return `<div class="field"><label for="set-${esc(s.key)}">${esc(spec.label || s.key)}</label><input id="set-${esc(s.key)}" data-key="${esc(s.key)}" class="setinp" type="number" min="${spec.min ?? 0}" max="${max}" step="${spec.int ? 1 : 'any'}" value="${esc(s.value)}"${spec.max ? ' data-max="' + spec.max + '"' : ''}></div>`;
    }).join('')}<span class="err" id="setErr" hidden></span><button class="btn pri" style="align-self:flex-start">Guardar</button></form>`,
  };
}

async function pagina(t: string, adm: boolean, n: Contagens): Promise<Pagina> {
  switch (t) {
    case 'verificacoes': {
      const f = filtro('verificacoes');
      return { h: 'Verificações', lead: 'Confirma documento, selfie, idade (18+) e titular do IBAN antes de aprovar. Os pedidos mais antigos estão no topo.', body: `${chips('verificacoes', n.kyc)}${await kycTable(200, f)}` };
    }
    case 'denuncias': {
      const f = filtro('denuncias');
      return { h: 'Denúncias', lead: `«Remover» esconde a publicação, apaga a mensagem ou termina a live.${adm ? '' : ' Suspender um perfil é exclusivo do admin completo.'}`, body: `${chips('denuncias', n.rep)}${await reportTable(200, adm, f)}` };
    }
    case 'levantamentos': return paginaLevantamentos(n);
    case 'contactos': return paginaContactos(n);
    case 'utilizadores': return paginaUtilizadores(adm);
    case 'mensagens': return paginaMensagens();
    case 'promocoes': return paginaPromocoes();
    case 'definicoes': return paginaDefinicoes();
    default: return paginaVisao(adm, n);
  }
}

/**
 * A consola de administração: barra lateral fixa à esquerda, barra de topo com
 * o título e as acções da secção, e o conteúdo. O `header()` de `main.ts`
 * esconde o cabeçalho do site nesta rota (classe `console` no `body`).
 */
export async function vAdmin() {
  const adm = isAdmin();
  const grupos = gruposPara(adm);
  const abas = grupos.flatMap((g) => g.abas);
  const t = abas.some((a) => a.k === S.adTab) ? S.adTab : 'visao';
  const n = await contagens(adm);
  const pg = await pagina(t, adm, n);
  const u = me_();
  const dark = document.documentElement.dataset.theme === 'dark';

  const nav = grupos.map((g) => `${g.g ? `<div class="adgrp">${g.g}</div>` : ''}${g.abas.map((a) => {
    const c = a.fila ? n[a.fila] : 0;
    return `<button class="${a.k === t ? 'on' : ''}" data-act="adTab" data-v="${a.k}"${a.k === t ? ' aria-current="page"' : ''}>${ic(a.i)}<span>${a.l}</span>${c ? `<span class="count" aria-label="${c} por tratar">${c > 99 ? '99+' : c}</span>` : ''}</button>`;
  }).join('')}`).join('');

  return `<div class="console-shell">
   <aside class="adside" id="adSide" aria-label="Administração">
    <div class="adbrand"><a class="brand" href="#admin">${LOGO(20, 25)}<span>À Porta Fechada</span></a><span class="tag ${adm ? 'acc' : 'info'}">${adm ? 'Admin' : 'Moderação'}</span></div>
    <nav class="adnav">${nav}</nav>
    <div class="adfoot">
     <a href="#explorar">${ic('compass')}<span>Ver a plataforma</span></a>
     <a href="#conta">${ic('user')}<span>A minha conta</span></a>
     <div class="adme">${avatarOf(u, 'sm')}<span class="who"><b>${esc(u.name || u.handle)}</b><span class="small muted">@${esc(u.handle)}</span></span>
      <button class="tbtn" data-act="theme" aria-label="${dark ? 'Mudar para modo claro' : 'Mudar para modo escuro'}" title="${dark ? 'Modo claro' : 'Modo escuro'}">${ic(dark ? 'sun' : 'moon')}</button>
      <button class="tbtn" data-act="logout" aria-label="Sair" title="Sair">${ic('out')}</button></div>
    </div>
   </aside>
   <div class="adscrim" data-act="adNav" aria-hidden="true"></div>
   <section class="admain">
    <header class="adtop"><button class="tbtn adburger" data-act="adNav" aria-label="Abrir menu" aria-controls="adSide">${ic('menu')}</button><h1>${pg.h}</h1>${pg.acts ? `<div class="adacts">${pg.acts}</div>` : ''}</header>
    <div class="adbody" id="adBody">${pg.lead ? `<p class="adlead">${pg.lead}</p>` : ''}${pg.body}</div>
   </section>
  </div>`;
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
  adTab(d: Record<string, string>) {
    S.adTab = d.v;
    document.body.classList.remove('adnav-open');
    // Mantém a barra lateral no ecrã e só esbate o conteúdo enquanto a secção carrega.
    $('#adBody')?.classList.add('loading'); window.scrollTo(0, 0); rerender(true);
  },
  adFilter(d: Record<string, string>) {
    if (!FILTROS[d.k]?.some(([v]) => v === d.v)) return;
    S.adFilter = { ...S.adFilter, [d.k]: d.v };
    $('#adBody')?.classList.add('loading'); rerender(true);
  },
  /** Abre/fecha a barra lateral em ecrãs pequenos (em ecrãs largos está sempre visível). */
  adNav() { document.body.classList.toggle('adnav-open'); },
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
