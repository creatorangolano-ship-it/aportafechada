// Estúdio do criador: resumo, publicações, lives, subscritores, perfil, ganhos, afiliados
import { sb, $, $$, esc, kz, dots, ic, avatarOf, toast, modal, closeModal, showErr, errText, fmtDate, ago, monthName, upload, publicUrl, safeName, blurPreview, shrinkImage, cropImage, assertImage, uuid, busy, copyText, rerender, go } from '../lib';
import { register } from '../registry';
const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** `esc()` não protege um URL dentro de url('…') — ver nota em fan.js. */
const cssUrl = (u: any) => `url("${String(u || '').replace(/["'\\()<>]/g, encodeURIComponent)}")`;
import { S, refreshMe, netPct } from '../state';
import { CATS, CITIES, BANKS } from '../config';
import { startOnboarding } from './public';

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

const TABS = [['visao', 'Visão geral', 'home'], ['publicacoes', 'Publicações', 'doc'], ['nova', 'Nova publicação', 'plus'], ['lives', 'Lives', 'live'], ['subscritores', 'Subscritores', 'users'], ['perfil', 'Perfil de criador', 'user'], ['ganhos', 'Ganhos', 'coin'], ['afiliados', 'Afiliados', 'link']];

function statusBanner(c: any) {
  if (c.status === 'pending') return `<div class="banner">${ic('clock')}<span><b>Conta em verificação.</b> Já podes preparar o perfil e as publicações. Ficam visíveis e podes receber pagamentos depois de aprovarmos os documentos, normalmente em 48 horas.</span></div>`;
  if (c.status === 'rejected') return `<div class="banner">${ic('info')}<span><b>A tua verificação não foi aprovada.</b>${S.kycReason ? ' Motivo: ' + esc(S.kycReason) + '.' : ''} <button class="btn link small" data-act="appeal">Recorrer</button></span></div>`;
  if (c.status === 'suspended') return `<div class="banner">${ic('info')}<span><b>Conta suspensa.</b> Fala com o apoio através da página de contacto.</span></div>`;
  return '';
}

function chartSVG(months: any) {
  const W = 640, H = 230, L = 64, R = 18, T = 22, B = 30;
  const vals = months.map((m: any) => Number(m.v));
  const top = Math.max(1000, ...vals), step = Math.pow(10, Math.floor(Math.log10(top))), max = Math.ceil(top / step) * step;
  const x = (i: any) => L + i * (W - L - R) / Math.max(1, months.length - 1), y = (v: any) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, .25, .5, .75, 1].map((k) => Math.round(max * k));
  const pts = vals.map((v: any, i: any) => [x(i), y(v)]);
  const line = pts.map((p: any, i: any) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const cs = getComputedStyle(document.documentElement), col = (n: any) => cs.getPropertyValue(n).trim();
  const acc = col('--acc'), mut = col('--muted'), ln = col('--line'), ink = col('--ink'), sf = col('--surface');
  const last = pts.length - 1;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Receita bruta por mês nos últimos seis meses">
   <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${acc}" stop-opacity=".16"/><stop offset="1" stop-color="${acc}" stop-opacity="0"/></linearGradient></defs>
   ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="${ln}"/><text x="${L - 10}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="${mut}" font-family="Archivo,sans-serif">${dots(t)}</text>`).join('')}
   ${months.map((m: any, i: any) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="11.5" fill="${mut}" font-family="Archivo,sans-serif">${monthName(m.m)}</text>`).join('')}
   <path d="${line} L${x(last)} ${y(0)} L${x(0)} ${y(0)} Z" fill="url(#ga)"/>
   <path d="${line}" fill="none" stroke="${acc}" stroke-width="2" stroke-linejoin="round"/>
   ${pts.map((p: any, i: any) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === last ? 5 : 4}" fill="${i === last ? acc : sf}" stroke="${acc}" stroke-width="2"><title>${monthName(months[i].m)}: ${kz(vals[i])}</title></circle>`).join('')}
   <text x="${pts[last][0] - 10}" y="${pts[last][1] - 12}" text-anchor="end" font-size="12" font-weight="700" fill="${ink}" font-family="Archivo,sans-serif">${kz(vals[last])}</text></svg>`;
}

const accessTag = (p: any) => p.access === 'free' ? '<span class="tag plain">Grátis</span>' : p.access === 'subscribers' ? '<span class="tag acc">Subscritores</span>' : `<span class="tag warn">Avulso · ${kz(p.price)}</span>`;
function postsTable(list: any, actions = true) {
  if (!list.length) return `<div class="box empty">Ainda não publicaste nada. <button class="btn link" data-act="stTab" data-v="nova">Criar a primeira publicação</button></div>`;
  return `<div class="tw"><table><thead><tr><th>Publicação</th><th>Acesso</th><th class="num">Gostos</th><th>Publicado</th>${actions ? '<th></th>' : ''}</tr></thead><tbody>
   ${list.map((p: any) => `<tr><td><div class="row">${p.preview_url ? `<img loading="lazy" decoding="async" class="thumb" src="${esc(p.preview_url)}" alt="">` : `<span class="thumb">${ic('doc')}</span>`}<span>${esc(p.title)}${p.status !== 'published' ? ` <span class="tag plain">${p.status === 'hidden' ? 'Removida' : 'Rascunho'}</span>` : ''}</span></div></td>
   <td>${accessTag(p)}</td><td class="num">${dots(p.like_count)}</td><td>${ago(p.published_at || p.created_at)}</td>
   ${actions ? `<td><div class="row" style="gap:6px;justify-content:flex-end">${p.status === 'draft' ? `<button class="btn pri sm" data-act="pubDraft" data-id="${p.id}">Publicar</button>` : ''}<a class="btn out sm" href="#p-${p.id}">Ver</a><button class="btn out sm" data-act="delPost" data-id="${p.id}">${S.confirmDel === p.id ? 'Confirmar' : 'Apagar'}</button></div></td>` : ''}</tr>`).join('')}
   </tbody></table></div>`;
}

async function tabVisao(c: any) {
  const [{ data: st }, { data: posts }] = await Promise.all([
    sb.rpc('creator_stats'),
    sb.from('posts').select('*').eq('creator_id', c.id).order('created_at', { ascending: false }).limit(4),
  ]);
  const s = st || { month_gross: 0, month_net: 0, months: [], new_subs_month: 0 };
  const hasData = (s.months || []).some((m: any) => Number(m.v) > 0);
  return `<div class="pagehead"><div><h1>Olá, ${esc((me_().name || me_().handle).split(' ')[0])}</h1><p>Resumo deste mês.</p></div><button class="btn pri" data-act="stTab" data-v="nova">${ic('plus')}Nova publicação</button></div>
   <div class="kpis">
    <div class="kpi"><div class="l">Subscritores ativos</div><div class="v">${dots(c.subscriber_count)}</div><div class="s">${s.new_subs_month ? `<span class="up">+${s.new_subs_month}</span> este mês` : 'Nenhum novo este mês'}</div></div>
    <div class="kpi"><div class="l">Receita bruta do mês</div><div class="v">${kz(s.month_gross)}</div><div class="s">Recebes ${kz(s.month_net)}</div></div>
    <div class="kpi"><div class="l">Seguidores</div><div class="v">${dots(c.follower_count)}</div><div class="s">${dots(c.post_count)} publicações</div></div>
    <div class="kpi"><div class="l">Saldo para levantar</div><div class="v">${kz(me_().earnings_balance)}</div><div class="s">${me_().earnings_balance >= S.cfg.min_payout ? '<button class="btn link small" data-act="stTab" data-v="ganhos">Levantar</button>' : `Mínimo ${kz(S.cfg.min_payout)}`}</div></div>
   </div>
   ${hasData ? `<div class="box chart"><div class="row between wrapf" style="margin-bottom:10px"><h3>Receita por mês</h3><span class="small muted">Kz, valores brutos</span></div>${chartSVG(s.months)}</div>`
     : `<div class="box pad stack"><h3>Primeiros passos</h3>${[['Verificação de identidade aprovada', c.status === 'approved'], ['Foto de perfil e capa', !!(me_().avatar_url && c.cover_url)], ['Primeira publicação', c.post_count > 0], ['Partilhar o link do perfil nas redes', false]].map(([l, d]) => `<div class="row">${d ? `<span class="tag ok">${ic('check')}Feito</span>` : '<span class="tag plain">Por fazer</span>'}<span>${l}</span></div>`).join('')}<div class="row wrapf"><button class="btn out sm" data-act="copyProfile">${ic('copy')}Copiar link do perfil</button></div></div>`}
   <div class="sech"><h3>Publicações recentes</h3>${(posts || []).length ? '<button class="btn link" data-act="stTab" data-v="publicacoes">Ver todas</button>' : ''}</div>${postsTable(posts || [], false)}`;
}

async function tabPublicacoes(c: any) {
  const { data } = await sb.from('posts').select('*').eq('creator_id', c.id).order('created_at', { ascending: false }).limit(200);
  return `<div class="pagehead"><div><h1>Publicações</h1><p>${(data || []).length} publicações.</p></div><button class="btn pri" data-act="stTab" data-v="nova">${ic('plus')}Nova publicação</button></div>${postsTable(data || [])}`;
}

function tabNova(c: any) {
  const d = S.draft || { title: '', body: '', access: 'subscribers', price: 2500 };
  const files = S.draftFiles || [];
  return `<div class="pagehead"><div><h1>Nova publicação</h1><p>Escolhe quem pode ver antes de publicar.</p></div></div>
   <form class="box pad stack" id="postForm" novalidate>
    <div class="field"><div class="row between"><label for="pTitle">Título</label><span class="small muted num" id="tCount">${d.title.length}/100</span></div><input id="pTitle" maxlength="100" value="${esc(d.title)}" placeholder="Ex.: Um dia comigo em Luanda"></div>
    <div class="field"><div class="row between"><label for="pDesc">Texto</label><span class="small muted num" id="dCount">${d.body.length}/2.000</span></div><textarea id="pDesc" maxlength="2000" placeholder="O que vão encontrar nesta publicação">${esc(d.body)}</textarea></div>
    <div class="field"><span class="flabel">Fotografias e vídeos</span><label class="drop">${ic('upload', 'style="width:24px;height:24px"')}<b style="color:var(--ink)">Escolher ficheiros</b><span class="small muted">JPG, PNG ou MP4. Até 10 ficheiros, 500 MB cada.</span><input type="file" id="pFile" multiple accept="image/*,video/mp4,video/quicktime" aria-label="Escolher ficheiros"></label>
     ${files.length ? `<div class="filelist">${files.map((f) => `<span>${esc(f.name)}</span>`).join('')}</div>` : ''}</div>
    <div class="field"><span class="flabel">Quem pode ver</span><div class="opts">
     ${[['free', 'Todos', 'Grátis, visível no perfil'], ['subscribers', c.price ? 'Subscritores' : 'Seguidores', c.price ? 'Incluído na subscrição' : 'Quem te segue'], ['paid', 'Compra à parte', 'Pagamento único']].map(([v, l, s]) => `<label class="opt"><input type="radio" name="acc" value="${v}" ${d.access === v ? 'checked' : ''}><span><b>${l}</b><span>${s}</span></span></label>`).join('')}
    </div></div>
    <div class="field" id="priceRow" ${d.access === 'paid' ? '' : 'hidden'} style="max-width:280px"><label for="pPrice">Preço (Kz)</label><input id="pPrice" type="number" min="${S.cfg.min_price}" step="100" value="${d.price}"><span class="hint">Recebes ${netPct()}% de cada venda.</span></div>
    <div class="progress" id="pProg" hidden><i style="width:0"></i></div>
    <span class="err" id="pErr" hidden></span>
    <div class="actions"><button type="button" class="btn out" data-act="saveDraft">Guardar como rascunho</button><button class="btn pri" id="pBtn">Publicar</button></div>
   </form>`;
}

async function tabLives(c: any) {
  const { data } = await sb.from('lives').select('*').eq('creator_id', c.id).order('starts_at', { ascending: false }).limit(30);
  const ids = (data || []).map((l) => l.id);
  const { data: sold } = ids.length ? await sb.from('orders').select('target_id').eq('kind', 'ticket').eq('status', 'paid').in('target_id', ids) : { data: [] };
  const n = (id: any) => (sold || []).filter((x) => x.target_id === id).length;
  const now = new Date(Date.now() + 3600e3), def = now.toISOString().slice(0, 10);
  return `<div class="pagehead"><div><h1>Lives</h1><p>Transmites a partir do navegador, com câmara e microfone. Quem te segue, subscreve ou tem bilhete recebe uma notificação quando começas.</p></div></div>
   <div class="two"><div class="stack">${(data || []).length ? (data || []).map((l) => `<div class="box pad row between wrapf"><div><b style="color:var(--ink)">${esc(l.title)}</b><div class="small muted">${l.status === 'live' ? 'Ao vivo agora' : l.status === 'ended' ? 'Terminada' : fmtDate(l.starts_at, true)} · ${l.price ? 'bilhete ' + kz(l.price) + ' · ' + n(l.id) + ' vendidos' : 'entrada livre'}</div></div>
     <div class="row" style="gap:8px">${l.status === 'live' ? `<a class="btn pri sm" href="#live-${l.id}">Abrir</a><button class="btn out sm" data-act="liveEnd" data-id="${l.id}">Terminar</button>` : l.status === 'ended' ? '<span class="tag plain">Terminada</span>' : `<a class="btn pri sm" href="#live-${l.id}">Começar</a><button class="btn out sm" data-act="liveDel" data-id="${l.id}">Cancelar</button>`}</div></div>`).join('') : '<div class="box empty">Ainda não fizeste nenhuma live.</div>'}</div>
   <form class="box pad stack" id="liveNewForm" novalidate><h3>Nova live</h3>
    <div class="stack" style="gap:8px"><label class="opt"><input type="radio" name="lvWhen" value="now" checked><span><b>Começar agora</b><span>Entras em directo assim que confirmares.</span></span></label>
    <label class="opt"><input type="radio" name="lvWhen" value="later"><span><b>Agendar</b><span>Escolhes o dia e a hora; os fãs podem pedir lembrete.</span></span></label></div>
    <div class="field"><label for="lvTitle">Título</label><input id="lvTitle" maxlength="80" placeholder="Ex.: Conversa com os subscritores"></div>
    <div class="grid2" id="lvWhenRow" hidden><div class="field"><label for="lvDate">Dia</label><input id="lvDate" type="date" min="${new Date().toISOString().slice(0, 10)}" value="${def}"></div><div class="field"><label for="lvTime">Hora</label><input id="lvTime" type="time" value="20:00"></div></div>
    <div class="field"><label for="lvPrice">Bilhete (Kz)</label><input id="lvPrice" type="number" min="0" step="100" value="0"><span class="hint">0 para entrada livre. Mínimo 200 Kz quando é pago.</span></div>
    <span class="err" id="lvErr" hidden></span>
    <button class="btn pri" id="lvBtn" ${c.status === 'approved' ? '' : 'disabled'}>Começar agora</button>${c.status === 'approved' ? '' : '<span class="small muted">Disponível depois de a conta ser verificada.</span>'}</form></div>`;
}

async function tabSubs(c: any) {
  const { data } = await sb.rpc('my_subscribers');
  const list = data || [];
  return `<div class="pagehead"><div><h1>Subscritores</h1><p>${dots(c.subscriber_count)} ativos.</p></div></div>
   <div class="two">${list.length ? `<div class="tw"><table style="min-width:440px"><thead><tr><th>Subscritor</th><th>Desde</th><th>Estado</th></tr></thead><tbody>${list.map((s: any) => { const on = s.status === 'active' && new Date(s.current_period_end) > new Date(); return `<tr><td><div class="row">${avatarOf(s, 'sm')}${esc(s.name || s.handle)}</div></td><td>${fmtDate(s.started_at)}</td><td>${on ? (s.auto_renew ? '<span class="tag ok">Ativa</span>' : '<span class="tag warn">Não renova</span>') : '<span class="tag plain">Terminada</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="box empty">Quando alguém subscrever, aparece aqui.</div>'}
   <form class="box pad stack" id="priceForm" novalidate><h3>Subscrição</h3><p class="small muted">Decides se cobras ou não. Quem já subscreve mantém o preço até à próxima renovação.</p>
    <div class="stack" style="gap:8px"><label class="opt"><input type="radio" name="pmode" value="free" ${c.price ? '' : 'checked'}><span><b>Perfil gratuito</b><span>Quem te segue vê o conteúdo para seguidores.</span></span></label>
    <label class="opt"><input type="radio" name="pmode" value="paid" ${c.price ? 'checked' : ''}><span><b>Subscrição paga</b><span>Os fãs pagam por mês.</span></span></label></div>
    <div class="field" id="sPriceRow" ${c.price ? '' : 'hidden'}><label for="priceInp">Valor mensal (Kz)</label><input id="priceInp" type="number" min="${S.cfg.min_price}" step="100" value="${c.price || 2500}"><span class="hint">Mínimo ${kz(S.cfg.min_price)}. Recebes ${netPct()}%.</span></div>
    <button class="btn pri">Guardar</button></form></div>`;
}

function tabPerfil(c: any) {
  return `<div class="pagehead"><div><h1>Perfil de criador</h1><p>O que os fãs veem no teu perfil.</p></div><a class="btn out" href="#perfil-${esc(me_().handle)}">Ver o meu perfil</a></div>
   <div class="two"><form class="box pad stack" id="crForm" novalidate>
    <div class="grid2"><div class="field"><label for="crCat">Categoria</label><select id="crCat">${CATS.map((x) => `<option ${c.category === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label for="crCity">Cidade</label><select id="crCity">${CITIES.map((x) => `<option ${c.city === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
    <div class="field"><label for="crBio">Apresentação</label><textarea id="crBio" maxlength="500">${esc(c.bio)}</textarea></div>
    <span class="err" id="crErr" hidden></span><button class="btn pri" style="align-self:flex-start">Guardar</button></form>
   <div class="stack">
    <div class="box pad stack"><h3>Foto de perfil</h3><div class="row">${avatarOf(S.me, 'lg')}<label class="btn out sm" style="position:relative">Mudar foto<input type="file" accept="image/*" id="avatarFile" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div></div>
    <div class="box pad stack"><h3>Capa</h3><div class="cover" style="height:120px;${c.cover_url ? `background-image:${cssUrl(c.cover_url)}` : ''}"></div><label class="btn out sm" style="position:relative;align-self:flex-start">Mudar capa<input type="file" accept="image/*" id="coverFile" style="position:absolute;inset:0;opacity:0;cursor:pointer"></label></div>
   </div></div>`;
}

export async function payoutBlock() {
  const [{ data: bank }, { data: pays }] = await Promise.all([
    sb.from('payout_info').select('*').eq('user_id', me_().id).maybeSingle(),
    sb.from('payouts').select('*').eq('user_id', me_().id).order('created_at', { ascending: false }).limit(30),
  ]);
  const st = (s: any) => s === 'paid' ? `<span class="tag ok">${ic('check')}Pago</span>` : s === 'rejected' ? '<span class="tag plain">Recusado</span>' : s === 'review' ? '<span class="tag info">Em revisão</span>' : '<span class="tag warn">Pendente</span>';
  const bal = Number(me_().earnings_balance), blocked = S.creator && S.creator.status !== 'approved';
  return `<div class="two"><div class="stack">
    <div class="tw"><table style="min-width:420px"><thead><tr><th>Pedido</th><th class="num">Valor</th><th>Estado</th></tr></thead><tbody>${(pays || []).length ? (pays || []).map((p) => `<tr><td>${fmtDate(p.created_at)}${p.note ? `<div class="small muted">${esc(p.note)}</div>` : ''}</td><td class="num">${kz(p.amount)}</td><td>${st(p.status)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">Ainda sem levantamentos.</td></tr>'}</tbody></table></div>
    <form class="box pad stack" id="bankForm" novalidate><h3>Conta bancária</h3>
     <div class="grid2"><div class="field"><label for="bkBank">Banco</label><select id="bkBank">${BANKS.map((b) => `<option ${bank?.bank === b ? 'selected' : ''}>${b}</option>`).join('')}</select></div><div class="field"><label for="bkHolder">Titular</label><input id="bkHolder" value="${esc(bank?.holder || me_().name || '')}"></div></div>
     <div class="field"><label for="bkIban">IBAN</label><input id="bkIban" value="${esc(bank?.iban || '')}" placeholder="AO06 …"></div>
     <span class="err" id="bkErr" hidden></span><button class="btn out" style="align-self:flex-start">Guardar conta</button></form>
   </div>
   <form class="box pad stack" id="wdForm" novalidate><h3>Pedir levantamento</h3>
    <div class="field"><label for="wdAmt">Valor (Kz)</label><input id="wdAmt" type="number" min="${S.cfg.min_payout}" step="500" value="${bal >= S.cfg.min_payout ? bal : ''}" ${bal >= S.cfg.min_payout && !blocked ? '' : 'disabled'}><span class="hint">Mínimo ${kz(S.cfg.min_payout)}. Disponível: ${kz(bal)}.</span></div>
    <p class="small muted">A equipa aprova o pedido e o dinheiro chega em 2 a 4 dias úteis.</p>
    <span class="err" id="wdErr" hidden></span>
    <button class="btn pri" ${bal >= S.cfg.min_payout && bank && !blocked ? '' : 'disabled'}>Pedir levantamento</button>
    ${!bank ? '<span class="small muted">Guarda primeiro a conta bancária.</span>' : blocked ? '<span class="small muted">Disponível depois de a conta ser verificada.</span>' : ''}</form></div>`;
}

async function tabGanhos() {
  const { data: st } = await sb.rpc('creator_stats');
  const bk = (st?.by_kind ?? {}) as Record<string, number>, tot = Object.values(bk).reduce((a, b) => a + b, 0);
  const L: Record<string, string> = { subscription: 'Subscrições', post: 'Publicações pagas', message: 'Mensagens pagas', ticket: 'Bilhetes de lives', tip: 'Gorjetas' };
  return `<div class="pagehead"><div><h1>Ganhos</h1><p>A plataforma fica com ${S.cfg.fee_pct}% de cada venda. Recebes ${netPct()}%.</p></div></div>
   <div class="kpis"><div class="kpi"><div class="l">Receita bruta do mês</div><div class="v">${kz(st?.month_gross || 0)}</div></div><div class="kpi"><div class="l">Recebes deste mês</div><div class="v">${kz(st?.month_net || 0)}</div></div><div class="kpi"><div class="l">Saldo para levantar</div><div class="v">${kz(me_().earnings_balance)}</div></div></div>
   ${tot ? `<div class="tw" style="margin-bottom:22px"><table style="min-width:400px"><thead><tr><th>Origem (este mês)</th><th class="num">Valor</th><th class="num">Parte</th></tr></thead><tbody>${Object.entries(bk).map(([k, v]) => `<tr><td>${L[k] || k}</td><td class="num">${kz(v)}</td><td class="num">${Math.round(v / tot * 100)}%</td></tr>`).join('')}</tbody></table></div>` : ''}
   ${await payoutBlock()}`;
}

export async function affiliateBlock() {
  const { data: a } = await sb.rpc('affiliate_stats');
  const link = `${location.origin}${location.pathname}?ref=${encodeURIComponent(me_().handle)}`;
  const K: Record<string, string> = { subscription: 'Subscrição', post: 'Publicação', message: 'Mensagem', ticket: 'Bilhete', tip: 'Gorjeta' };
  return `<div class="pagehead"><div><h1>Afiliados</h1><p>Partilha o teu link. Ganhas ${S.cfg.affiliate_pct}% sobre subscrições, gorjetas e compras de quem se registar através dele, e sobre as vendas dos criadores que convidares.</p></div></div>
   <div class="box pad stack" style="margin-bottom:22px"><label class="flabel" for="affLink">O teu link</label><div class="row wrapf"><input class="inp" id="affLink" readonly value="${esc(link)}" style="flex:1;min-width:200px"><button class="btn pri" data-act="copy" data-v="${esc(link)}">${ic('copy')}Copiar</button></div></div>
   <div class="kpis"><div class="kpi"><div class="l">Pessoas registadas</div><div class="v">${dots(a?.referred || 0)}</div></div><div class="kpi"><div class="l">Comissões ganhas</div><div class="v">${kz(a?.earned || 0)}</div></div></div>
   ${(a?.recent || []).length ? `<div class="tw"><table><thead><tr><th>Pessoa</th><th>Movimento</th><th class="num">Comissão</th><th>Data</th></tr></thead><tbody>${a.recent.map((r: any) => `<tr><td>@${esc(r.handle)}</td><td>${K[r.kind] || r.kind}</td><td class="num">${kz(r.amount)}</td><td>${fmtDate(r.created_at)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="box empty">Quando alguém se registar com o teu link e comprar, aparece aqui.</div>'}`;
}

export async function vEstudio() {
  const c = S.creator; if (!c) { go('conta'); return ''; }
  if (c.status === 'rejected') { const { data: k } = await sb.from('kyc_requests').select('reason').eq('user_id', c.id).order('created_at', { ascending: false }).limit(1).maybeSingle(); S.kycReason = k?.reason || ''; }
  const t = S.stTab;
  let b = '';
  if (t === 'visao') b = await tabVisao(c);
  else if (t === 'publicacoes') b = await tabPublicacoes(c);
  else if (t === 'nova') b = tabNova(c);
  else if (t === 'lives') b = await tabLives(c);
  else if (t === 'subscritores') b = await tabSubs(c);
  else if (t === 'perfil') b = tabPerfil(c);
  else if (t === 'ganhos') b = await tabGanhos();
  else b = await affiliateBlock();
  return `<div class="dash"><aside class="side" aria-label="Estúdio">${TABS.map(([k, l, i]) => `<button class="${t === k ? 'on' : ''}" data-act="stTab" data-v="${k}">${ic(i)}${l}</button>`).join('')}</aside><div>${statusBanner(c)}${b}</div></div>`;
}

/* ---------- Ações ---------- */
function readDraft() {
  const a = $('input[name=acc]:checked');
  // ?? e não ||: um criador que escreve 0 de propósito recebia 2500 sem aviso.
  S.draft = { title: $('#pTitle')?.value || '', body: $('#pDesc')?.value || '', access: a ? a.value : 'subscribers', price: +($('#pPrice')?.value ?? 2500) };
}
async function savePost(status: any, btn: any) {
  readDraft();
  const d = S.draft!, files = S.draftFiles || [];
  if (d.title.trim().length < 3) return showErr('#pErr', 'Dá um título à publicação, com pelo menos 3 caracteres.');
  if (d.access === 'paid' && !(d.price >= S.cfg.min_price)) return showErr('#pErr', `O preço mínimo é ${kz(S.cfg.min_price)}.`);
  busy(btn, true, 'A enviar…');
  const prog = $('#pProg'); if (prog && files.length) prog.hidden = false;
  try {
    const id = uuid(), uid = me_().id, media = [];
    let i = 0;
    for (const f of files) {
      const path = await upload('content', `${uid}/${id}/${i}-${safeName(f.name)}`, f);
      media.push({ path, type: f.type }); i++;
      if (prog) prog.firstElementChild.style.width = (i / files.length * 100) + '%';
    }
    let preview_url = null;
    const firstImg = files.find((f) => f.type.startsWith('image/'));
    if (firstImg) {
      const blob = await blurPreview(firstImg);
      if (blob) { const p = `${uid}/${id}.jpg`; await upload('previews', p, new File([blob], 'p.jpg', { type: 'image/jpeg' }), { upsert: true }); preview_url = publicUrl('previews', p); }
    }
    const { error } = await sb.from('posts').insert({ id, creator_id: uid, title: d.title.trim(), access: d.access, price: d.access === 'paid' ? d.price : 0, media, preview_url, status, published_at: status === 'published' ? new Date().toISOString() : null });
    if (error) throw error;
    const { error: e2 } = await sb.from('post_bodies').insert({ post_id: id, body: d.body.trim() });
    if (e2) {
      // A publicação já existe mas ficou sem texto. Sem desfazer, sobrava um post órfão e os
      // ficheiros já carregados ficavam lá para sempre sem forma de os limpar.
      await sb.from('posts').delete().eq('id', id).eq('creator_id', uid);
      for (const m of media) await sb.storage.from('content').remove([m.path]).catch(() => { /* já não existe */ });
      if (preview_url) await sb.storage.from('previews').remove([`${uid}/${id}.jpg`]).catch(() => { /* já não existe */ });
      throw new Error('Não foi possível guardar o texto da publicação. Nada foi publicado — tenta outra vez.');
    }
    S.draft = null; S.draftFiles = []; S.stTab = 'publicacoes';
    await refreshMe();
    toast(status === 'draft' ? 'Rascunho guardado' : S.creator!.status === 'approved' ? 'Publicado' : 'Guardado. Fica visível depois da verificação.');
    rerender(false);
  } catch (e) { busy(btn, false); showErr('#pErr', errText(e)); }
}

export const studioActions = {
  stTab(d: Record<string, string>) { S.stTab = d.v; S.confirmDel = null; rerender(false); },
  stGo(d: Record<string, string>) { S.stTab = d.v; go('estudio'); },
  kycAgain() { startOnboarding(true); go('registar'); },
  appeal() {
    modal(`<h3>Recorrer da decisão</h3>${S.kycReason ? `<p class="small muted">Motivo da rejeição: <b>${esc(S.kycReason)}</b></p>` : ''}
     <div class="field"><label for="apText">Explica o que corrigiste</label><textarea id="apText" maxlength="500" style="min-height:90px"></textarea></div>
     <label class="check"><input type="checkbox" id="apDocs" checked><span>Quero enviar documentos novos</span></label>
     <span class="err" id="apErr" hidden></span><button class="btn pri block" data-act="appealGo" id="apBtn">Continuar</button>`);
  },
  async appealGo() {
    if (!S.me) return toast('A sessão expirou. Entra outra vez.');
    const t = ($('#apText')?.value || '').trim(), docs = $('#apDocs')?.checked;
    if (t.length < 10) return showErr('#apErr', 'Escreve pelo menos 10 caracteres.');
    if (docs) { closeModal(); startOnboarding(true, t); return go('registar'); }
    const { error } = await sb.rpc('appeal_kyc', { p_text: t });
    if (error) return showErr('#apErr', errText(error));
    closeModal(); await refreshMe(); toast('Recurso enviado. Respondemos em até 48 horas.'); rerender();
  },
  copyProfile() { copyText(`${location.origin}${location.pathname}?ref=${encodeURIComponent(me_().handle)}#perfil-${encodeURIComponent(me_().handle)}`); },
  copy(d: Record<string, string>) { copyText(d.v); },
  saveDraft() { savePost('draft', $('[data-act=saveDraft]')); },
  async delPost(d: Record<string, string>) {
    if (S.confirmDel !== d.id) { S.confirmDel = d.id; return rerender(); }
    const { data: p } = await sb.from('posts').select('media').eq('id', d.id).single();
    const { error } = await sb.from('posts').delete().eq('id', d.id);
    if (error) return toast(errText(error));
    const paths = (p?.media || []).map((m: any) => m.path); if (paths.length) await sb.storage.from('content').remove(paths);
    await sb.storage.from('previews').remove([`${me_().id}/${d.id}.jpg`]);
    S.confirmDel = null; toast('Publicação apagada'); await refreshMe(); rerender();
  },
  async pubDraft(d: Record<string, string>) {
    const { error } = await sb.from('posts').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', d.id);
    toast(error ? errText(error) : 'Publicado'); rerender();
  },
  async liveDel(d: Record<string, string>) {
    const { error } = await sb.from('lives').delete().eq('id', d.id);
    toast(error ? errText(error) : 'Live cancelada'); rerender();
  },
};

export async function studioSubmit(f: HTMLFormElement) {
  if (f.id === 'postForm') { await savePost('published', $('#pBtn')); return true; }
  if (f.id === 'liveNewForm') {
    const t = $('#lvTitle').value.trim(), dt = $('#lvDate').value, tm = $('#lvTime').value, p = +$('#lvPrice').value;
    const agora = (f.querySelector<HTMLInputElement>('input[name="lvWhen"]:checked')?.value ?? 'now') === 'now';
    if (t.length < 4) return showErr('#lvErr', 'Dá um título à live, com pelo menos 4 caracteres.'), true;
    if (!agora && (!dt || !tm)) return showErr('#lvErr', 'Escolhe o dia e a hora.'), true;
    if (!Number.isFinite(p) || !Number.isInteger(p) || p < 0 || (p > 0 && p < 200)) return showErr('#lvErr', 'O bilhete é grátis (0) ou custa pelo menos 200 Kz.'), true;
    const starts = agora ? new Date() : new Date(`${dt}T${tm}`);
    if (isNaN(starts.getTime())) return showErr('#lvErr', 'Data ou hora inválidas.'), true;
    const btn = $('#lvBtn'); busy(btn, true, agora ? 'A preparar…' : 'A agendar…');
    const { data: nova, error } = await sb.from('lives').insert({ creator_id: me_().id, title: t, starts_at: starts.toISOString(), price: p }).select('id').single();
    if (error || !nova) { busy(btn, false); return showErr('#lvErr', errText(error)), true; }
    if (!agora) { toast('Live agendada'); rerender(); return true; }
    // Começar agora: a live nasce agendada e passa logo a «live». É a mudança de estado
    // que avisa seguidores e subscritores (trigger `lives_status`), por isso não se
    // insere já como «live». Se este passo falhar, a sala mostra o botão «Começar agora».
    const { error: e2 } = await sb.from('lives').update({ status: 'live' }).eq('id', nova.id).eq('creator_id', me_().id);
    toast(e2 ? errText(e2) : 'Estás ao vivo'); go('live-' + nova.id); return true;
  }
  if (f.id === 'priceForm') {
    const free = $('input[name=pmode]:checked')?.value === 'free', v = free ? 0 : +$('#priceInp').value;
    if (!free && (!Number.isFinite(v) || !Number.isInteger(v) || v < S.cfg.min_price)) return toast(`O preço mínimo é ${kz(S.cfg.min_price)}.`), true;
    const { error } = await sb.from('creators').update({ price: v }).eq('id', me_().id);
    if (error) return toast(errText(error)), true;
    await refreshMe(); toast(free ? 'O teu perfil agora é gratuito' : 'Preço atualizado'); rerender(); return true;
  }
  if (f.id === 'crForm') {
    const bio = $('#crBio').value.trim();
    if (bio.length < 20) return showErr('#crErr', 'A apresentação precisa de pelo menos 20 caracteres.'), true;
    const city = $('#crCity').value, category = $('#crCat').value;
    if (!CITIES.includes(city)) return showErr('#crErr', 'Escolhe uma cidade da lista.'), true;
    if (!CATS.includes(category)) return showErr('#crErr', 'Escolhe uma categoria da lista.'), true;
    const { error } = await sb.from('creators').update({ bio, city, category }).eq('id', me_().id);
    if (error) return showErr('#crErr', errText(error)), true;
    // Sem rerender, os <select> de cidade/categoria continuavam a mostrar a escolha antiga e o
    // cartão do perfil não atualizava — o formulário discordava do que estava guardado.
    await refreshMe(); toast('Perfil guardado'); rerender(); return true;
  }
  if (f.id === 'bankForm') {
    const iban = $('#bkIban').value.replace(/\s/g, '').toUpperCase(), holder = $('#bkHolder').value.trim();
    if (!/^AO06\d{21}$/.test(iban)) return showErr('#bkErr', 'O IBAN angolano começa por AO06 e tem 21 dígitos depois disso.'), true;
    if (holder.length < 3) return showErr('#bkErr', 'Indica o titular da conta.'), true;
    const { error } = await sb.rpc('set_payout_info', { p_bank: $('#bkBank').value, p_holder: holder, p_iban: iban });
    if (error) return showErr('#bkErr', errText(error)), true;
    toast('Conta bancária guardada'); rerender(); return true;
  }
  if (f.id === 'wdForm') {
    // O `min` do input não impede submissão programática, e ""→0 / -500 / 1e999 passavam todos.
    const v = Number($('#wdAmt').value);
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < S.cfg.min_payout) {
      return showErr('#wdErr', `O valor tem de ser um número inteiro de pelo menos ${kz(S.cfg.min_payout)}.`), true;
    }
    const { data: bal } = await sb.from('profiles').select('earnings_balance').eq('id', me_().id).maybeSingle();
    if (bal && v > Number(bal.earnings_balance || 0)) {
      return showErr('#wdErr', `Só tens ${kz(bal.earnings_balance)} disponíveis para levantar.`), true;
    }
    if (!confirm(`Pedir ${kz(v)}?\n\nO valor sai do teu saldo de ganhos e é transferido para a conta que registaste.`)) return true;
    const { error } = await sb.rpc('request_payout', { p_amount: v });
    if (error) return showErr('#wdErr', errText(error)), true;
    await refreshMe(); toast('Pedido de levantamento enviado'); rerender(); return true;
  }
  return false;
}

export async function studioChange(t: FormControl) {
  if (t.name === 'pmode' && $('#sPriceRow')) { $('#sPriceRow').hidden = t.value === 'free'; return true; }
  if (t.name === 'acc') { $('#priceRow').hidden = t.value !== 'paid'; return true; }
  if (t.name === 'lvWhen' && $('#lvWhenRow')) {
    const agora = t.value === 'now';
    $('#lvWhenRow').hidden = agora; $('#lvBtn').textContent = agora ? 'Começar agora' : 'Agendar';
    return true;
  }
  if (t.id === 'pFile') {
    const files = [...((t as HTMLInputElement).files ?? [])].slice(0, 10);
    if (files.some((f) => f.size > 500e6)) { toast('Cada ficheiro pode ter até 500 MB.'); return true; }
    readDraft(); S.draftFiles = files; rerender(); return true;
  }
  if (t.id === 'avatarFile' || t.id === 'coverFile') {
    const f = (t as HTMLInputElement).files![0]; (t as HTMLInputElement).value = ''; if (!f) return true;
    const isAvatar = t.id === 'avatarFile';
    try {
      // O bucket 'avatars' é público: um ficheiro com HTML/SVG dentro seria servido com o
      // content-type do cliente. Confirma os bytes antes de subir.
      await assertImage(f, isAvatar ? 'a foto de perfil' : 'a capa');
      const cropped = await cropImage(f, isAvatar ? 1 : 3, { shape: isAvatar ? 'round' : 'rect', output: isAvatar ? 600 : 1800 });
      if (!cropped) return true;
      const small = await shrinkImage(cropped, isAvatar ? 600 : 1800);
      if (small.type && !IMG_TYPES.includes(small.type)) { await assertImage(small, isAvatar ? 'a foto de perfil' : 'a capa'); }
      const path = `${me_().id}/${isAvatar ? 'avatar' : 'cover'}-${Date.now()}.jpg`;
      // O content-type é o que confirmámos, nunca o que veio no ficheiro escolhido.
      await upload('avatars', path, new File([small], path.split('/').pop()!, { type: 'image/jpeg' }), { upsert: true });
      const url = publicUrl('avatars', path);
      const { error } = isAvatar ? await sb.from('profiles').update({ avatar_url: url }).eq('id', me_().id) : await sb.from('creators').update({ cover_url: url }).eq('id', me_().id);
      if (error) throw error;
      await refreshMe(); toast('Imagem atualizada'); rerender();
    } catch (e) { toast(errText(e)); }
    return true;
  }
  return false;
}
export function studioInput(t: FormControl) {
  if (t.id === 'pTitle') { const c = $('#tCount'); if (c) c.textContent = t.value.length + '/100'; return true; }
  if (t.id === 'pDesc') { const c = $('#dCount'); if (c) c.textContent = t.value.length + '/2.000'; return true; }
  return false;
}
export { closeModal, modal, $$ };

register({ actions: studioActions, submit: studioSubmit, change: studioChange, input: (t) => studioInput(t) });
