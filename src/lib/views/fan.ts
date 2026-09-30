// Fã: início, explorar, perfis, publicações, subscrições, carteira
import { sb, $, $$, esc, kz, dots, ic, avatarOf, toast, modal, closeModal, showErr, errText, fmtDate, ago, signedUrls, safeHref, isExternal, rerender, go, lightbox, galeria, type ItemDoVisor } from '../lib';
import { colunaDe, posicaoNoFeed, promocaoDaVisita, TEXTO_BOTAO_PADRAO } from '../../domain/platform/promo.ts';
import { register } from '../registry';
import { S } from '../state';
import { openPay } from '../pay';
import { CATS } from '../config';

import type { Profile } from '../types';
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

const POST_SEL = '*, creator:creators(id,price,status,profile:profiles!creators_id_fkey(handle,name,avatar_url))';
const CR_SEL = 'id,category,city,price,cover_url,bio,status,follower_count,subscriber_count,post_count,created_at,profile:profiles!creators_id_fkey!inner(handle,name,avatar_url)';
const cname = (c: any) => c?.profile?.name || c?.profile?.handle || '';

/** Junta a cada publicação o texto (se houver acesso), os gostos e os links dos ficheiros. */
export async function enrichPosts(posts: any) {
  if (!posts.length) return posts;
  const ids = posts.map((p: any) => p.id), uid = me_().id;
  const [{ data: bodies }, { data: likes }, { data: saves }] = await Promise.all([
    sb.from('post_bodies').select('post_id,body').in('post_id', ids),
    sb.from('post_likes').select('post_id').eq('user_id', uid).in('post_id', ids),
    sb.from('saves').select('post_id').eq('user_id', uid).in('post_id', ids),
  ]);
  const B = new Map((bodies || []).map((b) => [b.post_id, b.body]));
  const L = new Set((likes || []).map((x) => x.post_id)), SV = new Set((saves || []).map((x) => x.post_id));
  const paths = [];
  for (const p of posts) { p.canSee = B.has(p.id); p.body = B.get(p.id) || ''; p.liked = L.has(p.id); p.saved = SV.has(p.id); if (p.canSee) for (const m of p.media || []) paths.push(m.path); }
  const urls = paths.length ? await signedUrls('content', paths) : {};
  for (const p of posts) p.urls = (p.media || []).map((m: any) => ({ ...m, url: urls[m.path] }));
  return posts;
}

function mediaHTML(p: any) {
  const mine = p.creator_id === me_().id;
  const wm = p.canSee && !mine ? '<span class="wm c">@aportafechada.net</span>' : '';
  // No feed, todas as publicações têm o mesmo enquadramento (--post-ratio no CSS), preenchido.
  // Clicar abre o visualizador com o ficheiro inteiro no formato real (9:16 a 16:9).
  // Os vídeos não tocam dentro do feed: mostram a primeira imagem e um botão de play.
  // `data-post` + `data-i` dizem ao visualizador de que publicação e de que ficheiro se trata,
  // para ele abrir a galeria inteira (guardada em `data-gal`) e não só o ficheiro clicado.
  const one = (m: any, i: number) => m.type?.startsWith('video')
    ? `<button class="mtile" data-act="openMedia" data-post="${p.id}" data-i="${i}" data-kind="video" data-url="${esc(m.url)}" aria-label="Ver vídeo"><video src="${esc(m.url)}#t=0.1" muted playsinline preload="metadata" disablePictureInPicture oncontextmenu="return false" tabindex="-1"></video><span class="play">${ic('play')}</span></button>`
    : `<img src="${esc(m.url)}" alt="" loading="lazy" decoding="async" draggable="false" oncontextmenu="return false" data-act="openMedia" data-post="${p.id}" data-i="${i}" data-kind="image" data-url="${esc(m.url)}">`;
  if (p.canSee) {
    const list = (p.urls || []).filter((m: any) => m.url);
    if (!list.length) return '';
    const gal = esc(JSON.stringify(list.map((m: any) => ({ url: m.url, tipo: m.type?.startsWith('video') ? 'video' : 'image' }))));
    if (list.length === 1) return `<div class="media" data-gal="${gal}">${one(list[0], 0)}${wm}</div>`;
    // A grelha mostra até 4; os restantes ficam atrás de «+N» no último e vêem-se no visualizador.
    const shown = list.slice(0, 4), resto = list.length - shown.length;
    return `<div class="media multi n${shown.length}" data-gal="${gal}">${shown.map((m: any, i: number) => `<div>${one(m, i)}${wm}${resto && i === shown.length - 1 ? `<span class="mais">+${resto}</span>` : ''}</div>`).join('')}</div>`;
  }
  const c = p.creator;
  const fr = !c.price;
  const btn = p.access === 'subscribers'
    ? (fr ? `<button class="btn pri sm" data-act="follow" data-id="${c.id}" data-on="0">Seguir para ver</button>` : `<button class="btn pri sm" data-act="subscribe" data-id="${c.id}">Subscrever por ${kz(c.price)}/mês</button>`)
    : `<button class="btn pri sm" data-act="buyPost" data-id="${p.id}" data-price="${p.price}">Obter acesso por ${kz(p.price)}</button>`;
  const msg = p.access === 'subscribers' ? (fr ? 'Só para seguidores' : 'Só para subscritores') : 'Conteúdo pago à parte';
  const n = (p.media || []).length;
  if (p.preview_url || n) return `<div class="media locked">${p.preview_url ? `<img loading="lazy" decoding="async" src="${esc(p.preview_url)}" alt="">` : ''}<div class="lock"><span class="ring">${ic('lock')}</span><b>${msg}</b>${n ? `<span class="small">${n} ${n === 1 ? 'ficheiro' : 'ficheiros'}</span>` : ''}</div>${btn}</div>`;
  return `<div class="textlock">${ic('lock', 'style="width:24px;height:24px;color:var(--muted)"')}<b style="color:var(--ink)">${msg}</b>${btn}</div>`;
}

export function postHTML(p: any) {
  const c = p.creator, mine = p.creator_id === me_().id;
  const tag = p.access === 'free' ? '<span class="tag plain">Grátis</span>' : p.access === 'subscribers' ? `<span class="tag acc">${ic('lock')}${c.price ? 'Subscritores' : 'Seguidores'}</span>` : `<span class="tag warn">${ic('lock')}${kz(p.price)}</span>`;
  // Cartão ao estilo do Facebook: cabeçalho e texto com margem, média de ponta a
  // ponta, e uma barra de acções de largura total com botões iguais.
  return `<article class="box post" id="post-${p.id}">
   <header class="phd"><a class="pauthor" href="#perfil-${esc(c.profile.handle)}">${avatarOf(c.profile, 'md')}<span><b>${esc(cname(c))}</b><span class="pmeta">${ago(p.published_at || p.created_at)}</span></span></a>${tag}</header>
   <div class="ptx">${p.title ? `<h4>${esc(p.title)}</h4>` : ''}${p.canSee && p.body ? `<p class="postbody clamp">${esc(p.body)}</p><button class="btn link small more-btn" data-act="expandBody" data-id="${p.id}" hidden>Ver mais</button>` : ''}</div>
   ${mediaHTML(p)}
   <div class="pf">
    <button data-act="like" data-id="${p.id}" class="${p.liked ? 'on' : ''}" aria-pressed="${p.liked}" aria-label="Gosto" ${p.canSee ? '' : 'disabled'}>${ic('heart', p.liked ? 'fill="currentColor"' : '')}<span class="lbl">Gosto</span><span class="num">${dots(p.like_count)}</span></button>
    ${mine ? '' : `<button data-act="tip" data-id="${c.id}">${ic('gift')}<span class="lbl">Gorjeta</span></button>`}
    <button class="${p.saved ? 'on' : ''}" data-act="save" data-id="${p.id}" aria-label="Guardar">${ic('bookmark', p.saved ? 'fill="currentColor"' : '')}<span class="lbl">Guardar</span></button>
    ${mine ? '' : `<button class="ico" data-act="report" data-type="post" data-id="${p.id}" aria-label="Denunciar" title="Denunciar">${ic('flag')}</button>`}
   </div></article>`;
}

/* ---------- Promoções (cartões geridos em Admin > Promoções, posição escolhida lá) ---------- */
/**
 * Banner de promoções.
 *
 * Computador: um banner vertical de 300 × 600 (1:2) na coluna esquerda do feed, fixo
 * enquanto a pessoa desce. Telemóvel (sem colunas): o mesmo banner, largo e baixo (3:1),
 * entre as publicações, numa posição que muda de visita para visita.
 *
 * Uma promoção de cada vez: cada visita mostra a seguinte da lista (pela ordem definida
 * na administração), para todas terem a sua vez.
 */
async function loadPromos(): Promise<any[]> {
  const { data } = await sb.from('promos').select('*').eq('active', true).order('sort_order', { ascending: true }).limit(18);
  return data || [];
}

/** Contador da rotação: avança uma posição por visita (sessionStorage marca a visita). */
function voltaDaVisita(): number {
  try {
    const guardado = sessionStorage.getItem('apf-promo-visita');
    if (guardado !== null) return Number(guardado) || 0;
    const i = (Number(localStorage.getItem('apf-promo-rotacao')) || 0) + 1;
    localStorage.setItem('apf-promo-rotacao', String(i));
    sessionStorage.setItem('apf-promo-visita', String(i));
    return i;
  } catch { return 0; } // modo privado: fica a primeira
}

/** Posição sorteada para esta visita (1 a 3), usada quando a promoção está em «Automática». */
function sorteioDaVisita(): number {
  try {
    const g = sessionStorage.getItem('apf-promo-pos');
    if (g !== null) return Number(g) || 1;
    const p = 1 + Math.floor(Math.random() * 3);
    sessionStorage.setItem('apf-promo-pos', String(p));
    return p;
  } catch { return 1; }
}

/** O banner. `forma`: 'lateral' (1:2, coluna esquerda) ou 'feed' (3:1, entre publicações, só telemóvel). */
function promoBanner(p: any, forma: 'lateral' | 'feed'): string {
  const cls = forma === 'lateral' ? 'pbanner pbanner-side' : 'pbanner pbanner-feed';
  if (p.content_type === 'html') return `<div class="${cls} html">${promoHtmlBlock(p, forma)}<span class="pbanner-tag">Patrocinado</span></div>`;
  // No telemóvel usa a imagem mobile, se a administração a tiver carregado.
  const url = forma === 'feed' && p.mobile_image_url ? p.mobile_image_url : p.image_url;
  const video = p.media_type?.startsWith('video') || /\.(mp4|webm)$/i.test(url || '');
  const fundo = !url ? '' : video
    ? `<video class="pbanner-bg" src="${esc(url)}" autoplay muted loop playsinline disablePictureInPicture></video>`
    : `<img class="pbanner-bg" src="${esc(url)}" alt="" loading="lazy" decoding="async">`;
  return `<a class="${cls}" ${promoHref(p)}>${fundo}<span class="pbanner-tag">Patrocinado</span>
    <span class="pbanner-txt"><b>${esc(p.title)}</b>${p.subtitle ? `<span>${esc(p.subtitle)}</span>` : ''}<span class="pbanner-cta">${esc(p.cta || TEXTO_BOTAO_PADRAO)}</span></span></a>`;
}
function promoHref(p: any) {
  // Um link de promoção é clicado por quem está autenticado. `esc()` protege o atributo, mas não o
  // esquema: href="javascript:…" continuaria a ser um link executável. allowlist em safeHref.
  const href = safeHref(p.link_url);
  if (!href) return 'href="#inicio"';
  return `href="${esc(href)}"${isExternal(href) ? ' target="_blank" rel="noopener noreferrer"' : ''}`;
}
/** `esc()` não serve dentro de url('…'): o parser HTML descodifica as entidades ANTES de o CSS ser
 *  lido, portanto uma aspa no URL fechava o url() e deixava o resto virar uma declaração CSS
 *  (sobreposições, exfiltração). Estes URLs vêm de publicUrl(), mas a protecção é barata. */
// Aspas simples: o resultado vai dentro de style="…", e aspas duplas fechavam o atributo.
const cssUrl = (u: any) => `url('${String(u || '').replace(/["'\\()<>]/g, encodeURIComponent)}')`;
/** Na coluna lateral vai o código «computador» (vertical); entre as publicações, o de
 *  «telemóvel» (horizontal), se existir. A moldura ajusta-se ao tamanho do anúncio (CSS). */
function promoHtmlBlock(p: any, forma: 'lateral' | 'feed') {
  return `<div class="promoembed">${forma === 'feed' && p.mobile_html ? p.mobile_html : p.html}</div>`;
}

/* ---------- Início ---------- */
async function sideRail(banner: string) {
  const [{ data: on }, { data: sug }, fasSug] = await Promise.all([
    sb.from('lives').select('id,title,creator:creators(id,profile:profiles!creators_id_fkey(handle,name,avatar_url))').eq('status', 'live').limit(5),
    sb.from('creators').select(CR_SEL).eq('status', 'approved').neq('id', me_().id).order('follower_count', { ascending: false }).limit(12),
    fasVisiveis(12),
  ]);
  const [{ data: fol }, { data: subs }] = await Promise.all([
    sb.from('follows').select('creator_id').eq('follower_id', me_().id),
    sb.from('subscriptions').select('creator_id').eq('fan_id', me_().id).eq('status', 'active'),
  ]);
  const known = new Set([...(fol || []), ...(subs || [])].map((x) => x.creator_id));
  // Até 4 sugestões: criadores primeiro, fãs a completar (pelo menos um, se houver).
  const cr = (sug || []).filter((c) => !known.has(c.id));
  const fa = fasSug.filter((p) => !known.has(p.id));
  const nCr = Math.min(cr.length, fa.length ? 3 : 4);
  const s = [...cr.slice(0, nCr), ...fa.slice(0, 4 - nCr).map((p) => ({ fa: true, profile: p }))];
  return `<aside class="rail2">
   ${banner}
   ${on?.length ? `<div><h4>Ao vivo agora</h4>${on.map((l: any) => `<a class="mini" href="#live-${l.id}">${avatarOf(l.creator.profile, 'sm')}<span class="t"><b>${esc(cname(l.creator))}</b><span>${esc(l.title)}</span></span><span class="tag acc">AO VIVO</span></a>`).join('')}</div>` : ''}
   ${s.length ? `<div><h4>⚡ Sugestões para ti</h4><div class="sugcards">${s.map((c: any) => c.fa ? `<a class="sugcard fa" href="#perfil-${esc(c.profile.handle)}">
     <span class="sugbg"></span>
     <span class="sugtag">Fã</span>
     ${avatarOf(c.profile, 'sugav')}
     <span class="sugmeta"><b>${esc(c.profile.name || c.profile.handle)}</b><span>@${esc(c.profile.handle)}</span></span></a>` : `<a class="sugcard" href="#perfil-${esc(c.profile.handle)}">
     <span class="sugbg" style="${c.cover_url ? `background-image:${cssUrl(c.cover_url)}` : ''}"></span>
     <span class="sugtag">${c.price ? kz(c.price) + '/mês' : 'Grátis'}</span>
     ${avatarOf(c.profile, 'sugav')}
     <span class="sugmeta"><b>${esc(cname(c))}</b><span>@${esc(c.profile.handle)}</span></span></a>`).join('')}</div></div>` : ''}
   <a class="btn out block" href="#top">${ic('trophy')}Ver o Top 10</a></aside>`;
}
export async function vFeed() {
  const uid = me_().id;
  const [{ data: fol }, { data: subs }, promos] = await Promise.all([
    sb.from('follows').select('creator_id').eq('follower_id', uid),
    sb.from('subscriptions').select('creator_id').eq('fan_id', uid).eq('status', 'active'),
    loadPromos(),
  ]);
  const ids = [...new Set([...(fol || []), ...(subs || [])].map((x) => x.creator_id))];
  // Quem publica também vê as suas publicações no início, misturadas por data com as dos outros.
  if (S.creator && !ids.includes(uid)) ids.push(uid);
  let posts = [];
  if (ids.length) {
    const { data } = await sb.from('posts').select(POST_SEL).in('creator_id', ids).eq('status', 'published').order('published_at', { ascending: false }).limit(30);
    posts = await enrichPosts(data || []);
  }
  const promo = promocaoDaVisita(promos, voltaDaVisita());
  const coluna = promo ? colunaDe(promo.position) : 'esquerda';
  const lista = posts.map(postHTML);
  if (promo && lista.length) lista.splice(posicaoNoFeed(promo.mobile_slot, sorteioDaVisita(), lista.length), 0, promoBanner(promo, 'feed'));
  const lateral = promo ? promoBanner(promo, 'lateral') : '';
  return `<div class="feedwrap">${lateral && coluna === 'esquerda' ? `<aside class="pbanner-col">${lateral}</aside>` : '<div></div>'}<div class="feedcol">
   <h1 class="sr-only">Início</h1>
   ${posts.length ? lista.join('') : `<div class="box empty"><h3>O teu início está vazio</h3><p style="margin-top:6px">Segue ou subscreve criadores e as publicações deles aparecem aqui.</p><a class="btn pri" style="margin-top:14px" href="#explorar">Explorar criadores</a></div>`}
  </div>${await sideRail(coluna === 'direita' ? lateral : '')}</div>`;
}

/* ---------- Explorar ---------- */
/** Campos públicos de um perfil de fã. */
const FA_SEL = 'id,handle,name,avatar_url,country,interests,follower_count,created_at';

/**
 * Fãs para sugerir ou encontrar: contas de fã já registadas, não banidas, que não
 * sejam a própria. `termo` filtra por nome ou @ (o mesmo saneamento da pesquisa
 * de criadores).
 */
async function fasVisiveis(limite: number, termo = ''): Promise<any[]> {
  // Um banimento temporário que já terminou deixa `banned_at` preenchido: conta como não banido.
  let q = sb.from('profiles').select(FA_SEL).eq('role', 'fan').eq('onboarded', true)
    .or(`banned_at.is.null,banned_until.lt.${new Date().toISOString()}`)
    .neq('id', me_().id).order('follower_count', { ascending: false }).order('created_at', { ascending: false }).limit(limite);
  if (termo) q = q.or(`name.ilike.%${termo}%,handle.ilike.%${termo}%`);
  const { data } = await q;
  return data || [];
}

/** Cartão de fã nos resultados do Explorar (mesmo formato dos criadores, marcado «Fã»). */
function faCard(p: any) {
  const ph = p.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" loading="lazy">` : `<span class="letter">${esc(((p.name || p.handle || '?') + '')[0].toUpperCase())}</span>`;
  return `<a class="ccard" href="#perfil-${esc(p.handle)}"><span class="ph">${ph}</span>
   <span><span class="nm">${esc(p.name || p.handle)} <span class="tag plain">Fã</span></span>
   <span class="ln"><span>@${esc(p.handle)}${p.country ? ' · ' + esc(p.country) : ''}</span></span>
   <span class="ln" style="margin-top:2px"><span>${dots(p.follower_count || 0)} seguidor${p.follower_count === 1 ? '' : 'es'}</span></span></span></a>`;
}

function creatorCard(c: any) {
  const ph = c.profile.avatar_url ? `<img src="${esc(c.profile.avatar_url)}" alt="" loading="lazy">` : c.cover_url ? `<img src="${esc(c.cover_url)}" alt="" loading="lazy">` : `<span class="letter">${esc((cname(c) || '?')[0].toUpperCase())}</span>`;
  return `<a class="ccard" href="#perfil-${esc(c.profile.handle)}"><span class="ph">${ph}</span>
   <span><span class="nm">${esc(cname(c))}<span title="Identidade verificada">${ic('badge')}</span></span>
   <span class="ln"><span>${esc(c.category)}${c.bio ? ' · ' + esc(c.bio.slice(0, 50)) : ''}</span></span>
   <span class="ln" style="margin-top:2px"><span class="pr">${c.price ? kz(c.price) + '/mês' : 'Grátis'}</span><span>${esc(c.city)}</span></span></span></a>`;
}
export async function exploreGrid() {
  let q = sb.from('creators').select(CR_SEL).eq('status', 'approved').neq('id', me_().id).order('follower_count', { ascending: false }).limit(60);
  if (S.cat !== 'Tudo') q = q.eq('category', S.cat);
  // Sanitiza o termo de pesquisa antes de o meter num filtro .or() do PostgREST: sem remover
  // vírgulas e parênteses, o texto do utilizador fechava o filtro e injetava ramos extra.
  // `*` também sai: é o wildcard do ILIKE e transformava a pesquisa num scan completo.
  const t = S.q.trim().replace(/[%,()*]/g, '').slice(0, 60);
  if (t) q = q.or(`name.ilike.%${t}%,handle.ilike.%${t}%`, { referencedTable: 'profile' });
  // Com um termo de pesquisa (e sem filtro de categoria, que é só dos criadores), procura também fãs.
  const [{ data, error }, fas] = await Promise.all([q, t && S.cat === 'Tudo' ? fasVisiveis(24, t) : Promise.resolve([])]);
  if (error) return `<p class="empty">${esc(errText(error))}</p>`;
  const html = (data || []).map(creatorCard).join('') + fas.map(faCard).join('');
  return html || `<p class="empty">${t ? 'Ninguém encontrado com esse nome.' : 'Nenhum criador encontrado.'} Experimenta outra palavra ou categoria.</p>`;
}
export async function vExplorar() {
  const ints = me_().interests || [];
  const main = `<div class="pagehead"><div><h1>Explorar</h1><p>Criadores angolanos com conteúdos que não encontras noutro lado.</p></div><a class="btn out" href="#top">${ic('trophy')}Top 10</a></div>
   <label class="search">${ic('search')}<input id="q" type="search" placeholder="Procurar criadores e pessoas por nome ou @" value="${esc(S.q)}" aria-label="Procurar criadores e pessoas"></label>
   <div class="chips" role="group" aria-label="Categorias">${['Tudo', ...CATS].map((c) => `<button class="chip ${S.cat === c ? 'on' : ''}" data-act="cat" data-v="${c}">${c}</button>`).join('')}</div>
   ${ints.length && S.cat === 'Tudo' && !S.q ? `<p class="suggest">Os teus interesses: ${ints.map(esc).join(', ')}. Toca numa categoria para filtrar.</p>` : ''}
   <div class="cgrid" id="cgrid">${await exploreGrid()}</div>`;
  return main;
}

/* ---------- Perfil ---------- */
async function perfilDeFa(p: any): Promise<string> {
  const mine = p.id === me_().id;
  const ban = !!p.banned_at && (!p.banned_until || new Date(p.banned_until) > new Date());
  if (ban && !mine) return `<div class="empty"><h2>Perfil indisponível</h2><p style="margin-top:8px">Esta conta não está disponível.</p><a class="btn out" style="margin-top:16px" href="#explorar">Voltar a explorar</a></div>`;
  const { data: fol } = mine ? { data: null } : await sb.from('follows').select('creator_id').eq('follower_id', me_().id).eq('creator_id', p.id).maybeSingle();
  const seguido = !!fol;
  const n = Number(p.follower_count) || 0;
  const desde = new Date(p.created_at).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  return `<div class="faprof box pad">
    <div class="faprof-top">${avatarOf(p, 'lg')}
     <div class="faprof-id"><h1>${esc(p.name || p.handle)}</h1><div class="muted">@${esc(p.handle)} <span class="tag plain">${p.role === 'fan' ? 'Fã' : p.role === 'admin' ? 'Equipa' : p.role === 'moderator' ? 'Equipa' : 'Membro'}</span></div></div>
     ${mine ? '<a class="btn out" href="#conta">Editar perfil</a>' : `<button class="btn ${seguido ? 'out' : 'pri'}" data-act="follow" data-id="${esc(p.id)}" data-on="${seguido ? 1 : 0}">${seguido ? 'A seguir' : 'Seguir'}</button>`}</div>
    <div class="faprof-num"><span><b>${dots(n)}</b> seguidor${n === 1 ? '' : 'es'}</span><span>Desde ${esc(desde)}</span>${p.country ? `<span>${ic('pin')}${esc(p.country)}</span>` : ''}</div>
    ${(p.interests || []).length ? `<div><div class="small muted" style="margin-bottom:6px">Interesses</div><div class="row wrapf" style="gap:6px">${p.interests.map((x: string) => `<span class="tag plain">${esc(x)}</span>`).join('')}</div></div>` : ''}
    ${!mine ? `<button class="btn link small" style="align-self:flex-start" data-act="report" data-type="creator" data-id="${esc(p.id)}">Denunciar perfil</button>` : ''}
  </div>`;
}

export async function vPerfil(handle: any) {
  const { data: prof } = await sb.from('profiles').select(FA_SEL + ',role,banned_at,banned_until').eq('handle', handle).maybeSingle<any>();
  const { data: c } = prof ? await sb.from('creators').select('*').eq('id', prof.id).maybeSingle() : { data: null };
  // Perfil sem página de criador: mostra o perfil de fã (seguível), a menos que esteja banido.
  if (prof && !c) return perfilDeFa(prof);
  if (!prof || !c) return `<div class="empty"><h2>Perfil não encontrado</h2><p style="margin-top:8px">Este perfil não existe ou ainda está em verificação.</p><a class="btn out" style="margin-top:16px" href="#explorar">Voltar a explorar</a></div>`;
  c.profile = prof;
  const mine = c.id === me_().id;
  // Um perfil que não passou na verificação só pode ser visto por quem o tem. Sem este if, o
  // perfil completo (capa, bio, publicações) aparecia público enquanto a página dizia "só tu vês".
  if (!mine && c.status !== 'approved') {
    return `<div class="empty"><h2>Perfil ainda não disponível</h2><p style="margin-top:8px">Este perfil está em verificação e só aparece depois de a equipa o aprovar.</p><a class="btn out" style="margin-top:16px" href="#explorar">Voltar a explorar</a></div>`;
  }
  const [{ data: sub }, { data: fol }, { data: rawPosts }] = await Promise.all([
    sb.from('subscriptions').select('*').eq('fan_id', me_().id).eq('creator_id', c.id).maybeSingle(),
    sb.from('follows').select('creator_id').eq('follower_id', me_().id).eq('creator_id', c.id).maybeSingle(),
    sb.from('posts').select(POST_SEL).eq('creator_id', c.id).in('status', mine ? ['published', 'draft', 'hidden'] : ['published']).order('published_at', { ascending: false }).limit(40),
  ]);
  const posts = await enrichPosts(rawPosts || []);
  const active = sub && sub.status === 'active' && new Date(sub.current_period_end) > new Date();
  let acts;
  if (mine) acts = `<a class="btn pri" href="#estudio">Abrir o meu estúdio</a><button class="btn out" data-act="stGo" data-v="nova">${ic('plus')}Nova publicação</button>`;
  else acts = `${c.price ? (active ? `<button class="btn soft" data-act="goSubs">${ic('check')}Subscrito até ${fmtDate(sub.current_period_end)}</button>` : `<button class="btn pri" data-act="subscribe" data-id="${c.id}">${sub ? 'Renovar' : 'Subscrever'} por ${kz(c.price)}/mês</button>`) : '<span class="tag plain" style="justify-content:center;padding:10px">Perfil gratuito · segue para ver</span>'}
   <div class="row" style="gap:8px"><button class="btn out" style="flex:1" data-act="follow" data-id="${c.id}" data-on="${fol ? 1 : 0}">${fol ? 'A seguir' : 'Seguir'}</button>
   <button class="tbtn" style="height:42px;width:42px" data-act="tip" data-id="${c.id}" aria-label="Enviar gorjeta" title="Enviar gorjeta">${ic('gift')}</button>
   <button class="tbtn" style="height:42px;width:42px" data-act="dm" data-id="${c.id}" aria-label="Enviar mensagem" title="Enviar mensagem">${ic('chat')}</button></div>`;
  const tabs = [['pub', 'Publicações'], ['media', 'Fotos e vídeos'], ['sobre', 'Sobre']];
  let body = '';
  if (S.ptab === 'pub') body = `<div class="feed">${posts.map(postHTML).join('') || `<p class="empty">${mine ? 'Ainda não publicaste nada.' : 'Ainda sem publicações.'}</p>`}</div>`;
  else if (S.ptab === 'media') {
    const tiles: Array<{ p: any; m: any }> = posts.flatMap((p: any) => (p.canSee ? (p.urls || []).filter((m: any) => m.url).map((m: any) => ({ p, m })) : (p.media?.length ? [{ p, m: null }] : []))).slice(0, 60);
    body = tiles.length ? `<div class="cgrid" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px">${tiles.map(({ p, m }) => `<a class="post" style="padding:0" href="#p-${p.id}"><div class="media ${m ? '' : 'locked'}" style="aspect-ratio:1">${m ? (m.type?.startsWith('video') ? `<video src="${esc(m.url)}" muted preload="metadata"></video>` : `<img src="${esc(m.url)}" alt="" loading="lazy">`) : (p.preview_url ? `<img loading="lazy" decoding="async" src="${esc(p.preview_url)}" alt="">` : '')}${m ? '' : `<div class="lock">${ic('lock')}</div>`}</div></a>`).join('')}</div>` : '<p class="empty">Sem fotos nem vídeos.</p>';
  } else body = `<div style="max-width:640px" class="stack"><p style="white-space:pre-line">${esc(c.bio)}</p>
    <dl class="kv"><dt>Categoria</dt><dd>${esc(c.category)}</dd><dt>Cidade</dt><dd>${esc(c.city)}, Angola</dd><dt>Na plataforma desde</dt><dd>${fmtDate(c.created_at)}</dd><dt>Subscrição</dt><dd>${c.price ? kz(c.price) + ' por mês' : 'Gratuita'}</dd><dt>Identidade</dt><dd>${c.status === 'approved' ? 'Verificada' : 'Em verificação'}</dd></dl>
    ${mine ? '' : `<button class="btn link small" style="align-self:flex-start" data-act="report" data-type="creator" data-id="${c.id}">Denunciar perfil</button>`}</div>`;
  const about = `<div class="box pad stack" style="gap:12px">
    <h3>Sobre ${esc(cname(c))}</h3>
    <div class="stack" style="gap:8px">
     <div class="row" style="justify-content:space-between"><span class="muted small">Assinantes</span><b>${dots(c.subscriber_count)}</b></div>
     <div class="row" style="justify-content:space-between"><span class="muted small">Seguidores</span><b>${dots(c.follower_count)}</b></div>
     <div class="row" style="justify-content:space-between"><span class="muted small">Publicações</span><b>${dots(c.post_count)}</b></div>
     <div class="row" style="justify-content:space-between"><span class="muted small">Cidade</span><b>${esc(c.city)}</b></div>
    </div>
    <div class="row wrapf" style="gap:6px"><span class="tag plain">${esc(c.category)}</span>${c.status === 'approved' ? `<span class="tag ok">${ic('badge')}Verificada</span>` : '<span class="tag plain">Em verificação</span>'}</div>
   </div>`;
  return `${c.status !== 'approved' ? `<div class="banner">${ic('clock')}<span><b>O teu perfil está em verificação.</b> Só tu o vês até a equipa aprovar os documentos.</span></div>` : ''}
   <div class="cover" style="${c.cover_url ? `background-image:${cssUrl(c.cover_url)}` : ''}"></div>
   <section class="phead">${prof.avatar_url ? `<div class="big"><img src="${esc(prof.avatar_url)}" alt=""></div>` : `<div class="big">${esc((cname(c) || '?')[0].toUpperCase())}</div>`}
    <div class="info"><h1 style="display:flex;align-items:center;gap:8px">${esc(cname(c))}${c.status === 'approved' ? `<span style="color:var(--acc);display:inline-flex" title="Identidade verificada">${ic('badge', 'style="width:22px;height:22px"')}</span>` : ''}</h1>
     <div class="muted">@${esc(prof.handle)}</div>
     <p style="margin-top:10px;max-width:62ch">${esc((c.bio || '').slice(0, 220))}</p>
     <div class="meta"><span>${ic('pin')}${esc(c.city)}, Angola</span><span>${ic('cal')}Desde ${fmtDate(c.created_at)}</span></div>
     <div class="stats3"><div><b>${dots(c.post_count)}</b><span class="small muted">publicações</span></div><div><b>${dots(c.follower_count)}</b><span class="small muted">seguidores</span></div></div>
    </div><div class="acts">${acts}</div></section>
   <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${S.ptab === k}" class="${S.ptab === k ? 'on' : ''}" data-act="ptab" data-v="${k}">${l}</button>`).join('')}</div>
   <div class="profwrap"><aside class="profside">${about}</aside><div class="profmain">${body}</div></div>`;
}

export async function vPost(id: any) {
  const { data } = await sb.from('posts').select(POST_SEL).eq('id', id).maybeSingle();
  if (!data) return `<div class="empty"><h2>Publicação não encontrada</h2><a class="btn out" style="margin-top:14px" href="#feed">Voltar ao início</a></div>`;
  // Mesmo bloqueio que no perfil: posts de rascunho, escondidos ou de um criador por verificar
  // não podem ser abertos por link direto.
  if (data.creator_id !== me_().id && (data.status !== 'published' || data.creator?.status !== 'approved')) {
    return `<div class="empty"><h2>Publicação não disponível</h2><p style="margin-top:8px">Esta publicação não está disponível.</p><a class="btn out" style="margin-top:14px" href="#feed">Voltar ao início</a></div>`;
  }
  const [p] = await enrichPosts([data]);
  return `<div style="max-width:640px;margin:0 auto" class="stack"><a class="btn link" href="#perfil-${esc(p.creator.profile.handle)}">${ic('back', 'style="width:16px;height:16px"')}Ver perfil de ${esc(cname(p.creator))}</a>${postHTML(p)}</div>`;
}

/* ---------- Subscrições ---------- */
export async function vSubs() {
  const { data } = await sb.from('subscriptions').select('*, creator:creators(id,price,category,bio,profile:profiles!creators_id_fkey(handle,name,avatar_url))').eq('fan_id', me_().id).order('started_at', { ascending: false });
  const list = data || [];
  const card = (s: any) => {
    const c = s.creator, on = s.status === 'active' && new Date(s.current_period_end) > new Date();
    return `<div class="box pad stack" style="gap:14px">
     <div class="row" style="gap:14px">${avatarOf(c.profile, 'lg')}<div style="flex:1;min-width:0"><div class="row between"><h3>${esc(cname(c))}</h3>${on ? (s.auto_renew ? '<span class="tag ok">Ativa</span>' : '<span class="tag warn">Não renova</span>') : '<span class="tag plain">Terminada</span>'}</div><p class="small muted">${esc(c.category)}</p></div></div>
     <dl class="kv"><dt>Valor</dt><dd>${kz(s.price)}/mês</dd><dt>${on ? (s.auto_renew ? 'Renova a' : 'Acesso até') : 'Terminou a'}</dt><dd>${fmtDate(s.current_period_end)}</dd><dt>Desde</dt><dd>${fmtDate(s.started_at)}</dd></dl>
     <div class="row wrapf"><a class="btn out sm" href="#perfil-${esc(c.profile.handle)}">Ver perfil</a>
      ${on ? (s.auto_renew ? `<button class="btn out sm" data-act="autoRenew" data-id="${c.id}" data-on="0">Cancelar renovação</button>` : `<button class="btn pri sm" data-act="autoRenew" data-id="${c.id}" data-on="1">Retomar renovação</button>`) : `<button class="btn pri sm" data-act="subscribe" data-id="${c.id}">Renovar por ${kz(c.price)}</button>`}</div></div>`;
  };
  return `<div class="pagehead"><div><h1>Subscrições</h1><p>As subscrições renovam todos os meses com o saldo da carteira. Saldo atual: <b style="color:var(--ink)">${kz(me_().wallet_balance)}</b> · <a href="#carteira">carregar</a></p></div></div>
   ${list.length ? `<div class="subgrid">${list.map(card).join('')}</div>` : '<div class="box empty">Ainda não subscreves ninguém.<br><a href="#explorar" class="btn out" style="margin-top:14px">Explorar criadores</a></div>'}`;
}

/* ---------- Meus conteúdos ---------- */
// Teto por página. Sem isto a query crescia sem limite e o .in() com todos os UUIDs batia no
// limite de URL do PostgREST (HTTP 414), dejando a página inteira em erro.
const COMPRAS_PAGE = 20;
export async function vCompras() {
  const page = Math.max(0, Number(S.comprasPage) || 0);
  // `purchases` não tem coluna `status`: cada linha já é uma compra concluída (o estado
  // do pagamento vive em `orders`). Um .eq('status') aqui dava HTTP 400 e a consulta inteira falhava.
  const { data: purchases } = await sb.from('purchases').select('*').eq('user_id', me_().id)
    .order('created_at', { ascending: false })
    .range(page * COMPRAS_PAGE, page * COMPRAS_PAGE + COMPRAS_PAGE - 1);
  const list = purchases || [];
  const postIds = list.filter((x) => x.kind === 'post').map((x) => x.ref_id);
  const msgIds = list.filter((x) => x.kind === 'message').map((x) => x.ref_id);
  const liveIds = list.filter((x) => x.kind === 'ticket').map((x) => x.ref_id);

  const [{ data: rawPosts }, { data: rawMsgs }, { data: rawLives }] = await Promise.all([
    postIds.length ? sb.from('posts').select(POST_SEL).in('id', postIds) : Promise.resolve({ data: [] }),
    msgIds.length ? sb.from('messages').select('*, thread:threads(id,creator:creators(id,profile:profiles!creators_id_fkey(handle,name,avatar_url)))').in('id', msgIds) : Promise.resolve({ data: [] }),
    liveIds.length ? sb.from('lives').select('*, creator:creators(id,profile:profiles!creators_id_fkey(handle,name,avatar_url))').in('id', liveIds) : Promise.resolve({ data: [] }),
  ]);

  const postMap = new Map((await enrichPosts(rawPosts || [])).map((p: any) => [p.id, p]));
  const msgs = rawMsgs || [];
  const msgPaths = msgs.flatMap((m) => (m.media || []).map((f: HTMLFormElement) => f.path));
  const msgUrls = msgPaths.length ? await signedUrls('messages', msgPaths) : {};
  const msgMap = new Map(msgs.map((m) => [m.id, m]));
  const liveMap = new Map((rawLives || []).map((l) => [l.id, l]));

  const rowHTML = (x: any) => {
    if (x.kind === 'post') {
      const p = postMap.get(x.ref_id);
      return p ? postHTML(p) : null;
    }
    if (x.kind === 'message') {
      const m = msgMap.get(x.ref_id); if (!m) return null;
      const c = m.thread?.creator;
      const files = (m.media || []).map((f: HTMLFormElement) => f.type?.startsWith('video')
        ? `<video src="${esc(msgUrls[f.path] || '')}" controls playsinline controlsList="nodownload" style="width:100%;border-radius:8px"></video>`
        : `<img src="${esc(msgUrls[f.path] || '')}" alt="" style="width:100%;border-radius:8px" oncontextmenu="return false">`).join('');
      return `<article class="box pad stack" style="gap:10px">
       <div class="row between"><a class="row" style="gap:10px;text-decoration:none" href="#perfil-${esc(c?.profile?.handle || '')}">${avatarOf(c?.profile, 'sm')}<div><b style="color:var(--ink)">${esc(c?.profile?.name || c?.profile?.handle || '')}</b><div class="small muted">${fmtDate(x.created_at)}</div></div></a><span class="tag warn">${ic('lock')}${kz(x.amount)}</span></div>
       ${m.body ? `<p style="white-space:pre-line">${esc(m.body)}</p>` : ''}${files}
       <a class="btn out sm" style="align-self:flex-start" href="#mensagens">Ver conversa</a></article>`;
    }
    if (x.kind === 'ticket') {
      const l = liveMap.get(x.ref_id); if (!l) return null;
      const c = l.creator;
      const tag = l.status === 'live' ? '<span class="tag acc">AO VIVO</span>' : l.status === 'ended' ? '<span class="tag plain">Terminada</span>' : '<span class="tag ok">Agendada</span>';
      return `<article class="box pad stack" style="gap:10px">
       <div class="row between"><a class="row" style="gap:10px;text-decoration:none" href="#perfil-${esc(c?.profile?.handle || '')}">${avatarOf(c?.profile, 'sm')}<div><b style="color:var(--ink)">${esc(c?.profile?.name || c?.profile?.handle || '')}</b><div class="small muted">${esc(l.title)}</div></div></a>${tag}</div>
       <div class="row wrapf"><span class="tag plain">Bilhete · ${kz(x.amount)}</span>${l.status !== 'ended' ? `<a class="btn pri sm" href="#live-${l.id}">Entrar na live</a>` : ''}</div></article>`;
    }
    return null;
  };
  const rows = list.map(rowHTML).filter(Boolean);
  const hasMore = list.length === COMPRAS_PAGE;
  const pager = (page > 0 || hasMore) ? `<div class="row" style="justify-content:center;gap:10px;margin-top:18px">
   ${page > 0 ? `<button class="btn out" data-act="comprasPage" data-v="${page - 1}">Anteriores</button>` : ''}
   ${hasMore ? `<button class="btn out" data-act="comprasPage" data-v="${page + 1}">Mais</button>` : ''}</div>` : '';

  return `<div class="pagehead"><div><h1>Meus conteúdos</h1><p>Publicações, mensagens e bilhetes que já compraste — ficam sempre disponíveis aqui.</p></div></div>
   ${rows.length ? `<div class="stack" style="gap:14px">${rows.join('')}</div>${pager}` : '<div class="box empty">Ainda não compraste nenhum conteúdo.<br><a href="#explorar" class="btn out" style="margin-top:14px">Explorar criadores</a></div>'}`;
}

/* ---------- Carteira ---------- */
export async function vCarteira() {
  const [{ data: tx }, { data: orders }] = await Promise.all([
    sb.from('wallet_tx').select('*').eq('user_id', me_().id).order('created_at', { ascending: false }).limit(50),
    sb.from('orders').select('id,kind,amount,method,status,created_at,provider_data').eq('user_id', me_().id).eq('status', 'pending').eq('method', 'reference').order('created_at', { ascending: false }).limit(5),
  ]);
  return `<div class="pagehead"><div><h1>Carteira</h1><p>Carrega saldo e usa-o em subscrições, bilhetes, gorjetas e compras, sem aprovar cada pagamento. As subscrições renovam com este saldo.</p></div></div>
   <div class="two"><div class="stack">
    <div class="kpis" style="margin:0"><div class="kpi"><div class="l">Saldo disponível</div><div class="v">${kz(me_().wallet_balance)}</div><div class="s">O saldo não é convertível em dinheiro.</div></div></div>
    ${orders?.length ? `<div class="box pad stack"><h4>Referências por pagar</h4>${orders.map((o) => `<div class="row between wrapf"><span>${kz(o.amount)} · entidade <b>${esc(o.provider_data?.entity || '')}</b> · referência <b>${esc(o.provider_data?.reference || '')}</b></span><span class="small muted">até ${esc(o.provider_data?.expires || '')}</span></div>`).join('')}</div>` : ''}
    <div class="tw"><table style="min-width:420px"><thead><tr><th>Data</th><th>Movimento</th><th class="num">Valor</th></tr></thead><tbody>${(tx || []).length ? (tx || []).map((x) => `<tr><td>${fmtDate(x.created_at)}</td><td>${esc(x.description)}</td><td class="num" style="color:${x.amount > 0 ? 'var(--ok)' : 'var(--text)'}">${x.amount > 0 ? '+' : '−'}${kz(Math.abs(x.amount))}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">Ainda sem movimentos.</td></tr>'}</tbody></table></div>
   </div>
   <div class="box pad stack"><h3>Carregar saldo</h3>
    <div class="amts" role="group" aria-label="Valor">${[2000, 5000, 10000, 20000].map((v) => `<button type="button" class="${(S.topAmt || 5000) === v ? 'on' : ''}" data-act="topAmt" data-v="${v}">${dots(v)}</button>`).join('')}</div>
    <div class="field"><label for="topOther">Outro valor (Kz)</label><input id="topOther" type="number" min="${S.cfg.min_topup}" step="500" placeholder="Mínimo ${dots(S.cfg.min_topup)}"></div>
    <button class="btn pri" data-act="topup">Carregar</button>
    <p class="small muted">Multicaixa Express, referência Multicaixa ou PayPal.</p></div></div>`;
}

/* ---------- Ações ---------- */
function tipModal(creatorId: string, liveId?: string | null) {
  S.tipAmt = 1000; S.tipTarget = { creatorId, liveId };
  modal(`<h3>Enviar gorjeta</h3><p class="small muted">Escolhe um valor e envia.</p>
   <div class="amts" role="group" aria-label="Valor">${[500, 1000, 2500, 5000].map((v) => `<button type="button" class="${v === 1000 ? 'on' : ''}" data-act="tipAmt" data-v="${v}">${dots(v)}</button>`).join('')}</div>
   <div class="field"><label for="tipOther">Outro valor (Kz)</label><input id="tipOther" type="number" min="${S.cfg.min_tip}" step="100"></div>
   <div class="field"><label for="tipMsg">Mensagem (opcional)</label><input id="tipMsg" maxlength="140"></div>
   <span class="err" id="tipErr" hidden></span>
   <button class="btn pri block" data-act="tipGo">Continuar para pagamento</button>`);
}

export const fanActions = {
  cat(d: Record<string, string>) { S.cat = d.v; rerender(); },
  comprasPage(d: Record<string, string>) { S.comprasPage = Math.max(0, +d.v || 0); rerender(false); },
  openMedia(d: Record<string, string>) {
    // Abre todos os ficheiros da publicação, a começar no que foi clicado.
    let itens: ItemDoVisor[] = [];
    try { itens = JSON.parse($<HTMLElement>(`#post-${d.post} [data-gal]`)?.dataset.gal || '[]'); } catch { /* fica só o ficheiro clicado */ }
    if (itens.length) galeria(itens, +d.i || 0);
    else lightbox(d.url, d.kind === 'video' ? 'video' : 'image');
  },
  openImg(d: Record<string, string>) { lightbox(d.url); },
  expandBody(d: Record<string, string>) {
    const p = $(`#post-${d.id} .postbody`); if (!p) return;   // o post pode não ter texto
    p.classList.remove('clamp'); $(`#post-${d.id} .more-btn`)?.remove();
  },
  ptab(d: Record<string, string>) { S.ptab = d.v; rerender(); },
  goSubs() { go('subscricoes'); },
  // Preço, disponibilidade e estado do perfil são lidos no servidor por openPay (js/pay.js).
  subscribe(d: Record<string, string>) {
    openPay({ kind: 'subscription', target_id: d.id, recurring: true, title: 'Subscrever', sub: 'Acesso às publicações para subscritores durante um mês.', okText: 'Subscrição ativa.', onPaid: () => rerender() });
  },
  buyPost(d: Record<string, string>) {
    openPay({ kind: 'post', target_id: d.id, title: 'Desbloquear publicação', sub: 'Fica disponível na tua conta para sempre.', okText: 'Publicação desbloqueada.', onPaid: () => rerender() });
  },
  tip(d: Record<string, string>) { tipModal(d.id, d.live || null); },
  // Só o bloco de valores visível: a carteira tem o seu próprio .amts e as duas listas
  // partilhavam o selector global, o que desmarrava a seleção do outro lado.
  tipAmt(d: Record<string, string>) { S.tipAmt = +d.v; $$('#modalRoot .amts button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); const o = $('#tipOther'); if (o) o.value = ''; },
  topAmt(d: Record<string, string>) { S.topAmt = +d.v; $$('main .amts button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); const o = $('#topOther'); if (o) o.value = ''; },
  tipGo() {
    const o = +$('#tipOther').value, amt = o || S.tipAmt, msg = $('#tipMsg').value.trim();
    if (!Number.isFinite(amt) || amt < S.cfg.min_tip) return showErr('#tipErr', `A gorjeta mínima é ${kz(S.cfg.min_tip)}.`);
    const alvo = S.tipTarget; if (!alvo) return;
      const meta: Record<string, unknown> = { message: msg }; if (alvo.liveId) meta.live_id = alvo.liveId;
    openPay({ kind: 'tip', target_id: alvo.creatorId, amount: amt, meta, title: 'Gorjeta', sub: msg ? '“' + msg + '”' : 'Um obrigado direto a quem cria.', okText: 'Gorjeta enviada. Obrigado!' });
  },
  async follow(d: Record<string, string>) {
    if (!S.me) return toast('Entra na tua conta para seguir.');
    if (!d.id) return;
    const on = d.on === '1';
    // `ignoreDuplicates`: dois toques seguidos (ou um botão desactualizado noutro separador)
    // tentavam seguir duas vezes e o segundo pedido falhava com HTTP 409.
    const q = on ? sb.from('follows').delete().eq('follower_id', me_().id).eq('creator_id', d.id)
      : sb.from('follows').upsert({ follower_id: me_().id, creator_id: d.id }, { onConflict: 'follower_id,creator_id', ignoreDuplicates: true });
    const { error } = await q; if (error) return toast(errText(error));
    toast(on ? 'Deixaste de seguir' : 'A seguir'); rerender();
  },
  async like(d: Record<string, string>) {
    const el = $(`#post-${d.id} [data-act=like]`); if (!el) return;
    if (el.disabled) return;                       // dois toques rápidos disparavam insert+delete em paralelo
    const on = el.classList.contains('on');
    const n = el.querySelector('.num');
    const before = n ? n.textContent : null;
    el.disabled = true;
    el.classList.toggle('on', !on);
    if (n) n.textContent = dots(Number(before.replace(/\./g, '')) + (on ? -1 : 1));
    el.querySelector('svg')?.setAttribute('fill', on ? 'none' : 'currentColor');
    const { error } = on ? await sb.from('post_likes').delete().eq('post_id', d.id).eq('user_id', me_().id) : await sb.from('post_likes').upsert({ post_id: d.id, user_id: me_().id }, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
    el.disabled = false;
    // Reverte o otimismo se a base de dados discordar, para o número não ficar mentindo.
    if (error) { el.classList.toggle('on', on); if (n) n.textContent = before; el.querySelector('svg')?.setAttribute('fill', on ? 'none' : 'currentColor'); toast(errText(error)); }
  },
  async save(d: Record<string, string>) {
    const el = $(`#post-${d.id} [data-act=save]`); if (!el) return;
    if (el.disabled) return;
    const on = el.classList.contains('on');
    el.disabled = true;
    el.classList.toggle('on', !on); el.querySelector('svg')?.setAttribute('fill', on ? 'none' : 'currentColor');
    const { error } = on ? await sb.from('saves').delete().eq('post_id', d.id).eq('user_id', me_().id) : await sb.from('saves').upsert({ post_id: d.id, user_id: me_().id }, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
    el.disabled = false;
    if (error) { el.classList.toggle('on', on); el.querySelector('svg')?.setAttribute('fill', on ? 'none' : 'currentColor'); }
    toast(error ? errText(error) : on ? 'Removido dos guardados' : 'Guardado');
  },
  async dm(d: Record<string, string>) {
    const { data, error } = await sb.rpc('open_thread', { p_creator: d.id });
    if (error) return toast(errText(error));
    S.thread = data; go('mensagens');
  },
  async autoRenew(d: Record<string, string>) {
    const { error } = await sb.rpc('set_auto_renew', { p_creator: d.id, p_on: d.on === '1' });
    toast(error ? errText(error) : d.on === '1' ? 'Renovação retomada' : 'Renovação cancelada. Manténs o acesso até ao fim do período.');
    rerender();
  },
  report(d: Record<string, string>) {
    modal(`<h3>Denunciar</h3><div class="stack" style="gap:8px" role="radiogroup">${['Perfil falso ou roubo de identidade', 'Pessoa com menos de 18 anos', 'Conteúdo publicado sem consentimento', 'Direitos de autor', 'Violência ou ódio', 'Outro motivo'].map((r, i) => `<label class="opt"><input type="radio" name="rep" value="${r}" ${i ? '' : 'checked'}><span><b style="font-weight:600">${r}</b></span></label>`).join('')}</div>
     <div class="field"><label for="repTxt">Detalhes (opcional)</label><textarea id="repTxt" maxlength="1000" style="min-height:80px"></textarea></div>
     <button class="btn pri block" data-act="repSend" data-type="${d.type}" data-id="${d.id}">Enviar denúncia</button>`);
  },
  async repSend(d: Record<string, string>) {
    if (!S.me) return toast('Entra na tua conta para enviar uma denúncia.');
    // O botão pode ser despoletado sem o modal aberto (clique sintético, ou a janela já
    // fechada): ler $('…').value diretamente rebentava com TypeError.
    const picked = $('input[name=rep]:checked'), txt = $('#repTxt');
    const reason = picked?.value;
    if (!reason) return toast('Escolhe um motivo.');
    if (!['post', 'creator', 'message', 'live'].includes(d.type) || !d.id) return toast('Denúncia inválida.');
    const { error } = await sb.from('reports').insert({ reporter_id: me_().id, target_type: d.type, target_id: d.id, reason, details: txt?.value.trim() || null });
    closeModal(); toast(error ? errText(error) : 'Denúncia enviada. Respondemos em até 24 horas.');
  },
  topup() {
    const o = +$('#topOther').value, amt = o || S.topAmt || 5000;
    if (!Number.isFinite(amt) || amt < S.cfg.min_topup) return toast(`O carregamento mínimo é ${kz(S.cfg.min_topup)}.`);
    openPay({ kind: 'topup', amount: amt, title: 'Carregar carteira', sub: 'O saldo fica disponível assim que o pagamento for confirmado.', okText: `Carregaste ${kz(amt)}.`, onPaid: () => rerender() });
  },
};

let qT: ReturnType<typeof setTimeout> | undefined;
let exploreSeq = 0;
register({
  actions: fanActions,
  // Pesquisa do Explorar: redesenha só a grelha, com a última pesquisa a ganhar.
  input: (t) => {
    if (t.id !== 'q') return false;
    S.q = t.value; clearTimeout(qT);
    const seq = ++exploreSeq;
    qT = setTimeout(async () => {
      const html = await exploreGrid();
      if (seq !== exploreSeq) return; // uma pesquisa mais lenta já não interessa
      const g = $('#cgrid'); if (g) g.innerHTML = html;
    }, 300);
    return true;
  },
});
