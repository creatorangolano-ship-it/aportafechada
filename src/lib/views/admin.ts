// Administração (camada de apresentação): consola, filas, verificações, denúncias, levantamentos,
// suporte, comunidade, promoções e definições.
//
// Esta vista não fala com a base de dados nem decide regras. Pede tudo à fachada `Backoffice`
// (src/application/backoffice), que confirma permissões e regras do domínio antes de chamar os
// repositórios. Aqui só se desenha HTML e se reage a cliques.
import { $, esc, kz, dots, ic, LOGO, avatarOf, toast, modal, closeModal, showErr, errText, fmtDate, safeHref, busy, rerender } from '../lib';
import { register } from '../registry';
import { S, loadCfg } from '../state';
import { backoffice } from '../../infrastructure/composicao/backoffice';
import type { Backoffice } from '../../application/backoffice/backoffice.ts';
import type { Fila, FiltroDenuncias, FiltroKyc, FiltroLevantamentos, FiltroSuporte, Linha } from '../../application/backoffice/ports.ts';
import type { ContagensDasFilas } from '../../domain/backoffice/queue.ts';
import { descreverEspera, estaAtrasado, horasDeEspera } from '../../domain/backoffice/queue.ts';
import { idade, MOTIVOS_DE_REJEICAO, PONTOS_A_CONFIRMAR } from '../../domain/backoffice/kyc.ts';
import { accoesPossiveis } from '../../domain/backoffice/report.ts';
import { porTratar } from '../../domain/backoffice/payout.ts';
import { SETTINGS_SPEC } from '../../domain/platform/settings.ts';
import { ROLES } from '../../domain/identity/role.ts';
import { DURACOES_BANIMENTO } from '../../domain/identity/moderacao.ts';
import { colunaDe, POSICOES_TELEMOVEL, TEXTO_BOTAO_PADRAO } from '../../domain/platform/promo.ts';
import type { FormControl } from '../types';

/** A fachada para quem está a agir agora. As vistas só são chamadas com sessão (ver main.ts). */
const bo = (): Backoffice => backoffice({ id: S.me!.id, role: S.me!.role });

/** Corre um comando e mostra o erro (regra de negócio ou falha de rede) como aviso. */
async function tentar(f: () => Promise<unknown>, ok?: string): Promise<boolean> {
  try { await f(); if (ok) toast(ok); return true; } catch (e) { toast(errText(e)); return false; }
}

/* ---------- Estrutura da consola ----------
 * A navegação está agrupada pelo trabalho, não pelas tabelas: as filas (o que
 * alguém está à espera que a equipa trate) vêm primeiro e mostram quantos itens
 * têm por tratar; depois a comunidade; por fim a configuração da plataforma.
 * Cada entrada declara a permissão de que precisa; sem ela, nem aparece. */
type Aba = { k: string; l: string; i: string; perm?: Parameters<Backoffice['pode']>[0]; fila?: Fila };
const GRUPOS: Array<{ g: string | null; abas: Aba[] }> = [
  { g: null, abas: [{ k: 'visao', l: 'Visão geral', i: 'home' }] },
  { g: 'Filas de trabalho', abas: [
    { k: 'verificacoes', l: 'Verificações', i: 'shield', fila: 'kyc' },
    { k: 'denuncias', l: 'Denúncias', i: 'flag', fila: 'rep' },
    { k: 'levantamentos', l: 'Levantamentos', i: 'wallet', fila: 'pay', perm: 'gerir_levantamentos' },
    { k: 'contactos', l: 'Suporte', i: 'chat', fila: 'ct' },
  ] },
  { g: 'Comunidade', abas: [
    { k: 'utilizadores', l: 'Utilizadores', i: 'users' },
    { k: 'mensagens', l: 'Auditoria de mensagens', i: 'send', perm: 'ver_mensagens_privadas' },
  ] },
  { g: 'Plataforma', abas: [
    { k: 'promocoes', l: 'Promoções', i: 'bell', perm: 'gerir_promocoes' },
    { k: 'definicoes', l: 'Definições', i: 'settings', perm: 'gerir_definicoes' },
  ] },
];
const gruposPara = (b: Backoffice) =>
  GRUPOS.map((g) => ({ ...g, abas: g.abas.filter((a) => !a.perm || b.pode(a.perm)) })).filter((g) => g.abas.length);

/** As filas como aparecem em «Precisa de atenção». */
const FILAS: Array<{ k: string; fila: Fila; l: string; i: string; perm?: Aba['perm'] }> = [
  { k: 'verificacoes', fila: 'kyc', l: 'Verificações por analisar', i: 'shield' },
  { k: 'denuncias', fila: 'rep', l: 'Denúncias abertas', i: 'flag' },
  { k: 'levantamentos', fila: 'pay', l: 'Levantamentos por pagar', i: 'wallet', perm: 'gerir_levantamentos' },
  { k: 'contactos', fila: 'ct', l: 'Pedidos de suporte', i: 'chat' },
];

/** Filtros de cada fila. O primeiro é o de omissão: o que ainda está por tratar. */
const FILTROS: Record<string, Array<[string, string]>> = {
  verificacoes: [['pending', 'Por analisar'], ['done', 'Tratadas'], ['all', 'Todas']],
  denuncias: [['open', 'Abertas'], ['all', 'Todas']],
  levantamentos: [['open', 'Por tratar'], ['paid', 'Pagos'], ['rejected', 'Recusados'], ['all', 'Todos']],
  contactos: [['open', 'Por responder'], ['resolved', 'Resolvidos'], ['all', 'Todos']],
};
const filtro = <T extends string>(k: string): T => {
  const f = S.adFilter[k];
  return (FILTROS[k].some(([v]) => v === f) ? f : FILTROS[k][0][0]) as T;
};
const chips = (k: string, pendentes: number | null = 0) => `<div class="adchips" role="tablist" aria-label="Filtrar">${FILTROS[k].map(([v, l], i) => {
  const on = filtro(k) === v;
  return `<button role="tab" aria-selected="${on}" class="${on ? 'on' : ''}" data-act="adFilter" data-k="${k}" data-v="${v}">${l}${i === 0 && pendentes ? ` <span class="count">${pendentes}</span>` : ''}</button>`;
}).join('')}</div>`;
const tagSt = (s: string): string => ({ pending: '<span class="tag warn">Por analisar</span>', approved: '<span class="tag ok">Aprovado</span>', rejected: '<span class="tag plain">Rejeitado</span>', open: '<span class="tag warn">Aberta</span>', removed: '<span class="tag plain">Removido</span>', kept: '<span class="tag ok">Mantido</span>', review: '<span class="tag info">Em revisão</span>', paid: '<span class="tag ok">Pago</span>', resolved: '<span class="tag ok">Resolvida</span>', suspended: '<span class="tag plain">Suspenso</span>' } as Record<string, string>)[s] || esc(s);

/** Etiqueta «há 3d em espera» a partir de 24 h; laranja quando está atrasado (domínio: 48 h). */
function waitingBadge(created_at: string | null) {
  if (!created_at) return '';
  const h = horasDeEspera(created_at);
  if (h < 24) return '';
  return ` <span class="tag ${estaAtrasado(created_at) ? 'warn' : 'plain'}">há ${Math.floor(h / 24)}d em espera</span>`;
}

/** Envolve uma leitura: em erro, mostra a mensagem no lugar da tabela em vez de partir a página. */
async function ler(f: () => Promise<string>): Promise<string> {
  try { return await f(); } catch (e) { return `<p class="empty">${esc(errText(e))}</p>`; }
}

function kycTable(b: Backoffice, limit: number, f: FiltroKyc = 'all') {
  return ler(async () => {
    const list = await b.verificacoes(f, limit);
    if (!list.length) return `<div class="box empty">${f === 'pending' ? 'Nada por analisar. A fila está em dia.' : 'Sem pedidos de verificação.'}</div>`;
    return `<div class="tw"><table><thead><tr><th>Pessoa</th><th>Idade</th><th>Pedido</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((k) => `<tr><td><div class="row">${avatarOf(k.user, 'sm')}<span>${esc(k.user?.name)}<br><span class="small muted">@${esc(k.user?.handle)}</span></span></div></td><td>${idade(k.user?.birthdate) ?? '—'}</td><td>${fmtDate(k.created_at, true)}${k.appeal ? '<br><span class="tag info">Recurso</span>' : ''}</td><td>${tagSt(k.status)}${k.status === 'pending' ? waitingBadge(k.created_at) : ''}</td><td style="text-align:right">${k.status === 'pending' ? `<button class="btn pri sm" data-act="kycOpen" data-id="${esc(k.id)}">Analisar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  });
}

function reportTable(b: Backoffice, limit: number, f: FiltroDenuncias = 'all') {
  return ler(async () => {
    const list = await b.denuncias(f, limit);
    if (!list.length) return `<div class="box empty">${f === 'open' ? 'Sem denúncias abertas. A fila está em dia.' : 'Sem denúncias.'}</div>`;
    // Os comandos da denúncia levam o id DA DENÚNCIA; só «ver perfil» leva o id do alvo.
    // (Antes os botões mandavam o id do alvo como se fosse o da denúncia.)
    const link = (r: Linha) => r.target_type === 'post' ? `#p-${r.target_id}` : r.target_type === 'live' ? `#live-${r.target_id}` : null;
    const actions = (r: Linha) => {
      const a = accoesPossiveis(r as { status: string; target_type: string }, b.actor.role);
      if (!a.arquivar) return '';
      const id = esc(r.id);
      const keep = `<button class="btn out sm" data-act="repArchive" data-id="${id}">Arquivar</button>`;
      if (a.soAdminSuspende) return `${keep}<span class="small muted" style="align-self:center">só o admin suspende</span>`;
      const remove = a.suspender
        ? `<button class="btn out sm" data-act="repSuspend" data-id="${id}">Suspender perfil</button>`
        : `<button class="btn pri sm" data-act="repRemove" data-id="${id}">Remover</button>`;
      return `<div class="row" style="gap:6px;justify-content:flex-end">${remove}${keep}</div>`;
    };
    return `<div class="tw"><table><thead><tr><th>Motivo</th><th>Alvo</th><th>Por</th><th>Data</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((r) => `<tr><td><b>${esc(r.reason)}</b>${r.details ? `<div class="small muted">${esc(r.details)}</div>` : ''}</td><td>${esc(({ post: 'Publicação', creator: 'Perfil', message: 'Mensagem', live: 'Live' } as Record<string, string>)[r.target_type] || r.target_type)}${link(r) ? ` · <a href="${esc(link(r))}">ver</a>` : r.target_type === 'creator' ? ` · <button class="btn link small" data-act="adProfile" data-id="${esc(r.target_id)}">ver</button>` : ''}</td><td>@${esc(r.reporter?.handle || '—')}</td><td>${fmtDate(r.created_at)}</td><td>${tagSt(r.status)}</td><td style="text-align:right">${actions(r)}</td></tr>`).join('')}</tbody></table></div>`;
  });
}

/** O conteúdo de uma secção: título e acções na barra de topo, `lead` por baixo, e o corpo. */
type Pagina = { h: string; lead?: string; acts?: string; body: string };
type PContagens = Promise<ContagensDasFilas>;

async function paginaVisao(b: Backoffice, nP: PContagens): Promise<Pagina> {
  const adm = b.pode('ver_financas');
  const filas = FILAS.filter((q) => !q.perm || b.pode(q.perm));
  // As tabelas e os números começam já; as datas do mais antigo precisam das contagens.
  const tabelas = Promise.all([kycTable(b, 5), reportTable(b, 5)]);
  const numerosP = adm ? b.estatisticas().then((s) => ({ s, erro: null }), (e) => ({ s: null, erro: e })) : null;
  const n = await nP;
  const antigos = await Promise.all(filas.map((q) => (n[q.fila] ? b.maisAntigo(q.fila).catch(() => null) : Promise.resolve(null))));
  const cartoes = filas.map((q, i) => {
    const c = n[q.fila], a = antigos[i];
    const atrasada = !!(c && a && estaAtrasado(a));
    return `<button class="qcard ${c === null ? 'unk' : !c ? 'done' : atrasada ? 'late' : ''}" data-act="adTab" data-v="${q.k}">
      <span class="qh">${ic(q.i)}<span>${q.l}</span></span>
      <span class="qn">${c === null ? '—' : dots(c)}</span>
      <span class="qs">${c === null ? 'Não foi possível contar' : !c ? `${ic('check', 'style="width:14px;height:14px"')} Em dia` : a ? `Mais antigo ${descreverEspera(a)}` : ''}</span>
    </button>`;
  }).join('');
  const atencao = `<h2 class="adsec">Precisa de atenção</h2><div class="qgrid" style="--n:${filas.length}">${cartoes}</div>`;

  let numeros = '';
  if (numerosP) {
    const { s, erro } = await numerosP;
    numeros = erro || !s
      ? `<div class="banner">${ic('info')}<span>Não foi possível carregar os números: ${esc(errText(erro))}</span></div>`
      : `<h2 class="adsec">Últimos 30 dias</h2>
         <div class="kpis"><div class="kpi"><div class="l">Volume de vendas</div><div class="v">${kz(s.gross_30d)}</div></div><div class="kpi"><div class="l">Receita da plataforma</div><div class="v">${kz(s.platform_30d)}</div></div><div class="kpi"><div class="l">Saldos por levantar</div><div class="v">${kz(s.creators_balance)}</div><div class="s">Dinheiro dos criadores ainda na plataforma</div></div><div class="kpi"><div class="l">Utilizadores · criadores</div><div class="v">${dots(s.users)} · ${dots(s.creators)}</div></div></div>`;
  }

  const [kyc, rep] = await tabelas;
  return {
    h: adm ? 'Visão geral' : 'Moderação',
    lead: adm ? '' : 'Não tens acesso a vendas, receita, levantamentos nem mensagens privadas: isso é só do admin completo.',
    body: `${atencao}${numeros}
     <div class="sech"><h3>Verificações recentes</h3><button class="btn link" data-act="adTab" data-v="verificacoes">Abrir fila</button></div>${kyc}
     <div class="sech"><h3>Denúncias recentes</h3><button class="btn link" data-act="adTab" data-v="denuncias">Abrir fila</button></div>${rep}`,
  };
}

async function paginaLevantamentos(b: Backoffice, nP: PContagens): Promise<Pagina> {
  const f = filtro<FiltroLevantamentos>('levantamentos');
  const corpo = ler(async () => {
    const list = await b.levantamentos(f, 200);
    const total = list.reduce((a, p) => a + (+p.amount || 0), 0);
    const botoes = (p: Linha) => !porTratar(p.status) ? '' : `<div class="row" style="gap:6px;justify-content:flex-end">${p.status === 'pending' ? `<button class="btn out sm" data-act="payoutSet" data-id="${esc(p.id)}" data-de="${esc(p.status)}" data-s="review">Em revisão</button>` : ''}<button class="btn out sm" data-act="payoutReject" data-id="${esc(p.id)}" data-de="${esc(p.status)}">Recusar</button><button class="btn pri sm" data-act="payoutSet" data-id="${esc(p.id)}" data-de="${esc(p.status)}" data-s="paid">Marcar pago</button></div>`;
    return `${f === 'open' && list.length ? `<p class="small muted" style="margin:-4px 0 12px">${dots(list.length)} pedido(s) · <b style="color:var(--ink)">${kz(total)}</b> por transferir</p>` : ''}
     ${list.length ? `<div class="tw"><table><thead><tr><th>Pedido</th><th>Pessoa</th><th class="num">Valor</th><th>Banco · titular · IBAN</th><th>Estado</th><th></th></tr></thead><tbody>${list.map((p) => `<tr><td>${fmtDate(p.created_at, true)}${porTratar(p.status) ? waitingBadge(p.created_at) : ''}</td><td>${esc(p.user?.name || '(conta eliminada)')}<br><span class="small muted">@${esc(p.user?.handle || '—')}</span></td><td class="num">${kz(p.amount)}</td><td class="small">${esc(p.bank)} · ${esc(p.holder)}<br><span style="font-variant-numeric:tabular-nums">${esc(p.iban)}</span></td><td>${tagSt(p.status)}${p.note ? `<div class="small muted">${esc(p.note)}</div>` : ''}</td><td>${botoes(p)}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="box empty">${f === 'open' ? 'Nenhum levantamento por tratar.' : 'Sem pedidos de levantamento.'}</div>`}`;
  });
  return {
    h: 'Levantamentos',
    lead: 'Faz primeiro a transferência no banco e só depois marca como pago: marcar como pago não pode ser desfeito.',
    body: `${chips('levantamentos', (await nP).pay)}${await corpo}`,
  };
}

async function paginaUtilizadores(b: Backoffice): Promise<Pagina> {
  const adm = b.pode('gerir_papeis');
  const RL: Record<string, string> = { fan: 'Fã', creator: 'Criador', admin: 'Administração', moderator: 'Moderação' };
  let users: Linha[] = [], erro = '';
  try { users = await b.utilizadores(S.uq || null); } catch (e) { erro = errText(e); }
  const podeSuspender = b.pode('suspender_perfis');
  const podeBanir = b.pode('banir_contas');
  /** Pode o admin actual agir sobre esta conta? Nunca sobre a própria nem sobre o perfil principal. */
  const intocavel = (u: Linha) => u.id === b.actor.id || !!u.is_owner;
  const estado = (u: Linha) => {
    const ban = u.banned_at
      ? `<span class="tag warn" title="${esc(u.ban_reason || '')}">Banida${u.banned_until ? ' até ' + fmtDate(u.banned_until) : ' (permanente)'}</span>`
      : '<span class="tag ok">Activa</span>';
    const adv = Number(u.warnings_count) ? ` <span class="tag plain">${dots(u.warnings_count)} advertência${Number(u.warnings_count) === 1 ? '' : 's'}</span>` : '';
    return ban + adv;
  };
  const accoes = (u: Linha) => {
    if (intocavel(u)) return '';
    const b1 = podeSuspender && u.is_creator ? (u.creator_status === 'suspended'
      ? `<button class="btn out sm" data-act="uCreatorStatus" data-id="${esc(u.id)}" data-s="approved">Reativar criador</button>`
      : `<button class="btn out sm" data-act="uCreatorStatus" data-id="${esc(u.id)}" data-s="suspended">Suspender criador</button>`) : '';
    const b2 = podeBanir ? `<button class="btn out sm" data-act="uWarn" data-id="${esc(u.id)}" data-h="${esc(u.handle)}">Advertir</button>` : '';
    const b3 = !podeBanir ? '' : u.banned_at
      ? `<button class="btn out sm" data-act="uUnban" data-id="${esc(u.id)}" data-h="${esc(u.handle)}">Levantar banimento</button>`
      : `<button class="btn pri sm" data-act="uBan" data-id="${esc(u.id)}" data-h="${esc(u.handle)}">Banir</button>`;
    return b1 + b2 + b3 ? `<div class="row wrapf" style="gap:6px;justify-content:flex-end">${b1}${b2}${b3}</div>` : '';
  };
  return {
    h: 'Utilizadores',
    lead: adm ? 'Muda papéis, adverte ou bane qualquer conta — fã, criador ou equipa. A tua conta e o perfil principal da plataforma não podem ser alterados daqui.' : 'Só consulta: papéis, banimentos, saldos e ganhos são do admin completo.',
    body: `<div class="row wrapf" style="gap:12px;margin-bottom:16px"><div class="field" style="flex:1;max-width:420px;margin:0"><input id="uq" type="search" placeholder="Procurar por nome, @utilizador ou email" aria-label="Procurar utilizadores" value="${esc(S.uq || '')}"></div><span class="small muted">${dots(users.length)} resultado(s)</span></div>
     ${erro ? `<p class="empty">${esc(erro)}</p>` : users.length ? `<div class="tw"><table><thead><tr><th>Pessoa</th><th>Email</th><th>Desde</th><th>Papel</th><th>Criador</th><th>Estado</th><th></th></tr></thead><tbody>${users.map((u) => `<tr><td>@${esc(u.handle)}${u.is_owner ? ' <span class="tag acc">Perfil principal</span>' : ''}<br><span class="small muted">${esc(u.name)}</span></td><td class="small" style="user-select:all">${esc(u.email)}</td><td>${fmtDate(u.created_at)}</td><td>${adm && !intocavel(u) ? `<select data-act="uRoleSel" data-id="${esc(u.id)}" aria-label="Papel de @${esc(u.handle)}">${ROLES.map((r) => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${RL[r]}</option>`).join('')}</select>` : RL[u.role] || esc(u.role)}</td><td>${u.is_creator ? `${tagSt(u.creator_status)} · ${kz(u.creator_price || 0)}/mês` : '—'}</td><td>${estado(u)}</td><td style="text-align:right">${accoes(u)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="box empty">Sem resultados.</div>'}`,
  };
}

async function paginaMensagens(b: Backoffice): Promise<Pagina> {
  return {
    h: 'Auditoria de mensagens',
    lead: 'Conversas privadas entre criadores e fãs. Abre uma só quando houver motivo (denúncia, fraude): cada abertura fica registada no histórico de auditoria.',
    body: await ler(async () => {
      const threads = await b.conversas();
      return threads.length ? `<div class="tw"><table><thead><tr><th>Fã</th><th>Criador</th><th class="num">Mensagens</th><th>Última</th><th></th></tr></thead><tbody>${threads.map((t2) => `<tr><td>@${esc(t2.fan_handle)}<br><span class="small muted">${esc(t2.fan_name)}</span></td><td>@${esc(t2.creator_handle)}<br><span class="small muted">${esc(t2.creator_name)}</span></td><td class="num">${dots(t2.message_count)}</td><td>${fmtDate(t2.last_message_at, true)}</td><td style="text-align:right"><button class="btn out sm" data-act="adThread" data-id="${esc(t2.id)}" data-fan="${esc(t2.fan_handle)}" data-cri="${esc(t2.creator_handle)}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="box empty">Sem conversas.</div>';
    }),
  };
}

async function paginaContactos(b: Backoffice, nP: PContagens): Promise<Pagina> {
  const f = filtro<FiltroSuporte>('contactos');
  const mailto = (m: Linha) => `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent('Re: ' + m.subject)}&body=${encodeURIComponent(`Olá ${m.name},\n\n`)}`;
  const corpo = ler(async () => {
    const data = await b.pedidosDeSuporte(f, 100);
    return data.length ? `<div class="stack">${data.map((m) => `<div class="box pad stack" style="gap:6px">
      <div class="row between wrapf"><b style="color:var(--ink)">${esc(m.subject)}</b><span class="row" style="gap:8px"><span class="small muted">${fmtDate(m.created_at, true)}</span>${tagSt(m.status)}${m.status === 'open' ? waitingBadge(m.created_at) : ''}</span></div>
      <span class="small">${esc(m.name)} · <span style="user-select:all">${esc(m.email)}</span></span>
      <p style="white-space:pre-line">${esc(m.body)}</p>
      <div class="row" style="gap:8px"><a class="btn out sm" href="${esc(mailto(m))}">Responder por email</a>${m.status === 'open' ? `<button class="btn link sm" data-act="ctResolve" data-id="${esc(m.id)}">Marcar resolvida</button>` : ''}</div>
     </div>`).join('')}</div>` : `<div class="box empty">${f === 'open' ? 'Nenhum pedido por responder.' : 'Sem mensagens.'}</div>`;
  });
  return {
    h: 'Suporte',
    lead: 'Mensagens do formulário de contacto. «Responder por email» abre o teu email com o destinatário e o assunto preenchidos; marca como resolvida depois de responderes.',
    body: `${chips('contactos', (await nP).ct)}${await corpo}`,
  };
}

async function paginaPromocoes(b: Backoffice): Promise<Pagina> {
  const typeL: Record<string, string> = { card: 'Imagem', media: 'Vídeo/GIF', html: 'HTML' };
  const telemovel = (p: Linha) => (p.mobile_slot ? `Depois da ${p.mobile_slot}.ª publicação` : 'Automática');
  return {
    h: 'Promoções',
    lead: 'Cada visita ao feed mostra um banner: no computador, vertical na coluna escolhida; no telemóvel, entre as publicações. Uma promoção «fixa» aparece sempre; as outras rodam, uma por visita, pela ordem.',
    acts: `<button class="btn pri sm" data-act="promoNew">${ic('plus')}Nova promoção</button>`,
    body: await ler(async () => {
      const promos = await b.promocoes();
      return promos.length ? `<div class="tw"><table><thead><tr><th></th><th>Título</th><th>Computador</th><th>Telemóvel</th><th>Exibição</th><th class="num">Ordem</th><th>Estado</th><th></th></tr></thead><tbody>${promos.map((p) => `<tr><td>${p.image_url ? (p.media_type?.startsWith('video') ? `<video src="${esc(p.image_url)}" style="width:36px;height:56px;object-fit:cover;border-radius:6px" muted></video>` : `<img loading="lazy" decoding="async" src="${esc(p.image_url)}" alt="" style="width:36px;height:56px;object-fit:cover;border-radius:6px">`) : '·'}</td><td><b style="color:var(--ink)">${esc(p.title)}</b><div class="small muted">${typeL[p.content_type] || esc(p.content_type)}${p.subtitle ? ' · ' + esc(p.subtitle) : ''}</div></td><td>Coluna ${colunaDe(p.position)}</td><td>${telemovel(p)}</td><td>${p.pinned ? '<span class="tag acc">Fixa</span>' : '<span class="tag plain">Roda</span>'}</td><td class="num">${esc(p.sort_order)}</td><td>${p.active ? '<span class="tag ok">Ativa</span>' : '<span class="tag plain">Desativada</span>'}</td><td style="text-align:right"><div class="row" style="gap:6px;justify-content:flex-end"><button class="btn out sm" data-act="promoEdit" data-id="${esc(p.id)}">Editar</button><button class="btn link sm" data-act="promoDel" data-id="${esc(p.id)}">Apagar</button></div></td></tr>`).join('')}</tbody></table></div>` : '<div class="box empty">Sem promoções ainda.</div>';
    }),
  };
}

async function paginaDefinicoes(b: Backoffice): Promise<Pagina> {
  return {
    h: 'Definições',
    lead: 'Taxas e limites da plataforma. As alterações aplicam-se às vendas seguintes, não às que já foram feitas.',
    body: await ler(async () => {
      const data = await b.definicoes();
      return `<form class="box pad stack" id="setForm" style="max-width:620px" novalidate>${data.map((s) => {
        const spec = SETTINGS_SPEC[s.key];
        return `<div class="field"><label for="set-${esc(s.key)}">${esc(spec?.label || s.key)}</label><input id="set-${esc(s.key)}" data-key="${esc(s.key)}" class="setinp" type="number" min="${spec?.min ?? 0}" max="${spec?.max ?? 10_000_000}" step="${spec?.int ? 1 : 'any'}" value="${esc(s.value)}"></div>`;
      }).join('')}<span class="err" id="setErr" hidden></span><button class="btn pri" style="align-self:flex-start">Guardar</button></form>`;
    }),
  };
}

/** `nP` é a promessa das contagens: as consultas da secção correm ao mesmo tempo que ela. */
async function pagina(b: Backoffice, t: string, nP: PContagens): Promise<Pagina> {
  switch (t) {
    case 'verificacoes': {
      const tabela = kycTable(b, 200, filtro<FiltroKyc>('verificacoes')); // começa já, em paralelo com as contagens
      return { h: 'Verificações', lead: 'Confirma documento, selfie, idade (18+) e titular do IBAN antes de aprovar. Os pedidos mais antigos estão no topo.', body: `${chips('verificacoes', (await nP).kyc)}${await tabela}` };
    }
    case 'denuncias': {
      const tabela = reportTable(b, 200, filtro<FiltroDenuncias>('denuncias'));
      return { h: 'Denúncias', lead: `«Remover» esconde a publicação, apaga a mensagem ou termina a live.${b.pode('suspender_perfis') ? '' : ' Suspender um perfil é exclusivo do admin completo.'}`, body: `${chips('denuncias', (await nP).rep)}${await tabela}` };
    }
    case 'levantamentos': return paginaLevantamentos(b, nP);
    case 'contactos': return paginaContactos(b, nP);
    case 'utilizadores': return paginaUtilizadores(b);
    case 'mensagens': return paginaMensagens(b);
    case 'promocoes': return paginaPromocoes(b);
    case 'definicoes': return paginaDefinicoes(b);
    default: return paginaVisao(b, nP);
  }
}

/**
 * A consola de administração: barra lateral fixa à esquerda, barra de topo com
 * o título e as acções da secção, e o conteúdo. O `header()` de `main.ts`
 * esconde o cabeçalho do site nesta rota (classe `console` no `body`).
 */
export async function vAdmin() {
  const b = bo();
  const grupos = gruposPara(b);
  const abas = grupos.flatMap((g) => g.abas);
  const t = abas.some((a) => a.k === S.adTab) ? S.adTab : 'visao';
  const nP = b.contagens().catch((): ContagensDasFilas => ({ kyc: null, rep: null, pay: null, ct: null }));
  const [n, pg] = await Promise.all([nP, pagina(b, t, nP)]);
  const u = S.me!;
  const adm = b.pode('ver_financas');
  const dark = document.documentElement.dataset.theme === 'dark';

  const nav = grupos.map((g) => `${g.g ? `<div class="adgrp">${g.g}</div>` : ''}${g.abas.map((a) => {
    const c = a.fila ? n[a.fila] : 0;
    return `<button class="${a.k === t ? 'on' : ''}" data-act="adTab" data-v="${a.k}"${a.k === t ? ' aria-current="page"' : ''}>${ic(a.i)}<span>${a.l}</span>${c ? `<span class="count" aria-label="${c} por tratar">${c > 99 ? '99+' : c}</span>` : ''}</button>`;
  }).join('')}`).join('');

  return `<div class="console-shell">
   <aside class="adside" id="adSide" aria-label="Administração">
    <div class="adbrand"><a class="brand" href="#admin">${LOGO(20, 25)}<span>A Porta Fechada</span></a><span class="tag ${adm ? 'acc' : 'info'}">${adm ? 'Admin' : 'Moderação'}</span></div>
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
    let det;
    try { det = await bo().detalheDaVerificacao(d.id); } catch (e) { return toast(errText(e)); }
    const { pedido: k, criador: c, banco: bank, urls: u } = det;
    const img = (p: string, l: string) => u[p] ? `<a href="${esc(u[p])}" target="_blank" rel="noopener"><img src="${esc(u[p])}" alt="${l}" style="width:100%;border-radius:8px;border:1px solid var(--line)"></a>` : `<div class="docph">${l}</div>`;
    modal(`<h3>Verificar ${esc(k.user.name)}</h3>${waitingBadge(k.created_at)}${k.appeal ? `<div class="aside">${ic('info')}<span><b>Recurso:</b> ${esc(k.appeal)}</span></div>` : ''}${k.reason ? `<div class="aside"><span><b>Motivo da rejeição anterior:</b> ${esc(k.reason)}</span></div>` : ''}
     <dl class="kv"><dt>Utilizador</dt><dd>@${esc(k.user.handle)}</dd><dt>Nascimento</dt><dd>${fmtDate(k.user.birthdate)} (${idade(k.user.birthdate) ?? '—'} anos)</dd><dt>País</dt><dd>${esc(k.user.country)}</dd><dt>Categoria</dt><dd>${esc(c?.category || '—')} · ${c ? kz(c.price) + '/mês' : ''}</dd><dt>Banco</dt><dd>${esc(bank?.bank || '—')} · ${esc(bank?.holder || '')}</dd><dt>IBAN</dt><dd>${esc(bank?.iban || '—')}</dd></dl>
     <div class="grid2">${img(k.doc_front, 'BI · frente')}${img(k.doc_back, 'BI · verso')}</div>${img(k.selfie, 'Selfie com documento')}
     <div class="stack" style="gap:8px">${PONTOS_A_CONFIRMAR.map((x) => `<label class="check"><input type="checkbox" class="vchk"><span>${x}</span></label>`).join('')}</div>
     <div class="field"><label for="kycQuick">Motivo da rejeição (se rejeitares)</label>
      <select id="kycQuick"><option value="">Escolher um motivo comum…</option>${MOTIVOS_DE_REJEICAO.map((r) => `<option>${esc(r)}</option>`).join('')}</select>
      <input id="kycReason" maxlength="200" placeholder="Ou escreve um motivo à medida" style="margin-top:8px"></div>
     <span class="err" id="kycErr" hidden></span>
     <div class="grid2"><button class="btn out" data-act="kycDecide" data-id="${esc(k.id)}" data-ok="0">Rejeitar</button><button class="btn pri" data-act="kycDecide" data-id="${esc(k.id)}" data-ok="1">Aprovar criador</button></div>`);
  },
  async kycDecide(d: Record<string, string>) {
    const aprovar = d.ok === '1';
    // O motivo escrito à mão ganha; senão, vale o motivo comum escolhido na lista.
    const motivo = ($('#kycReason')?.value || '').trim() || ($('#kycQuick')?.value || '');
    const pontos = [...document.querySelectorAll<HTMLInputElement>('.vchk')].map((c) => c.checked);
    try { await bo().decidirVerificacao(d.id, aprovar, pontos, motivo); } catch (e) { return showErr('#kycErr', errText(e)); }
    closeModal(); toast(aprovar ? 'Criador aprovado' : 'Pedido rejeitado'); rerender();
  },

  async repArchive(d: Record<string, string>) {
    if (await tentar(() => bo().arquivarDenuncia(d.id), 'Denúncia arquivada')) rerender();
  },
  /** Esconde a publicação, apaga a mensagem ou termina a live. */
  async repRemove(d: Record<string, string>) {
    if (await tentar(() => bo().removerConteudoDenunciado(d.id), 'Conteúdo removido')) rerender();
  },
  /** Suspender um perfil a partir de uma denúncia. Exclusivo do admin completo. */
  async repSuspend(d: Record<string, string>) {
    const b = bo();
    let motivo = '';
    try { motivo = (await b.denuncia(d.id))?.reason || ''; } catch { /* o motivo é só para a confirmação */ }
    if (!confirm(`Suspender este perfil? A conta perde o acesso ao estúdio e deixa de receber subscrições.${motivo ? ` Motivo reportado: «${motivo}».` : ''}`)) return;
    if (await tentar(() => b.suspenderPerfilDenunciado(d.id), 'Perfil suspenso e denúncia arquivada')) rerender();
  },
  async adProfile(d: Record<string, string>) {
    try { const h = await bo().handleDoPerfil(d.id); if (h) location.hash = 'perfil-' + h; } catch (e) { toast(errText(e)); }
  },

  async payoutSet(d: Record<string, string>) {
    // Marcar como pago move dinheiro real e é irreversível: a transferência já foi feita no banco.
    if (d.s === 'paid' && !confirm('Confirmas que a transferência bancária JÁ foi feita?\n\nEsta ação não pode ser desfeita.')) return;
    if (await tentar(() => bo().mudarEstadoDoLevantamento(d.id, d.de, d.s), d.s === 'paid' ? 'Marcado como pago' : 'Em revisão')) rerender();
  },
  payoutReject(d: Record<string, string>) {
    if (!bo().pode('gerir_levantamentos')) return toast('Sem permissão para esta ação.');
    modal(`<h3>Recusar levantamento</h3><p class="small muted">O valor volta ao saldo da pessoa.</p><div class="field"><label for="poNote">Motivo</label><input id="poNote" maxlength="200" placeholder="Ex.: o IBAN não corresponde ao titular"></div><span class="err" id="poErr" hidden></span><button class="btn pri block" data-act="payoutRejectOk" data-id="${esc(d.id)}" data-de="${esc(d.de)}">Recusar</button>`);
  },
  async payoutRejectOk(d: Record<string, string>) {
    try { await bo().mudarEstadoDoLevantamento(d.id, d.de, 'rejected', $('#poNote')?.value || ''); } catch (e) { return showErr('#poErr', errText(e)); }
    closeModal(); toast('Levantamento recusado'); rerender();
  },

  async uCreatorStatus(d: Record<string, string>) {
    if (d.s === 'suspended' && !confirm('Suspender este criador? A conta perde o estúdio e as subscrições.')) return;
    if (await tentar(() => bo().mudarEstadoDoCriador(d.id, d.s), 'Estado atualizado')) rerender();
  },
  async ctResolve(d: Record<string, string>) {
    if (await tentar(() => bo().resolverPedidoDeSuporte(d.id), 'Marcada como resolvida')) rerender();
  },

  /* ---------- Banir e advertir contas ---------- */
  uBan(d: Record<string, string>) {
    if (!bo().pode('banir_contas')) return toast('Sem permissão para esta ação.');
    modal(`<h3>Banir @${esc(d.h)}</h3>
     <p class="small muted">A conta deixa de conseguir entrar. Se for criador, a página e as subscrições param.</p>
     <div class="field"><label for="banDias">Duração</label><select id="banDias">${DURACOES_BANIMENTO.map((x) => `<option value="${x.dias ?? ''}" ${x.dias === 7 ? 'selected' : ''}>${x.rotulo}</option>`).join('')}</select></div>
     <div class="field"><label for="banMotivo">Motivo</label><textarea id="banMotivo" rows="3" maxlength="300" placeholder="Ex.: fraude nos pagamentos, conteúdo proibido, assédio…"></textarea><span class="small muted">Fica registado; só a equipa e a própria pessoa o vêem.</span></div>
     <span class="err" id="banErr" hidden></span>
     <button class="btn pri block" data-act="uBanOk" data-id="${esc(d.id)}">Banir conta</button>`);
  },
  async uBanOk(d: Record<string, string>) {
    const v = $('#banDias')?.value;
    const dias = v ? Number(v) : null;
    try { await bo().banirConta({ id: d.id }, $('#banMotivo')?.value || '', dias); } catch (e) { return showErr('#banErr', errText(e)); }
    closeModal(); toast('Conta banida'); rerender();
  },
  async uUnban(d: Record<string, string>) {
    if (!confirm(`Levantar o banimento de @${d.h}? A conta volta a poder entrar.`)) return;
    if (await tentar(() => bo().levantarBanimento(d.id), 'Banimento levantado')) rerender();
  },
  uWarn(d: Record<string, string>) {
    if (!bo().pode('banir_contas')) return toast('Sem permissão para esta ação.');
    modal(`<h3>Advertir @${esc(d.h)}</h3>
     <p class="small muted">A pessoa recebe uma notificação com o motivo, e a advertência fica no histórico da conta.</p>
     <div class="field"><label for="advMotivo">Motivo</label><textarea id="advMotivo" rows="3" maxlength="300" placeholder="Ex.: linguagem ofensiva nas mensagens."></textarea></div>
     <span class="err" id="advErr" hidden></span>
     <button class="btn pri block" data-act="uWarnOk" data-id="${esc(d.id)}">Enviar advertência</button>`);
  },
  async uWarnOk(d: Record<string, string>) {
    try { await bo().advertir({ id: d.id }, $('#advMotivo')?.value || ''); } catch (e) { return showErr('#advErr', errText(e)); }
    closeModal(); toast('Advertência enviada'); rerender();
  },

  async adThread(d: Record<string, string>) {
    let r;
    try { r = await bo().mensagensDaConversa(d.id); } catch (e) { return toast(errText(e)); }
    const { mensagens: msgs, urls } = r;
    const row = (m: Linha) => `<div class="box pad stack" style="gap:4px"><div class="row between"><b style="color:var(--ink)">@${esc(m.sender_handle)}</b><span class="small muted">${fmtDate(m.created_at, true)}</span></div>
      ${m.body ? `<p style="white-space:pre-line">${esc(m.body)}</p>` : ''}
      ${m.ppv_price ? `<span class="tag acc">Conteúdo pago · ${kz(m.ppv_price)}</span>` : ''}
      ${(m.media || []).map((x: Linha) => urls[x.path] ? (x.type?.startsWith('video') ? `<video src="${esc(urls[x.path])}" controls style="max-width:220px;border-radius:8px"></video>` : `<a href="${esc(urls[x.path])}" target="_blank" rel="noopener"><img src="${esc(urls[x.path])}" style="max-width:220px;border-radius:8px;display:block"></a>`) : '<span class="small muted">(ficheiro já não disponível)</span>').join('')}
     </div>`;
    modal(`<h3>Conversa: @${esc(d.fan)} · @${esc(d.cri)}</h3><p class="small muted">Esta abertura ficou registada no histórico de auditoria.</p>
     <div class="stack" style="max-height:60vh;overflow-y:auto">${msgs.length ? msgs.map(row).join('') : '<div class="box empty">Sem mensagens.</div>'}</div>`);
  },

  promoNew() {
    if (!bo().pode('gerir_promocoes')) return toast('Sem permissão para esta ação.');
    promoForm(null);
  },
  async promoEdit(d: Record<string, string>) {
    try { const p = await bo().promocao(d.id); if (p) promoForm(p); } catch (e) { toast(errText(e)); }
  },
  async promoDel(d: Record<string, string>) {
    if (!confirm('Apagar esta promoção?')) return;
    if (await tentar(() => bo().apagarPromocao(d.id), 'Promoção apagada')) rerender();
  },
  async promoSave() {
    const content_type = $('#promoType').value;
    // Lê o subtítulo do bloco visível: cartão e vídeo têm inputs separados.
    const subtitle = (content_type === 'media' ? $('#promoMediaSubtitle') : $('#promoSubtitle'))?.value.trim() || '';
    const raw = $('#promoLink').value.trim();
    // Um link de promoção é clicado por toda a gente: só passa https/http/mailto ou rota interna.
    const link = safeHref(raw);
    if (raw && !link) return showErr('#promoErr', 'O link tem de começar por https://, mailto: ou # (rota interna).');
    const title = $('#promoTitle').value.trim();
    const eHtml = content_type === 'html';
    const dados: Linha = {
      title: title || (eHtml ? 'Anúncio HTML' : ''), subtitle: subtitle || null, link_url: link || null,
      sort_order: +$('#promoSort').value || 0, active: $('#promoActive').checked, content_type,
      position: $('input[name=promoCol]:checked')?.value || 'esquerda',
      mobile_slot: $('#promoSlot').value ? Number($('#promoSlot').value) : null,
      pinned: $('input[name=promoShow]:checked')?.value === 'fixa',
      cta: $('#promoCta').value.trim() || null,
      image_url: eHtml ? null : S.promoImageUrl || null, mobile_image_url: eHtml ? null : S.promoMobileImageUrl || null,
      media_type: content_type === 'media' ? S.promoMediaType || null : null,
      html: eHtml ? $('#promoHtml').value : null, mobile_html: eHtml ? ($('#promoHtmlMobile').value.trim() || null) : null,
    };
    const btn = $('#promoBtn'); busy(btn, true, 'A guardar…');
    try {
      await bo().guardarPromocao(S.promoEditId || null, dados, { principal: S.promoFile, mobile: S.promoFileMobile });
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
    <label class="drop">${ic('upload', 'style="width:22px;height:22px"')}<b style="color:var(--ink)">Imagem para computador — vertical, recomendado 600 × 1200 px (1:2)</b><span class="small muted" id="promoF">${ct === 'card' && p?.image_url ? 'Já tem imagem, escolhe para substituir' : 'JPG ou PNG'}</span><input type="file" accept="image/*" id="promoFile"></label>
    <label class="drop">${ic('upload', 'style="width:22px;height:22px"')}<b style="color:var(--ink)">Imagem para telemóvel — horizontal, recomendado 1200 × 600 px (2:1)</b><span class="small muted" id="promoFM">${ct === 'card' && p?.mobile_image_url ? 'Já tem imagem mobile, escolhe para substituir' : 'Só se quiseres um recorte diferente em ecrãs pequenos'}</span><input type="file" accept="image/*" id="promoFileMobile"></label>
   </div>
   <div id="promoMediaFields" ${ct !== 'media' ? 'hidden' : ''}>
    <div class="field"><label for="promoMediaSubtitle">Legenda sobre o vídeo (opcional)</label><input id="promoMediaSubtitle" maxlength="120" value="${ct === 'media' ? esc(p?.subtitle || '') : ''}" placeholder="Ex.: Nova coleção disponível"></div>
    <label class="drop">${ic('upload', 'style="width:22px;height:22px"')}<b style="color:var(--ink)">Vídeo ou GIF para computador — vertical (1:2)</b><span class="small muted" id="promoMediaF">${ct === 'media' && p?.image_url ? 'Já tem ficheiro, escolhe para substituir' : 'MP4 ou GIF, toca sozinho e em loop'}</span><input type="file" accept="video/mp4,image/gif" id="promoMediaFile"></label>
    <label class="drop">${ic('upload', 'style="width:22px;height:22px"')}<b style="color:var(--ink)">Vídeo ou GIF para telemóvel — horizontal (2:1, opcional)</b><span class="small muted" id="promoMediaFM">${ct === 'media' && p?.mobile_image_url ? 'Já tem ficheiro mobile, escolhe para substituir' : 'Só se quiseres um vídeo/GIF diferente em ecrãs pequenos'}</span><input type="file" accept="video/mp4,image/gif" id="promoMediaFileMobile"></label>
   </div>
   <div id="promoHtmlFields" ${ct !== 'html' ? 'hidden' : ''}>
    <div class="field"><label for="promoHtml">Código HTML (desktop)</label><textarea id="promoHtml" rows="6" placeholder="&lt;div style=&quot;...&quot;&gt;o teu anúncio&lt;/div&gt;">${esc(p?.html || '')}</textarea><span class="small muted">Inserido tal como está na página. Deve ser responsivo por si só (usa % em vez de pixels fixos); usa apenas HTML de confiança.</span></div>
    <div class="field"><label for="promoHtmlMobile">Código HTML mobile (opcional)</label><textarea id="promoHtmlMobile" rows="5" placeholder="Deixa em branco para usar o mesmo HTML em telemóvel">${esc(p?.mobile_html || '')}</textarea></div>
   </div>
   <div class="field"><label for="promoLink">Link ao tocar (opcional, ignorado no HTML personalizado)</label><input id="promoLink" value="${esc(p?.link_url || '')}" placeholder="#explorar ou https://..."></div>
   <div class="field"><label for="promoCta">Texto do botão</label><input id="promoCta" maxlength="30" value="${esc(p?.cta || '')}" placeholder="${TEXTO_BOTAO_PADRAO}"><span class="small muted">Em branco fica «${TEXTO_BOTAO_PADRAO}». O botão aparece centrado e a pulsar.</span></div>
   <fieldset class="pfields"><legend>Onde aparece</legend>
    <div class="field"><span class="flabel">No computador</span><div class="row wrapf" style="gap:8px">${(['esquerda', 'direita'] as const).map((c) => `<label class="opt" style="flex:1"><input type="radio" name="promoCol" value="${c}" ${colunaDe(p?.position) === c ? 'checked' : ''}><span><b>Coluna ${c}</b><span>${c === 'esquerda' ? 'Sozinho, ao lado do feed' : 'Por cima de «Sugestões para ti»'}</span></span></label>`).join('')}</div></div>
    <div class="field"><label for="promoSlot">No telemóvel</label><select id="promoSlot"><option value="" ${p?.mobile_slot ? '' : 'selected'}>Automática (muda a cada visita, entre a 1.ª e a 3.ª)</option>${POSICOES_TELEMOVEL.map((n) => `<option value="${n}" ${p?.mobile_slot === n ? 'selected' : ''}>Depois da ${n}.ª publicação</option>`).join('')}</select></div>
    <div class="field"><span class="flabel">Exibição</span><div class="row wrapf" style="gap:8px">
     <label class="opt" style="flex:1"><input type="radio" name="promoShow" value="roda" ${p?.pinned ? '' : 'checked'}><span><b>Roda com as outras</b><span>Uma promoção por visita, pela ordem</span></span></label>
     <label class="opt" style="flex:1"><input type="radio" name="promoShow" value="fixa" ${p?.pinned ? 'checked' : ''}><span><b>Fixa</b><span>Aparece sempre esta (ex.: campanha)</span></span></label>
    </div></div>
   </fieldset>
   <div class="field"><label for="promoSort">Ordem na rotação (menor aparece primeiro)</label><input id="promoSort" type="number" value="${p?.sort_order ?? 0}"></div>
   <label class="check"><input type="checkbox" id="promoActive" ${p?.active !== false ? 'checked' : ''}><span>Ativa (visível no site)</span></label>
   <span class="err" id="promoErr" hidden></span><button class="btn pri block" data-act="promoSave" id="promoBtn">Guardar</button>`);
}

/** Mudanças em campos da administração fora dos formulários habituais (ex.: o menu de papel na lista de utilizadores). */
export async function adminChange(t: FormControl) {
  if (t.dataset?.act === 'uRoleSel') {
    if (await tentar(() => bo().mudarPapel(t.dataset.id!, t.value), 'Papel atualizado')) rerender();
    else rerender(); // volta a mostrar o papel verdadeiro no menu
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
  const entradas = [...document.querySelectorAll<HTMLInputElement>('.setinp')].map((i) => ({ key: i.dataset.key!, raw: i.value }));
  // O domínio valida tudo (cada campo e a taxa face ao criador) ANTES de gravar qualquer linha.
  try { await bo().gravarDefinicoes(entradas); } catch (e) { showErr('#setErr', errText(e)); return true; }
  await loadCfg();
  toast('Definições guardadas');
  return true;
}

register({ actions: adminActions, submit: adminSubmit, change: adminChange });
