// Painel da «Visão geral» (camada de apresentação): filtros, números e gráficos.
//
// Os gráficos são SVG desenhado aqui, sem bibliotecas: poucas linhas, nenhum peso extra no site.
// Os números vêm da fachada `Backoffice.painel` (função `admin_painel` no Supabase); as regras
// dos filtros e das contas estão no domínio (src/domain/backoffice/painel.ts).
import { esc, kz, dots, avatarOf, ic } from '../lib';
import { S } from '../state';
import type { Backoffice } from '../../application/backoffice/backoffice.ts';
import type { DadosDoPainel, PontoDoPainel } from '../../application/backoffice/ports.ts';
import {
  FILTROS_INICIAIS, ORIGENS, PERIODOS, TIPOS_DE_CONTA, TIPOS_DE_VENDA,
  conversao, escalaDoEixo, percentagens, rotuloDe, variacao, type FiltrosDoPainel,
} from '../../domain/backoffice/painel.ts';

/** Hoje em Luanda, como AAAA-MM-DD (o fuso em que a base de dados agrupa os dias). */
export const hojeEmLuanda = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Luanda' }).format(new Date());

export const filtrosDoPainel = (): FiltrosDoPainel => S.adPainel ?? FILTROS_INICIAIS;

const CORES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];
const corDoTipo = (k: string) => CORES[Math.max(0, TIPOS_DE_VENDA.findIndex(([t]) => t === k))];
const rotuloDoTipo = (k: string) => rotuloDe(TIPOS_DE_VENDA, k as never) ?? k;

/** «290 mil», «1,2 M»: para os eixos, onde os Kz inteiros não cabem. */
function compacto(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.', ',').replace(/,0$/, '') + ' M';
  if (v >= 1e3) return Math.round(v / 1e3) + ' mil';
  return String(Math.round(v));
}
const fmtEixo = (d: string, mensal: boolean) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('pt-PT', mensal ? { month: 'short', year: '2-digit', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtDia = (d: string, mensal: boolean) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('pt-PT', mensal ? { month: 'long', year: 'numeric', timeZone: 'UTC' } : { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtData = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('pt-PT', { timeZone: 'UTC' });

/** O texto que aparece ao passar o rato (ou tocar): fica num atributo e o `instalarDicas` mostra-o. */
const dica = (html: string) => `data-tip="${esc(html)}"`;

/* ---------- Gráficos ---------- */

/** Até 6 marcas no eixo horizontal, sempre com o primeiro e o último dia. */
function marcasX(n: number): number[] {
  if (n <= 1) return [0];
  const k = Math.min(6, n);
  return [...new Set(Array.from({ length: k }, (_, i) => Math.round((i * (n - 1)) / (k - 1))))];
}

function linhasDeVendas(s: PontoDoPainel[], mensal: boolean, comparar: boolean): string {
  const W = 640, H = 250, L = 58, R = 10, T = 12, B = 26, iw = W - L - R, ih = H - T - B;
  const max = Math.max(1, ...s.map((p) => Math.max(p.vendas, p.receita, comparar ? p.anterior : 0)));
  const { passo, topo } = escalaDoEixo(max);
  const x = (i: number) => L + (s.length < 2 ? iw / 2 : (i / (s.length - 1)) * iw);
  const y = (v: number) => T + ih - (v / topo) * ih;
  const caminho = (k: keyof PontoDoPainel) => s.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(Number(p[k])).toFixed(1)}`).join('');
  let g = '';
  for (let v = 0; v <= topo + 1e-9; v += passo) {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v ? compacto(v) : '0'}</text>`;
  }
  const mx = marcasX(s.length);
  mx.forEach((i, k) => { g += `<text x="${x(i)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === mx.length - 1 ? 'end' : 'middle'}">${fmtEixo(s[i].d, mensal)}</text>`; });
  if (s.length) {
    g += `<path d="${caminho('vendas')} L${x(s.length - 1)} ${y(0)} L${x(0)} ${y(0)}Z" fill="var(--c1)" opacity=".1"/>`;
    if (comparar) g += `<path d="${caminho('anterior')}" class="ln ant"/>`;
    g += `<path d="${caminho('receita')}" class="ln" stroke="var(--c2)"/><path d="${caminho('vendas')}" class="ln" stroke="var(--c1)"/>`;
  }
  // Uma faixa invisível por dia: ao passar o rato, mostra a linha guia e os valores.
  const larg = s.length > 1 ? iw / (s.length - 1) : iw;
  s.forEach((p, i) => {
    const t = `<b>${fmtDia(p.d, mensal)}</b><br><i style="background:var(--c1)"></i>Volume de vendas: <b>${kz(p.vendas)}</b><br><i style="background:var(--c2)"></i>Receita da plataforma: <b>${kz(p.receita)}</b>${comparar ? `<br><i class="ant"></i>Período anterior: <b>${kz(p.anterior)}</b>` : ''}`;
    g += `<g class="hv" ${dica(t)}><rect x="${Math.max(L, x(i) - larg / 2)}" y="${T}" width="${larg}" height="${ih}" fill="transparent"/><line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${T + ih}" class="guia"/><circle cx="${x(i)}" cy="${y(p.vendas)}" r="4" fill="var(--c1)"/><circle cx="${x(i)}" cy="${y(p.receita)}" r="4" fill="var(--c2)"/></g>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vendas e receita por ${mensal ? 'mês' : 'dia'}">${g}</svg>`;
}

function barrasDeContas(s: PontoDoPainel[], mensal: boolean): string {
  const W = 520, H = 220, L = 36, R = 4, T = 12, B = 26, iw = W - L - R, ih = H - T - B;
  const max = Math.max(1, ...s.map((p) => p.fas + p.criadores));
  const { passo, topo } = escalaDoEixo(max, true);
  const y = (v: number) => T + ih - (v / topo) * ih;
  const bw = iw / Math.max(1, s.length);
  let g = '';
  for (let v = 0; v <= topo; v += passo) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="gl"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${dots(v)}</text>`;
  s.forEach((p, i) => {
    const x0 = L + i * bw + bw * 0.16, w = Math.max(1, bw * 0.68);
    const t = `<b>${fmtDia(p.d, mensal)}</b><br><i style="background:var(--c3)"></i>Fãs: <b>${dots(p.fas)}</b><br><i style="background:var(--c5)"></i>Criadores: <b>${dots(p.criadores)}</b>`;
    g += `<g class="hv" ${dica(t)}><rect x="${L + i * bw}" y="${T}" width="${bw}" height="${ih}" fill="transparent"/>`
      + (p.fas ? `<rect x="${x0}" y="${y(p.fas)}" width="${w}" height="${y(0) - y(p.fas)}" fill="var(--c3)" rx="1.5"/>` : '')
      + (p.criadores ? `<rect x="${x0}" y="${y(p.fas + p.criadores)}" width="${w}" height="${y(p.fas) - y(p.fas + p.criadores)}" fill="var(--c5)" rx="1.5"/>` : '')
      + '</g>';
  });
  const mx = marcasX(s.length);
  mx.forEach((i, k) => { g += `<text x="${L + i * bw + bw / 2}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === mx.length - 1 ? 'end' : 'middle'}">${fmtEixo(s[i].d, mensal)}</text>`; });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Novas contas por ${mensal ? 'mês' : 'dia'}">${g}</svg>`;
}

function circulo(tipos: DadosDoPainel['tipos']): string {
  const total = tipos.reduce((s, t) => s + Number(t.total), 0);
  if (!total) return '<p class="pnvazio">Sem vendas neste período.</p>';
  const pct = percentagens(tipos.map((t) => Number(t.total)));
  const R = 70, r = 46, c = 80;
  const P = (a: number, rr: number) => `${(c + rr * Math.cos(a)).toFixed(2)} ${(c + rr * Math.sin(a)).toFixed(2)}`;
  let ang = -Math.PI / 2, g = '';
  tipos.forEach((t, i) => {
    const fatia = (Number(t.total) / total) * Math.PI * 2;
    const tip = dica(`<b>${esc(rotuloDoTipo(t.kind))}</b><br>${kz(t.total)} · ${pct[i]}%`);
    if (fatia >= Math.PI * 2 - 1e-6) {
      g += `<circle cx="${c}" cy="${c}" r="${(R + r) / 2}" fill="none" stroke="${corDoTipo(t.kind)}" stroke-width="${R - r}" class="fatia" ${tip}/>`;
    } else {
      const a2 = ang + fatia, folga = tipos.length > 1 ? 0.012 : 0, grande = fatia > Math.PI ? 1 : 0;
      g += `<path class="fatia" ${tip} fill="${corDoTipo(t.kind)}" d="M${P(ang + folga, R)} A${R} ${R} 0 ${grande} 1 ${P(a2 - folga, R)} L${P(a2 - folga, r)} A${r} ${r} 0 ${grande} 0 ${P(ang + folga, r)}Z"/>`;
      ang = a2;
    }
  });
  g += `<text x="${c}" y="${c - 4}" text-anchor="middle">Total</text><text x="${c}" y="${c + 14}" text-anchor="middle" class="tot">${compacto(total)}</text>`;
  const lista = tipos.map((t, i) => `<div><i style="background:${corDoTipo(t.kind)}"></i><span>${esc(rotuloDoTipo(t.kind))}</span><b>${kz(t.total)}</b><span class="p">${pct[i]}%</span></div>`).join('');
  return `<div class="pndonut"><svg viewBox="0 0 160 160" role="img" aria-label="Volume de vendas por tipo">${g}</svg><div class="pnlista">${lista}</div></div>`;
}

function funil(f: DadosDoPainel['funil']): string {
  const passos: Array<[string, number]> = [['Criaram conta', f.contas], ['Completaram o perfil', f.perfil], ['Pediram para ser criador', f.pedidos], ['Criadores aprovados', f.aprovados]];
  const topo = Math.max(1, f.contas);
  return `<div class="pnfunil">${passos.map(([l, v], i) => {
    const c = i ? conversao(v, passos[i - 1][1]) : null;
    return `<div><div class="fl"><span>${l}</span><b>${dots(v)}</b><span class="c">${c === null ? '' : c + '%'}</span></div><div class="fb"><i style="width:${Math.max(v ? 2 : 0, (v / topo) * 100)}%"></i></div></div>`;
  }).join('')}</div>`;
}

function sparkline(vals: number[], cor: string): string {
  if (vals.length < 2) return '';
  const w = 160, h = 34, max = Math.max(...vals), min = Math.min(...vals);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * w).toFixed(1)} ${(h - 3 - ((v - min) / (max - min || 1)) * (h - 6)).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${w} ${h} L0 ${h}Z" fill="${cor}" opacity=".12"/><path d="${d}" fill="none" stroke="${cor}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ---------- Filtros ---------- */

function barraDeFiltros(f: FiltrosDoPainel, d: DadosDoPainel | null, hoje: string): string {
  const opcoes = <T extends string>(lista: ReadonlyArray<[T, string]>, v: T | null | undefined, todos: string) =>
    `<option value="">${todos}</option>${lista.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}`;
  const criadores = (d?.criadores ?? []).map((c) => [c.id, `${c.name || c.handle} (@${c.handle})`] as [string, string]);
  if (f.criador && !criadores.some(([id]) => id === f.criador)) criadores.unshift([f.criador, 'Criador escolhido']);
  const activos = [f.tipo, f.criador, f.contas, f.origem].filter(Boolean).length;
  return `<div class="pnbarra">
    <div class="pnseg" role="group" aria-label="Período">${PERIODOS.map(([k, l]) => `<button type="button" class="${f.periodo === k ? 'on' : ''}" aria-pressed="${f.periodo === k}" data-act="pnPeriodo" data-v="${k}">${l}</button>`).join('')}</div>
    ${f.periodo === 'custom' ? `<div class="pndatas"><label><span>De</span><input type="date" id="pnDe" value="${esc(f.de ?? '')}" max="${hoje}"></label><label><span>Até</span><input type="date" id="pnAte" value="${esc(f.ate ?? hoje)}" max="${hoje}"></label></div>` : ''}
    <label class="pnchk"><input type="checkbox" id="pnComparar" ${f.comparar ? 'checked' : ''}> Comparar com o período anterior</label>
    <details class="pnmais" ${activos ? 'open' : ''}>
     <summary class="btn out sm">${ic('settings')}Filtros${activos ? ` <span class="count">${activos}</span>` : ''}</summary>
     <div class="pnfiltros">
      <label>Tipo de venda<select id="pnTipo">${opcoes(TIPOS_DE_VENDA, f.tipo, 'Todos os tipos')}</select></label>
      <label>Criador<select id="pnCriador">${opcoes(criadores, f.criador ?? null, 'Todos os criadores')}</select></label>
      <label>Contas<select id="pnContas">${opcoes(TIPOS_DE_CONTA, f.contas, 'Fãs e criadores')}</select></label>
      <label>Origem<select id="pnOrigem">${opcoes(ORIGENS, f.origem, 'Todas as origens')}</select></label>
     </div>
    </details>
   </div>
   ${etiquetas(f, d)}`;
}

function etiquetas(f: FiltrosDoPainel, d: DadosDoPainel | null): string {
  const e: Array<[string, string]> = [];
  if (f.tipo) e.push(['tipo', rotuloDe(TIPOS_DE_VENDA, f.tipo)!]);
  if (f.criador) { const c = d?.criadores.find((x) => x.id === f.criador); e.push(['criador', c ? `@${c.handle}` : 'Criador']); }
  if (f.contas) e.push(['contas', rotuloDe(TIPOS_DE_CONTA, f.contas)!]);
  if (f.origem) e.push(['origem', rotuloDe(ORIGENS, f.origem)!]);
  if (!e.length) return '';
  return `<div class="pnactivos"><span>A mostrar só:</span>${e.map(([k, l]) => `<span class="pnpill">${esc(l)}<button type="button" data-act="pnTira" data-k="${k}" aria-label="Tirar o filtro ${esc(l)}">×</button></span>`).join('')}<button type="button" class="btn link small" data-act="pnTira" data-k="*">Limpar filtros</button></div>`;
}

/** Aplica uma mudança num campo dos filtros. Devolve true se o campo era do painel. */
export function mudarFiltro(id: string, valor: string, marcado: boolean): boolean {
  const f = { ...filtrosDoPainel() };
  switch (id) {
    case 'pnTipo': f.tipo = (valor || null) as FiltrosDoPainel['tipo']; break;
    case 'pnCriador': f.criador = valor || null; break;
    case 'pnContas': f.contas = (valor || null) as FiltrosDoPainel['contas']; break;
    case 'pnOrigem': f.origem = (valor || null) as FiltrosDoPainel['origem']; break;
    case 'pnDe': f.de = valor || null; break;
    case 'pnAte': f.ate = valor || null; break;
    case 'pnComparar': f.comparar = marcado; break;
    default: return false;
  }
  S.adPainel = f;
  return true;
}

export function mudarPeriodo(v: string): boolean {
  if (!PERIODOS.some(([k]) => k === v)) return false;
  const f = { ...filtrosDoPainel(), periodo: v as FiltrosDoPainel['periodo'] };
  if (v === 'custom' && !f.de) {
    const hoje = hojeEmLuanda();
    f.ate = hoje;
    f.de = new Date(Date.parse(hoje + 'T00:00:00Z') - 29 * 864e5).toISOString().slice(0, 10);
  }
  S.adPainel = f;
  return true;
}

export function tirarFiltro(k: string): void {
  const f = { ...filtrosDoPainel() };
  if (k === '*' || k === 'tipo') f.tipo = null;
  if (k === '*' || k === 'criador') f.criador = null;
  if (k === '*' || k === 'contas') f.contas = null;
  if (k === '*' || k === 'origem') f.origem = null;
  S.adPainel = f;
}

/* ---------- O painel ---------- */

function cartaoKpi(l: string, v: string, actual: number, anterior: number, comparar: boolean, serie: number[], cor: string, nota = ''): string {
  const d = comparar ? variacao(actual, anterior) : null;
  const delta = !comparar ? '' : d === null
    ? '<div class="pndelta"><span>Sem dados do período anterior</span></div>'
    : `<div class="pndelta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${Math.abs(d).toLocaleString('pt-PT')}% <span>vs. período anterior</span></div>`;
  return `<div class="pnkpi"><div class="l">${l}</div><div class="v">${v}</div>${delta}${nota ? `<div class="s">${nota}</div>` : ''}${cor ? sparkline(serie, cor) : ''}</div>`;
}

/**
 * O HTML do painel para os filtros actuais. Se a função da base de dados ainda não existir
 * (ou falhar), devolve o aviso e os números antigos, para a «Visão geral» nunca ficar vazia.
 */
export async function painelHTML(b: Backoffice): Promise<string> {
  const f = filtrosDoPainel();
  const hoje = hojeEmLuanda();
  let d: DadosDoPainel;
  try {
    d = await b.painel(f, hoje);
  } catch (e) {
    const msg = (e as { message?: string })?.message || String(e);
    const semFuncao = /admin_painel|function|PGRST202/i.test(msg);
    const antigos = await b.estatisticas().catch(() => null);
    const kpis = antigos ? `<h2 class="cssec">Últimos 30 dias</h2><div class="pnkpis">
      ${cartaoKpi('Volume de vendas', kz(antigos.gross_30d), 0, 0, false, [], '')}
      ${cartaoKpi('Receita da plataforma', kz(antigos.platform_30d), 0, 0, false, [], '')}
      ${cartaoKpi('Saldos por levantar', kz(antigos.creators_balance), 0, 0, false, [], '', 'Dinheiro dos criadores ainda na plataforma')}
      ${cartaoKpi('Utilizadores · criadores', `${dots(antigos.users)} · ${dots(antigos.creators)}`, 0, 0, false, [], '')}</div>` : '';
    return `<div class="banner">${ic('info')}<span>${semFuncao ? 'Os gráficos e os filtros ficam disponíveis quando a função <code>admin_painel</code> for aplicada na base de dados. Por agora, os números de sempre:' : `Não foi possível carregar os gráficos: ${esc(msg)}`}</span></div>${kpis}`;
  }
  const t = d.totais, s = d.serie, comp = f.comparar;
  const titulo = f.periodo === 'custom' ? `De ${fmtData(d.de)} a ${fmtData(d.ate)}` : f.periodo === '365' ? 'Últimos 12 meses' : `Últimos ${f.periodo} dias`;
  const top = d.top.length
    ? `<div class="tw"><table><thead><tr><th>Criador</th><th class="num">Subscritores</th><th class="num">Vendas</th><th class="pnbarcol"></th></tr></thead><tbody>${d.top.map((c) => `<tr><td><a class="row" href="#perfil-${esc(c.handle)}" style="gap:9px">${avatarOf({ name: c.name ?? undefined, handle: c.handle ?? undefined, avatar_url: c.avatar_url ?? undefined }, 'sm')}<span><b style="color:var(--ink)">${esc(c.name || c.handle)}</b><br><span class="small muted">@${esc(c.handle)}</span></span></a></td><td class="num">${dots(c.subscritores)}</td><td class="num"><b style="color:var(--ink)">${kz(c.vendas)}</b></td><td class="pnbarcol"><div class="pnbar"><i style="width:${(Number(c.vendas) / Math.max(1, Number(d.top[0].vendas))) * 100}%"></i></div></td></tr>`).join('')}</tbody></table></div>`
    : '<p class="pnvazio">Sem vendas neste período.</p>';
  const din = d.dinheiro;

  return `${barraDeFiltros(f, d, hoje)}
   <div class="pnsech"><h2 class="cssec">Dinheiro · ${titulo}</h2></div>
   <div class="pnkpis">
    ${cartaoKpi('Volume de vendas', kz(t.vendas), t.vendas, t.vendas_ant, comp, s.map((p) => p.vendas), 'var(--c1)', 'Tudo o que os fãs pagaram')}
    ${cartaoKpi('Receita da plataforma', kz(t.receita), t.receita, t.receita_ant, comp, s.map((p) => p.receita), 'var(--c2)', 'A parte que fica para A Porta Fechada')}
    ${cartaoKpi('Vendas pagas', dots(t.pedidos), t.pedidos, t.pedidos_ant, comp, [], '', `Valor médio: ${t.pedidos ? kz(t.vendas / t.pedidos) : '—'}`)}
    ${cartaoKpi('Fãs que compraram', dots(t.compradores), t.compradores, t.compradores_ant, comp, [], '', t.compradores ? `Gastaram em média ${kz(t.vendas / t.compradores)}` : '')}
   </div>
   <div class="pngrid g21">
    <section class="pncard"><div class="pnch"><div><h3>Vendas e receita</h3><div class="sub">Por ${d.mensal ? 'mês' : 'dia'}, em Kz</div></div>
      <div class="pnleg"><span><i style="background:var(--c1)"></i>Volume de vendas</span><span><i style="background:var(--c2)"></i>Receita da plataforma</span>${comp ? '<span><i class="ant"></i>Período anterior</span>' : ''}</div></div>
      ${linhasDeVendas(s, d.mensal, comp)}</section>
    <section class="pncard"><div class="pnch"><div><h3>De onde vem o dinheiro</h3><div class="sub">Volume de vendas por tipo</div></div></div>${circulo(d.tipos)}</section>
   </div>
   <div class="pngrid g21">
    <section class="pncard"><div class="pnch"><div><h3>Criadores que mais vendem</h3><div class="sub">Volume de vendas no período</div></div></div>${top}</section>
    <section class="pncard"><div class="pnch"><div><h3>Dinheiro dos criadores</h3><div class="sub">Agora, excepto «Pago no período»</div></div></div>
     <div class="pnmini">
      <div><span class="l">Saldos por levantar</span><span class="v">${kz(din.saldos)}</span><span class="s">Ainda na plataforma</span></div>
      <div><span class="l">Comissões retidas</span><span class="v">${kz(din.retido)}</span><span class="s">Afiliados, ainda nos 30 dias de espera</span></div>
      <div><span class="l">Levantamentos pedidos</span><span class="v">${kz(din.pedidos)}</span><span class="s">${dots(din.pedidos_n)} ${din.pedidos_n === 1 ? 'pedido' : 'pedidos'} por pagar</span></div>
      <div><span class="l">Pago no período</span><span class="v">${kz(din.pago)}</span><span class="s">${dots(din.pago_n)} ${din.pago_n === 1 ? 'levantamento' : 'levantamentos'}</span></div>
     </div></section>
   </div>
   <div class="pnsech"><h2 class="cssec">Comunidade · ${titulo}</h2><span class="pnbase">Hoje: ${dots(d.base.utilizadores)} contas · ${dots(d.base.criadores)} criadores aprovados · ${dots(d.base.subscricoes)} subscrições activas</span></div>
   <div class="pnkpis">
    ${cartaoKpi('Novas contas', dots(t.contas), t.contas, t.contas_ant, comp, s.map((p) => p.fas + p.criadores), 'var(--c3)')}
    ${cartaoKpi('Novos criadores aprovados', dots(d.funil.aprovados), 0, 0, false, s.map((p) => p.criadores), 'var(--c5)', 'Das contas criadas no período')}
    ${cartaoKpi('Subscrições activas', dots(t.subs_activas), t.subs_activas, t.subs_activas_ant, comp, [], '', 'No fim do período')}
    ${cartaoKpi('Criadores com vendas', dots(t.criadores_vendas), t.criadores_vendas, t.criadores_vendas_ant, comp, [], '', d.base.criadores ? `${conversao(t.criadores_vendas, d.base.criadores) ?? 0}% dos criadores aprovados` : '')}
   </div>
   <div class="pngrid g11">
    <section class="pncard"><div class="pnch"><div><h3>Novas contas</h3><div class="sub">Por ${d.mensal ? 'mês' : 'dia'}</div></div>
      <div class="pnleg"><span><i style="background:var(--c3)"></i>Fãs</span><span><i style="background:var(--c5)"></i>Criadores</span></div></div>
      ${barrasDeContas(s, d.mensal)}</section>
    <section class="pncard"><div class="pnch"><div><h3>Da conta ao criador</h3><div class="sub">Contas criadas no período e quantas avançam em cada passo</div></div></div>${funil(d.funil)}</section>
   </div>`;
}

/* ---------- Dicas ao passar o rato ---------- */

let dicasInstaladas = false;
/** Uma só caixa de dica para todos os gráficos, seguindo o rato (ou o toque). */
export function instalarDicas(): void {
  if (dicasInstaladas || typeof document === 'undefined') return;
  dicasInstaladas = true;
  const caixa = document.createElement('div');
  caixa.className = 'pntip';
  caixa.setAttribute('role', 'tooltip');
  document.body.appendChild(caixa);
  let actual: Element | null = null;
  const mostra = (e: PointerEvent) => {
    const alvo = (e.target as Element | null)?.closest?.('[data-tip]') ?? null;
    if (actual && actual !== alvo) actual.classList.remove('on');
    if (!alvo) { caixa.classList.remove('on'); actual = null; return; }
    if (alvo !== actual) { caixa.innerHTML = alvo.getAttribute('data-tip') || ''; alvo.classList.add('on'); actual = alvo; }
    caixa.classList.add('on');
    const x = Math.min(e.clientX + 14, window.innerWidth - caixa.offsetWidth - 8);
    const y = e.clientY - caixa.offsetHeight - 12;
    caixa.style.left = `${Math.max(8, x)}px`;
    caixa.style.top = `${y < 8 ? e.clientY + 18 : y}px`;
  };
  document.addEventListener('pointermove', mostra, { passive: true });
  document.addEventListener('pointerdown', mostra, { passive: true });
  document.addEventListener('scroll', () => { caixa.classList.remove('on'); actual?.classList.remove('on'); actual = null; }, { passive: true, capture: true });
}
