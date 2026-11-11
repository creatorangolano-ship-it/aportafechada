// Fã: início, explorar, perfis, publicações, subscrições, carteira
import { sb, $, $$, esc, kz, dots, ic, PORTA, avatarOf, toast, modal, closeModal, showErr, errText, busy, safeName, upload, copyText, fmtDate, ago, signedUrls, safeHref, isExternal, rerender, go, lightbox, galeria, type ItemDoVisor } from '../lib';
import { colunaDe, posicaoNoFeed, promocaoDaVisita, TEXTO_BOTAO_PADRAO } from '../../domain/platform/promo.ts';
import { register } from '../registry';
import { S, isStaff } from '../state';
import { openPay } from '../pay';

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
  const fich = n ? `<span class="lk-k">${n} ${n === 1 ? 'ficheiro' : 'ficheiros'}</span>` : '';
  if (p.preview_url || n) return `<div class="media locked">${p.preview_url ? `<img loading="lazy" decoding="async" src="${esc(p.preview_url)}" alt="">` : ''}<div class="lock"><span class="porta">${PORTA(30)}</span>${fich}<b>Conteúdo exclusivo</b><span class="small">${msg}</span></div>${btn}</div>`;
  return `<div class="textlock"><span class="porta">${PORTA(26)}</span><b style="color:var(--ink)">${msg}</b>${btn}</div>`;
}

export function postHTML(p: any) {
  const c = p.creator, mine = p.creator_id === me_().id;
  const acesso = p.access === 'free' ? '' : `<span class="plk" title="${p.access === 'subscribers' ? (c.price ? 'Só para subscritores' : 'Só para seguidores') : 'Pago à parte: ' + kz(p.price)}">${ic('lock')}</span>`;
  const n = Number(p.like_count || 0);
  // Cartão: cabeçalho (foto, nome verificado, há quanto tempo, cadeado se não for
  // grátis, e o menu «⋯»), texto, média de ponta a ponta sobre fundo preto, barra de
  // acções (gosto, gorjeta, guardar à direita) e a linha com os números.
  // Comentários e visualizações só aparecem depois da migração 0013 (antes disso as colunas não vêm).
  const temCm = p.comment_count !== undefined, cmOn = p.comments_enabled !== false;
  const nc = Number(p.comment_count || 0), nv = Number(p.view_count || 0);
  return `<article class="box post" id="post-${p.id}"${p.canSee && !mine ? ` data-view="${p.id}"` : ''}>
   <header class="phd"><a class="pauthor" href="#perfil-${esc(c.profile.handle)}">${avatarOf(c.profile, 'md')}<span><b>${esc(cname(c))}<span class="pok" title="Identidade verificada">${ic('badge')}</span></b><span class="pmeta">${ago(p.published_at || p.created_at)}${acesso}</span></span></a>${p.seguir ? `<button class="pseguir" data-act="follow" data-id="${c.id}" data-on="0">Seguir</button>` : ''}
    <button class="pmenu" data-act="postMenu" data-id="${p.id}" data-mine="${mine ? 1 : 0}" data-cm="${cmOn ? 1 : 0}" aria-label="Mais opções" title="Mais opções"><i></i><i></i><i></i></button></header>
   <div class="ptx">${p.canSee && p.body ? `<p class="postbody clamp">${esc(p.body)}</p><button class="btn link small more-btn" data-act="expandBody" data-id="${p.id}" hidden>Ver mais</button>` : ''}</div>
   ${mediaHTML(p)}
   <div class="pf">
    <button data-act="like" data-id="${p.id}" class="${p.liked ? 'on' : ''}" aria-pressed="${p.liked}" aria-label="Gosto" title="Gosto" ${p.canSee ? '' : 'disabled'}>${ic('heart', p.liked ? 'fill="currentColor"' : '')}</button>
    ${temCm ? `<button data-act="comments" data-id="${p.id}" class="${cmOn ? '' : 'pcm-off'}" aria-label="${cmOn ? 'Comentários' : 'Comentários desativados'}" title="${cmOn ? 'Comentários' : 'O criador desativou os comentários'}" ${p.canSee ? '' : 'disabled'}>${ic('chat')}</button>` : ''}
    ${mine ? '' : `<button data-act="tip" data-id="${c.id}">${ic('coin')}<span>Enviar gorjeta</span></button>`}
    <button class="psave ${p.saved ? 'on' : ''}" data-act="save" data-id="${p.id}" aria-label="Guardar" title="Guardar">${ic('bookmark', p.saved ? 'fill="currentColor"' : '')}</button>
   </div>
   <div class="pstats"><span><span class="num">${dots(n)}</span> ${n === 1 ? 'gosto' : 'gostos'}</span>${temCm ? `<button class="pstat-cm" data-act="comments" data-id="${p.id}" ${p.canSee ? '' : 'disabled'}><span class="ncm">${dots(nc)}</span> ${nc === 1 ? 'comentário' : 'comentários'}</button><span>${dots(nv)} ${nv === 1 ? 'visualização' : 'visualizações'}</span>` : ''}</div>
   ${temCm ? `<section class="pcm" id="pcm-${p.id}" data-on="${cmOn ? 1 : 0}" data-owner="${mine ? 1 : 0}" hidden></section>` : ''}</article>`;
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

/* ---------- Coluna esquerda: menu e anúncio ---------- */
function menuLateral(): string {
  const u = me_(), base = location.pathname.split('/')[1] || 'feed';
  const itens: [string, string, string][] = [
    ['feed', 'Início', 'home'], [`perfil-${u.handle}`, 'Meu perfil', 'user'], ['compras', 'Comprados', 'star'],
    ['mensagens', 'Mensagens', 'chat'], ['explorar', 'Explorar', 'compass'], ['guardados', 'Guardados', 'bookmark'],
  ];
  const on = (k: string) => (k.startsWith('perfil-') ? location.pathname === `/perfil/${u.handle}` : base === k);
  return `<nav class="lnav" aria-label="Menu">${itens.map(([k, l, i]) => `<a href="#${esc(k)}" class="${on(k) ? 'on' : ''}"${on(k) ? ' aria-current="page"' : ''}>${ic(i)}<span>${l}</span>${k === 'mensagens' && S.unreadMsgs ? `<span class="count">${S.unreadMsgs}</span>` : ''}</a>`).join('')}</nav>`;
}
function colunaEsquerda(anuncio: string): string {
  return `<aside class="lcol">${menuLateral()}${anuncio}</aside>`;
}
/** Promoção desta visita para as páginas com colunas (Explorar, Guardados): só o banner lateral. */
async function anuncioLateral(): Promise<{ esq: string; dir: string }> {
  const promo = promocaoDaVisita(await loadPromos(), voltaDaVisita());
  if (!promo) return { esq: '', dir: '' };
  const html = promoBanner(promo, 'lateral');
  return colunaDe(promo.position) === 'direita' ? { esq: '', dir: html } : { esq: html, dir: '' };
}

/** Links do rodapé (coluna direita do Início e coluna esquerda do perfil). */
function rodapeLinks(): string {
  return `<nav class="railfoot" aria-label="Sobre a plataforma"><a href="/sobre">Sobre a plataforma</a><a href="/funciona">Como funciona</a><a href="/termos">Termos e condições</a><a href="/privacidade">Política de privacidade</a><a href="/regras">Regras</a><a href="/faq">Perguntas frequentes</a><a href="/dmca">Direitos de autor</a><a href="/contacto">Contacto</a><a href="/afiliados">Afiliados</a><a href="/blog">Blog</a><a href="/" data-act="installApp">Instalar app</a><span>© ${new Date().getFullYear()} A Porta Fechada · Luanda, Angola</span></nav>`;
}

/* ---------- Início ---------- */
async function sideRail(banner: string) {
  const [{ data: on }, sug] = await Promise.all([
    sb.from('lives').select('id,title,creator:creators(id,profile:profiles!creators_id_fkey(handle,name,avatar_url))').eq('status', 'live').limit(5),
    sugestoesHTML(),
  ]);
  return `<aside class="rail2">
   ${banner}
   ${on?.length ? `<div><h4>Ao vivo agora</h4>${on.map((l: any) => `<a class="mini" href="#live-${l.id}">${avatarOf(l.creator.profile, 'sm')}<span class="t"><b>${esc(cname(l.creator))}</b><span>${esc(l.title)}</span></span><span class="tag acc">AO VIVO</span></a>`).join('')}</div>` : ''}
   <div id="sugBox">${sug}</div>
   ${rodapeLinks()}</aside>`;
}

/**
 * Perfis sugeridos: primeiro criadores aprovados que a pessoa ainda não segue nem
 * subscreve, depois fãs para completar (marcados «Fã»), para a lista nunca ficar
 * vazia numa plataforma ainda pequena. Baralhados a cada visita.
 */
async function perfisSugeridos(n: number): Promise<any[]> {
  const uid = me_().id;
  const [{ data: sug }, { data: fol }, { data: subs }, fas] = await Promise.all([
    sb.from('creators').select(CR_SEL).eq('status', 'approved').neq('id', uid).order('follower_count', { ascending: false }).limit(30),
    sb.from('follows').select('creator_id').eq('follower_id', uid),
    sb.from('subscriptions').select('creator_id').eq('fan_id', uid).eq('status', 'active'),
    fasVisiveis(30),
  ]);
  const known = new Set([...(fol || []), ...(subs || [])].map((x) => x.creator_id));
  const baralhar = <T,>(a: T[]): T[] => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cr = baralhar((sug || []).filter((c) => !known.has(c.id)));
  const fa = baralhar(fas.filter((p) => !known.has(p.id))).map((p) => ({ fa: true, profile: p }));
  return [...cr, ...fa].slice(0, n);
}

function cartaoSugerido(c: any): string {
  const nome = c.fa ? (c.profile.name || c.profile.handle) : cname(c);
  return `<a class="sugcard${c.fa ? ' fa' : ''}" href="#perfil-${esc(c.profile.handle)}">
     <span class="sugbg" style="${!c.fa && c.cover_url ? `background-image:${cssUrl(c.cover_url)}` : ''}"></span>
     ${c.fa ? '' : `<span class="sugtag">${c.price ? kz(c.price) + '/mês' : 'Grátis'}</span>`}
     ${avatarOf(c.profile, 'sugav')}
     <span class="sugmeta"><b><span class="sugnm">${esc(nome)}</span>${c.fa ? '' : `<span class="sugok" title="Identidade verificada">${ic('badge')}</span>`}</b><span>@${esc(c.profile.handle)}</span></span></a>`;
}

/** Coluna lateral do Início: três sugestões, com botão para ver outras. */
async function sugestoesHTML(): Promise<string> {
  const l = await perfisSugeridos(3);
  if (!l.length) return '';
  return `<div class="sughd"><h4>${ic('star')}Sugestões para ti</h4><button class="tbtn sm" data-act="sugRefresh" aria-label="Mostrar outras sugestões" title="Outras sugestões">${ic('compass')}</button></div>
   <div class="sugcards">${l.map(cartaoSugerido).join('')}</div>`;
}

/** Faixa horizontal de sugestões (Explorar, e o Início no telemóvel). */
async function faixaSugestoes(cls = ''): Promise<string> {
  const l = await perfisSugeridos(10);
  if (!l.length) return '';
  return `<section class="sugx ${cls}" aria-label="Perfis sugeridos"><div class="sughd"><h4>${ic('star')}Sugestões para ti</h4></div><div class="sugx-lista">${l.map(cartaoSugerido).join('')}</div></section>`;
}

/* ---------- Estados (como no WhatsApp e no Instagram) ----------
   Só criadores publicam; cada estado dura 24 horas. As regras de quem vê estão na
   base de dados (supabase/migrations/0012_estados.sql): a consulta já só devolve os
   estados de quem a pessoa segue ou subscreve. */
type Estado = { id: string; creator_id: string; path: string; media_type: 'image' | 'video'; caption: string | null; created_at: string; creator: any; visto?: boolean; url?: string };
let estados: { ordem: string[]; por: Map<string, Estado[]> } = { ordem: [], por: new Map() };

async function carregarEstados(): Promise<void> {
  const { data, error } = await sb.from('stories')
    .select('id,creator_id,path,media_type,caption,created_at,creator:creators(id,profile:profiles!creators_id_fkey(handle,name,avatar_url))')
    .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: true }).limit(300);
  if (error || !data?.length) { estados = { ordem: [], por: new Map() }; return; }
  const lista = data as unknown as Estado[];
  const { data: vistos } = await sb.from('story_views').select('story_id').eq('user_id', me_().id).in('story_id', lista.map((e) => e.id));
  const V = new Set((vistos || []).map((v: any) => v.story_id));
  const por = new Map<string, Estado[]>();
  for (const e of lista) {
    e.visto = V.has(e.id);
    if (!por.has(e.creator_id)) por.set(e.creator_id, []);
    por.get(e.creator_id)!.push(e);
  }
  const uid = me_().id;
  const ultimo = (id: string) => por.get(id)![por.get(id)!.length - 1].created_at;
  // Os meus primeiro; depois quem tem estados por ver; depois os já vistos (mais recente primeiro).
  const ordem = [...por.keys()].sort((a, b) => {
    if (a === uid) return -1;
    if (b === uid) return 1;
    const na = por.get(a)!.some((e) => !e.visto), nb = por.get(b)!.some((e) => !e.visto);
    if (na !== nb) return na ? -1 : 1;
    return ultimo(b).localeCompare(ultimo(a));
  });
  estados = { ordem, por };
}

async function rodaDeEstados(): Promise<string> {
  await carregarEstados();
  const uid = me_().id;
  const souCriador = !!S.creator && S.creator.status === 'approved';
  const meus = estados.por.get(uid);
  const outros = estados.ordem.filter((id) => id !== uid);
  if (!souCriador && !outros.length) return '';
  const meu = souCriador
    ? `<div class="roda-it eu"><button class="roda-anel${meus ? '' : ' vazio'}" data-act="${meus ? 'storyOpen' : 'storyNew'}" data-c="${uid}" aria-label="${meus ? 'Ver o teu estado' : 'Publicar estado'}">${avatarOf(me_(), 'roda-av')}</button><button class="roda-mais" data-act="storyNew" aria-label="Publicar estado">${ic('plus')}</button><span class="roda-nm">O teu estado</span></div>`
    : '';
  return `<nav class="roda" aria-label="Estados"><div class="roda-lista">${meu}${outros.map((id) => {
    const l = estados.por.get(id)!, c = l[0].creator, porVer = l.some((e) => !e.visto);
    return `<div class="roda-it"><button class="roda-anel${porVer ? '' : ' visto'}" data-act="storyOpen" data-c="${id}" aria-label="Ver estado de ${esc(cname(c))}">${avatarOf(c.profile, 'roda-av')}</button><span class="roda-nm">${esc(String(c.profile.name || c.profile.handle).split(' ')[0])}</span></div>`;
  }).join('')}</div></nav>`;
}

/* Visualizador: ecrã inteiro, barras de progresso, toque à esquerda/direita para
   recuar/avançar, e passa sozinho ao criador seguinte. */
let sv: { ci: number; i: number; raf?: number } | null = null;
const DUR_IMG = 5000;

async function abrirEstados(creatorId: string): Promise<void> {
  const ci = estados.ordem.indexOf(creatorId);
  if (ci < 0) return;
  const l = estados.por.get(creatorId)!;
  const i = Math.max(0, l.findIndex((e) => !e.visto));
  sv = { ci, i };
  document.body.classList.add('sv-aberto');
  await mostrarEstado();
}

function fecharEstados(): void {
  if (sv?.raf) cancelAnimationFrame(sv.raf);
  sv = null;
  $('#storyRoot')?.remove();
  document.body.classList.remove('sv-aberto');
  // Atualiza os anéis (os vistos ficam cinzentos).
  const r = $('.roda');
  if (r) void rodaDeEstados().then((h) => { r.outerHTML = h; });
}

async function mostrarEstado(): Promise<void> {
  if (!sv) return;
  if (sv.raf) cancelAnimationFrame(sv.raf);
  const cid = estados.ordem[sv.ci];
  const l = estados.por.get(cid);
  if (!l) return fecharEstados();
  if (l.some((x) => !x.url)) {
    const urls = await signedUrls('stories', l.filter((x) => !x.url).map((x) => x.path), 600);
    for (const x of l) x.url ||= urls[x.path];
  }
  if (!sv) return;
  const pos = sv.i, e = l[pos], c = e.creator, mine = cid === me_().id;
  let root = $('#storyRoot');
  if (!root) { root = document.createElement('div'); root.id = 'storyRoot'; document.body.append(root); }
  const media = e.media_type === 'video'
    ? `<video id="svMedia" src="${esc(e.url || '')}" playsinline autoplay></video>`
    : `<img id="svMedia" src="${esc(e.url || '')}" alt="">`;
  root.innerHTML = `<div class="sv" role="dialog" aria-modal="true" aria-label="Estado de ${esc(cname(c))}">
   <div class="sv-palco">
    <div class="sv-barras">${l.map((_, k) => `<span><i style="width:${k < pos ? 100 : 0}%"${k === pos ? ' id="svBar"' : ''}></i></span>`).join('')}</div>
    <header class="sv-top"><a href="#perfil-${esc(c.profile.handle)}" data-act="storyProfile" data-h="${esc(c.profile.handle)}">${avatarOf(c.profile, 'sm')}<b>${esc(cname(c))}</b></a><span class="sv-t">${ago(e.created_at)}</span>
     ${mine ? `<button class="sv-b" data-act="storyDel" data-id="${e.id}" aria-label="Apagar este estado">${ic('trash')}</button>` : ''}
     <button class="sv-b" data-act="storyClose" aria-label="Fechar">${ic('x')}</button></header>
    ${media}
    ${e.caption ? `<p class="sv-leg">${esc(e.caption)}</p>` : ''}
    <button class="sv-z ant" data-act="storyPrev" aria-label="Anterior"></button><button class="sv-z seg" data-act="storyNext" aria-label="Seguinte"></button>
   </div></div>`;
  if (!e.visto && !mine) {
    e.visto = true;
    void sb.from('story_views').upsert({ story_id: e.id, user_id: me_().id }, { onConflict: 'story_id,user_id', ignoreDuplicates: true });
  }
  const bar = $<HTMLElement>('#svBar');
  const el = $<HTMLVideoElement>('#svMedia');
  const correr = (dur: number) => {
    const t0 = performance.now();
    const passo = () => {
      if (!sv) return;
      const f = Math.min(1, (performance.now() - t0) / dur);
      if (bar) bar.style.width = f * 100 + '%';
      if (f < 1) sv.raf = requestAnimationFrame(passo); else avancar(1);
    };
    sv!.raf = requestAnimationFrame(passo);
  };
  if (e.media_type === 'video' && el) {
    el.onloadedmetadata = () => correr(Math.min(60, el.duration || 15) * 1000);
    el.onerror = () => correr(DUR_IMG);
  } else correr(DUR_IMG);
}

function avancar(d: 1 | -1): void {
  if (!sv) return;
  let { ci, i } = sv;
  i += d;
  if (i >= estados.por.get(estados.ordem[ci])!.length) { ci++; i = 0; }
  if (i < 0) { ci--; i = ci >= 0 ? estados.por.get(estados.ordem[ci])!.length - 1 : 0; }
  if (ci < 0) { ci = 0; i = 0; }
  if (ci >= estados.ordem.length) return fecharEstados();
  sv.ci = ci; sv.i = i;
  void mostrarEstado();
}

function novoEstado(): void {
  modal(`<div class="payhd"><span class="eyebrow">${ic('clock')}Desaparece em 24 horas</span><h3>Publicar estado</h3><p class="small muted">Uma foto ou um vídeo curto para quem te segue ou subscreve.</p></div>
   <form id="storyForm" class="stack" novalidate>
    <label class="upbox" for="stFile">${ic('upload')}<span id="stNome">Escolher foto ou vídeo</span></label>
    <input id="stFile" type="file" accept="image/*,video/*" hidden>
    <div class="field"><label for="stLeg">Legenda (opcional)</label><input id="stLeg" maxlength="200" placeholder="Escreve algo…"></div>
    <span class="err" id="stErr" hidden></span>
    <button class="btn pri block lg" id="stBtn">Publicar estado</button>
   </form>`);
}

async function publicarEstado(f: HTMLFormElement): Promise<void> {
  const file = $<HTMLInputElement>('#stFile')?.files?.[0];
  const err = (m: string) => { const e = $('#stErr'); if (e) { e.hidden = false; e.textContent = m; } };
  if (!file) return err('Escolhe uma foto ou um vídeo.');
  const tipo = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
  if (!tipo) return err('Só fotos ou vídeos.');
  if (file.size > 50 * 1024 * 1024) return err('O ficheiro passa dos 50 MB.');
  const btn = f.querySelector<HTMLButtonElement>('#stBtn');
  busy(btn, true, 'A publicar…');
  const id = crypto.randomUUID(), uid = me_().id;
  const path = `${uid}/${id}/${safeName(file.name)}`;
  try {
    await upload('stories', path, file);
    const { error } = await sb.from('stories').insert({ id, creator_id: uid, path, media_type: tipo, caption: ($<HTMLInputElement>('#stLeg')?.value || '').trim() || null });
    if (error) { await sb.storage.from('stories').remove([path]); throw error; }
    closeModal();
    toast('Estado publicado. Fica visível 24 horas.');
    const r = $('.roda'), h = await rodaDeEstados();
    if (r) r.outerHTML = h; else rerender();
  } catch (e) { busy(btn, false); err(errText(e)); }
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
  const [{ data: rawPosts }, roda, faixa] = await Promise.all([
    ids.length
      ? sb.from('posts').select(POST_SEL).in('creator_id', ids).eq('status', 'published').order('published_at', { ascending: false }).limit(30)
      : Promise.resolve({ data: [] as any[] }),
    rodaDeEstados(),
    faixaSugestoes('so-tlm'),
  ]);
  const posts = await enrichPosts(rawPosts || []);
  const promo = promocaoDaVisita(promos, voltaDaVisita());
  const coluna = promo ? colunaDe(promo.position) : 'esquerda';
  const lista = posts.map(postHTML);
  if (promo && lista.length) lista.splice(posicaoNoFeed(promo.mobile_slot, sorteioDaVisita(), lista.length), 0, promoBanner(promo, 'feed'));
  if (faixa) lista.splice(Math.min(2, lista.length), 0, faixa);
  const lateral = promo ? promoBanner(promo, 'lateral') : '';
  return `<div class="feedwrap">${lateral && coluna === 'esquerda' ? `<aside class="pbanner-col">${lateral}</aside>` : '<div></div>'}<div class="feedcol">
   <h1 class="sr-only">Início</h1>
   ${roda}
   ${posts.length ? lista.join('') : `${faixa}<div class="box empty"><h3>O teu início está vazio</h3><p style="margin-top:6px">Segue ou subscreve criadores e as publicações deles aparecem aqui.</p><a class="btn pri" style="margin-top:14px" href="#explorar">Explorar criadores</a></div>`}
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
/**
 * Explorar por conteúdos: as publicações recentes de criadores que a pessoa ainda
 * não segue nem subscreve. As grátis mostram-se; as pagas mostram a pré-visualização
 * desfocada com o preço. Descobre-se um criador pelo que publica, não só pelo perfil.
 * Numa plataforma ainda pequena, se não houver nada de quem não segue, mostra de todos.
 */
const XP_SEL = '*, creator:creators!inner(id,price,status,category,profile:profiles!creators_id_fkey(handle,name,avatar_url))';
async function conteudosExplorar(): Promise<{ posts: any[] }> {
  const uid = me_().id;
  const [{ data: fol }, { data: subs }] = await Promise.all([
    sb.from('follows').select('creator_id').eq('follower_id', uid),
    sb.from('subscriptions').select('creator_id').eq('fan_id', uid).eq('status', 'active'),
  ]);
  const known = [...new Set([...(fol || []), ...(subs || [])].map((x) => x.creator_id))];
  const consulta = (excluir: string[]) => {
    let q = sb.from('posts').select(XP_SEL).eq('status', 'published').eq('creator.status', 'approved').neq('creator_id', uid)
      .order('published_at', { ascending: false }).limit(30);
    if (excluir.length) q = q.not('creator_id', 'in', `(${excluir.join(',')})`);
    if (S.cat !== 'Tudo') q = q.eq('creator.category', S.cat);
    return q;
  };
  let { data } = await consulta(known);
  if (!data?.length && known.length) ({ data } = await consulta([]));
  const posts = await enrichPosts(data || []);
  return { posts };
}

export async function exploreGrid() {
  const t0 = S.q.trim().replace(/[%,()*]/g, '').slice(0, 60);
  if (!t0) {
    const [{ posts }, sug] = await Promise.all([conteudosExplorar(), faixaSugestoes('so-tlm')]);
    if (!posts.length) return `${sug}<p class="empty">Ainda não há conteúdos${S.cat !== 'Tudo' ? ' nesta categoria' : ''}. Experimenta outra categoria ou procura um criador pelo nome.</p>`;
    const lista = posts.map(postHTML);
    if (sug) lista.splice(Math.min(2, lista.length), 0, sug);
    return lista.join('');
  }
  let q = sb.from('creators').select(CR_SEL).eq('status', 'approved').neq('id', me_().id).order('follower_count', { ascending: false }).limit(60);
  if (S.cat !== 'Tudo') q = q.eq('category', S.cat);
  // Sanitiza o termo de pesquisa antes de o meter num filtro .or() do PostgREST: sem remover
  // vírgulas e parênteses, o texto do utilizador fechava o filtro e injetava ramos extra.
  // `*` também sai: é o wildcard do ILIKE e transformava a pesquisa num scan completo.
  const t = S.q.trim().replace(/[%,()*]/g, '').slice(0, 60);
  if (t) q = q.or(`name.ilike.%${t}%,handle.ilike.%${t}%`, { referencedTable: 'profile' });
  // A pesquisa mostra só criadores.
  const { data, error } = await q;
  if (error) return `<p class="empty">${esc(errText(error))}</p>`;
  const html = (data || []).map(creatorCard).join('');
  return html || `<p class="empty">Nenhum criador encontrado com esse nome. Experimenta outra palavra.</p>`;
}
export async function vExplorar() {
  // A mesma estrutura do Início: publicações numa coluna, sugestões e rodapé à direita.
  S.cat = 'Tudo';
  const an = await anuncioLateral();
  const [grelha, lateral] = await Promise.all([exploreGrid(), sideRail(an.dir)]);
  return `<div class="feedwrap">${colunaEsquerda(an.esq)}<div class="feedcol">
   <h1 class="sr-only">Explorar</h1>
   <label class="search">${ic('search')}<input class="qin" type="search" placeholder="Procure um criador" value="${esc(S.q)}" aria-label="Procure um criador"></label>
   <div class="${S.q.trim() ? 'cgrid' : 'xfeed'}" id="cgrid">${grelha}</div>
  </div>${lateral}</div>`;
}

/* ---------- Perfil ---------- */
/** Caixa «Em que estás a pensar?» no próprio perfil. Quem é criador vai publicar no estúdio;
 *  quem não é vê que só criadores publicam e o convite para se tornar criador. */
function caixaPublicar(): string {
  const u = me_();
  return `<div class="box compose">${avatarOf(u, 'md')}<button class="compose-in" data-act="composeOpen">Em que estás a pensar, ${esc(String(u.name || u.handle).split(' ')[0])}?</button>
   <div class="compose-acts"><button class="btn link sm" data-act="composeOpen">${ic('upload')}Foto ou vídeo</button></div></div>`;
}

/** Perfil de quem não é criador, no mesmo formato da página de perfil dos criadores (capa,
 *  foto, separadores e coluna «Sobre»). O dono vê «Editar perfil» e a caixa para publicar
 *  (que lhe explica que só criadores publicam); os visitantes vêem «Seguir». */
/* ---------- Editar publicação (criador) ---------- */
async function guardarEdicao(f: HTMLFormElement): Promise<void> {
  const id = f.dataset.id!, temMedia = Number(f.dataset.media) > 0;
  const err = (m: string) => { const e = $('#peErr'); if (e) { e.hidden = false; e.textContent = m; } };
  const body = ($<HTMLTextAreaElement>('#peTxt')?.value || '').trim();
  const access = $<HTMLSelectElement>('#peAcc')?.value || 'subscribers';
  const price = access === 'paid' ? +($<HTMLInputElement>('#pePrice')?.value || 0) : 0;
  if (!body && !temMedia) return err('A publicação não pode ficar vazia: escreve alguma coisa.');
  if (access === 'paid' && !(price >= S.cfg.min_price)) return err(`O preço mínimo é ${kz(S.cfg.min_price)}.`);
  const btn = $<HTMLButtonElement>('#peBtn'); busy(btn, true, 'A guardar…');
  const cm = $<HTMLInputElement>('#peCm');
  const { error } = await sb.from('posts').update({ access, price, ...(cm ? { comments_enabled: cm.checked } : {}) }).eq('id', id).eq('creator_id', me_().id);
  if (error) { busy(btn, false); return err(errText(error)); }
  const { error: e2 } = await sb.from('post_bodies').upsert({ post_id: id, body }, { onConflict: 'post_id' });
  if (e2) { busy(btn, false); return err(errText(e2)); }
  closeModal(); toast('Publicação atualizada'); rerender(false);
}

/* ---------- Comentários ---------- */
function contarComentario(postId: string, delta: number): void {
  const n = $(`#post-${postId} .ncm`); if (!n) return;
  const v = Math.max(0, (Number(n.textContent?.replace(/\D/g, '')) || 0) + delta);
  n.textContent = dots(v);
  const lbl = n.parentElement; if (lbl) lbl.lastChild!.textContent = v === 1 ? ' comentário' : ' comentários';
}
async function carregarComentarios(postId: string): Promise<void> {
  const box = $(`#pcm-${postId}`); if (!box) return;
  box.innerHTML = '<p class="small muted">A carregar comentários…</p>';
  const { data, error } = await sb.from('post_comments').select('id,user_id,body,created_at,profile:profiles(handle,name,avatar_url)').eq('post_id', postId).order('created_at', { ascending: true }).limit(200);
  if (error) { box.innerHTML = `<p class="small muted">${esc(errText(error))}</p>`; return; }
  const dono = box.dataset.owner === '1', on = box.dataset.on === '1', uid = me_().id;
  const lista = (data || []).map((c: any) => `<div class="cm">${avatarOf(c.profile, 'sm')}<div class="cm-b"><div class="cm-bolha"><a href="#perfil-${esc(c.profile?.handle || '')}">${esc(c.profile?.name || c.profile?.handle || 'Membro')}</a><p>${esc(c.body)}</p></div>
    <span class="cm-meta">${ago(c.created_at)}${c.user_id === uid || dono ? ` · <button class="btn link small" data-act="cmDel" data-id="${c.id}" data-post="${postId}">Apagar</button>` : ''}</span></div></div>`).join('');
  box.innerHTML = `${lista || (on ? '<p class="small muted">Ainda sem comentários. Sê o primeiro.</p>' : '')}
   ${on ? `<form class="cmform" data-post="${postId}" novalidate>${avatarOf(me_(), 'sm')}<input name="c" maxlength="500" placeholder="Escreve um comentário…" aria-label="Escreve um comentário" autocomplete="off"><button class="tbtn" aria-label="Enviar comentário">${ic('send')}</button></form>`
    : '<p class="small muted cm-fechado">O criador desativou os comentários nesta publicação.</p>'}`;
}
async function comentar(f: HTMLFormElement): Promise<void> {
  const postId = f.dataset.post!, inp = f.querySelector('input') as HTMLInputElement, txt = inp.value.trim();
  if (!txt) return;
  inp.disabled = true;
  const { error } = await sb.from('post_comments').insert({ post_id: postId, user_id: me_().id, body: txt });
  inp.disabled = false;
  if (error) return toast(errText(error));
  contarComentario(postId, 1); await carregarComentarios(postId);
  $<HTMLInputElement>(`#pcm-${postId} .cmform input`)?.focus();
}

/* Visualizações: conta quando metade da publicação fica à vista, uma vez por pessoa
   (a base de dados ignora repetições; aqui evita-se repetir o pedido na mesma visita). */
const vistas = new Set<string>();
let olho: IntersectionObserver | null = null;
function vigiarVisualizacoes(): void {
  if (olho || typeof IntersectionObserver === 'undefined') return;
  olho = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const id = (e.target as HTMLElement).dataset.view;
    olho!.unobserve(e.target);
    if (!id || vistas.has(id)) return;
    vistas.add(id);
    void sb.rpc('register_post_view', { p_post: id }).then(() => {}, () => {});
  }), { threshold: 0.5 });
  const ligar = () => document.querySelectorAll<HTMLElement>('article.post[data-view]:not([data-vo])').forEach((el) => { el.dataset.vo = '1'; olho!.observe(el); });
  new MutationObserver(ligar).observe(document.body, { childList: true, subtree: true });
  ligar();
}
if (typeof window !== 'undefined') vigiarVisualizacoes();

/* ---------- Criar publicação no próprio perfil (como no Facebook) ---------- */
let cpFiles: File[] = [];
const cpUrls = new Map<File, string>();
function limparAnexos(): void { cpFiles = []; cpUrls.forEach((x) => URL.revokeObjectURL(x)); cpUrls.clear(); }
function abrirCompositor(): void {
  const u = me_(), c = S.creator!;
  limparAnexos();
  modal(`<form id="cpForm" class="stack cp" novalidate>
    <h3 class="cp-tt">Criar publicação</h3>
    <div class="row" style="gap:10px">${avatarOf(u, 'md')}<div class="stack" style="gap:4px"><b style="color:var(--ink)">${esc(u.name || u.handle)}</b>
     <select id="cpAcc" class="cp-acc" aria-label="Quem pode ver"><option value="free">Todos (grátis)</option><option value="subscribers" selected>${c.price ? 'Só subscritores' : 'Só seguidores'}</option><option value="paid">Compra à parte</option></select></div></div>
    <textarea id="cpTxt" class="cp-txt" maxlength="2000" placeholder="Em que estás a pensar, ${esc(String(u.name || u.handle).split(' ')[0])}?"></textarea>
    <div id="cpPrev" class="cp-prev" hidden></div>
    <label class="check"><input type="checkbox" id="cpCm" checked><span>Permitir comentários</span></label>
    <div class="field" id="cpPriceRow" hidden style="max-width:240px"><label for="cpPrice">Preço (Kz)</label><input id="cpPrice" type="number" min="${S.cfg.min_price}" step="100" value="2500"></div>
    <label class="cp-add" for="cpFile">${ic('upload')}<span>Adicionar fotos ou vídeos</span></label>
    <input id="cpFile" type="file" multiple accept="image/*,video/mp4,video/quicktime" hidden>
    <div class="progress" id="cpProg" hidden><i style="width:0"></i></div>
    <span class="err" id="cpErr" hidden></span>
    <button class="btn pri block lg" id="cpBtn">Publicar</button>
   </form>`);
  $<HTMLTextAreaElement>('#cpTxt')?.focus();
}
function mostrarAnexos(): void {
  const box = $('#cpPrev'); if (!box) return;
  box.hidden = !cpFiles.length;
  box.innerHTML = cpFiles.map((f, i) => {
    if (!cpUrls.has(f)) cpUrls.set(f, URL.createObjectURL(f));
    const u = cpUrls.get(f)!;
    return `<span class="cp-it">${f.type.startsWith('video') ? `<video src="${u}" muted playsinline></video>` : `<img src="${u}" alt="">`}<button type="button" data-act="cpRm" data-i="${i}" aria-label="Retirar">${ic('x')}</button></span>`;
  }).join('');
}
async function publicarDoPerfil(): Promise<void> {
  const btn = $<HTMLButtonElement>('#cpBtn'), prog = $('#cpProg');
  const err = (m: string) => { const e = $('#cpErr'); if (e) { e.hidden = false; e.textContent = m; } };
  busy(btn, true, 'A publicar…');
  if (prog && cpFiles.length) prog.hidden = false;
  const { criarPublicacao } = await import('./studio');
  const erro = await criarPublicacao({
    body: $<HTMLTextAreaElement>('#cpTxt')?.value || '', access: $<HTMLSelectElement>('#cpAcc')?.value || 'subscribers',
    price: +($<HTMLInputElement>('#cpPrice')?.value ?? 0), files: cpFiles, status: 'published', comentarios: $<HTMLInputElement>('#cpCm')?.checked !== false,
    progresso: (f) => { if (prog) (prog.firstElementChild as HTMLElement).style.width = f * 100 + '%'; },
  });
  if (erro) { busy(btn, false); if (prog) prog.hidden = true; return err(erro); }
  limparAnexos();
  closeModal(); S.ptab = 'pub'; rerender(false);
}

async function perfilDeFa(p: any): Promise<string> {
  const mine = p.id === me_().id;
  const ban = !!p.banned_at && (!p.banned_until || new Date(p.banned_until) > new Date());
  if (ban && !mine) return `<div class="empty"><h2>Perfil indisponível</h2><p style="margin-top:8px">Esta conta não está disponível.</p><a class="btn out" style="margin-top:16px" href="#explorar">Voltar a explorar</a></div>`;
  const { data: fol } = mine ? { data: null } : await sb.from('follows').select('creator_id').eq('follower_id', me_().id).eq('creator_id', p.id).maybeSingle();
  const seguido = !!fol;
  const n = Number(p.follower_count) || 0;
  const nome = p.name || p.handle;
  const papel = p.role === 'admin' || p.role === 'moderator' ? 'Equipa' : 'Fã';
  const acts = mine
    ? `<button class="btn pri" data-act="composeOpen">${ic('plus')}Criar publicação</button><a class="btn out" href="#conta">${ic('settings')}Editar perfil</a>`
    : `<button class="btn ${seguido ? 'out' : 'pri'}" data-act="follow" data-id="${esc(p.id)}" data-on="${seguido ? 1 : 0}">${seguido ? 'A seguir' : 'Seguir'}</button>`;
  const tabs: [string, string][] = [['pub', 'Publicações'], ['sobre', 'Sobre']];
  const tab = S.ptab === 'sobre' ? 'sobre' : 'pub';
  const interesses = (p.interests || []).length ? `<div class="row wrapf" style="gap:6px">${p.interests.map((x: string) => `<span class="tag plain">${esc(x)}</span>`).join('')}</div>` : '';
  const body = tab === 'pub'
    ? `<div class="feed">${mine ? caixaPublicar() : ''}<div class="box empty"><h3>${mine ? 'Ainda não tens publicações' : 'Sem publicações'}</h3><p style="margin-top:6px">${mine ? 'Só criadores podem publicar. Cria a tua conta de criador para partilhares fotos, vídeos e textos.' : `${esc(nome)} ainda não publicou nada.`}</p>${mine && !isStaff(S.me) ? `<button class="btn pri" style="margin-top:14px" data-act="becomeCreator">${ic('star')}Tornar-me criador</button>` : ''}</div></div>`
    : `<div style="max-width:640px" class="stack"><dl class="kv"><dt>Tipo de conta</dt><dd>${papel}</dd><dt>Na plataforma desde</dt><dd>${fmtDate(p.created_at)}</dd>${p.country ? `<dt>País</dt><dd>${esc(p.country)}</dd>` : ''}</dl>${interesses}
       ${mine ? '' : `<button class="btn link small" style="align-self:flex-start" data-act="report" data-type="creator" data-id="${esc(p.id)}">Denunciar perfil</button>`}</div>`;
  const about = `<div class="box pad stack" style="gap:12px"><h3>Sobre ${esc(nome)}</h3>
    <div class="stack" style="gap:8px">
     <div class="row" style="justify-content:space-between"><span class="muted small">Seguidores</span><b>${dots(n)}</b></div>
     <div class="row" style="justify-content:space-between"><span class="muted small">Desde</span><b>${fmtDate(p.created_at)}</b></div>
     ${p.country ? `<div class="row" style="justify-content:space-between"><span class="muted small">País</span><b>${esc(p.country)}</b></div>` : ''}
    </div>${interesses}</div>${rodapeLinks()}`;
  return `<div class="cover"></div>
   <section class="phead">${p.avatar_url ? `<div class="big"><img src="${esc(p.avatar_url)}" alt=""></div>` : `<div class="big">${esc(String(nome)[0].toUpperCase())}</div>`}
    <div class="info"><h1>${esc(nome)}</h1><div class="muted">@${esc(p.handle)}</div>
     <div class="meta">${p.country ? `<span>${ic('pin')}${esc(p.country)}</span>` : ''}<span>${ic('cal')}Desde ${fmtDate(p.created_at)}</span></div>
     <div class="stats3"><div><b>0</b><span class="small muted">publicações</span></div><div><b>${dots(n)}</b><span class="small muted">seguidores</span></div></div>
    </div><div class="acts">${acts}</div></section>
   <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-act="ptab" data-v="${k}">${l}</button>`).join('')}</div>
   <div class="profwrap${tab === 'pub' ? '' : ' so'}">${tab === 'pub' ? `<aside class="profside">${about}</aside>` : ''}<div class="profmain">${body}</div></div>`;
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
    sb.from('posts').select(POST_SEL).eq('creator_id', c.id).in('status', mine ? ['published', 'draft', 'hidden'] : ['published']).order('published_at', { ascending: false }).limit(100),
  ]);
  const posts = await enrichPosts(rawPosts || []);
  const active = sub && sub.status === 'active' && new Date(sub.current_period_end) > new Date();
  let acts;
  if (mine) acts = `<button class="btn pri" data-act="stGo" data-v="nova">${ic('plus')}Criar publicação</button><div class="row" style="gap:8px"><a class="btn out" style="flex:1" href="#estudio">Abrir o estúdio</a><a class="btn out" style="flex:1" href="#conta">Editar perfil</a></div>`;
  else acts = `${c.price ? (active ? `<button class="btn soft" data-act="goSubs">${ic('check')}Subscrito até ${fmtDate(sub.current_period_end)}</button>` : `<button class="btn pri" data-act="subscribe" data-id="${c.id}">${sub ? 'Renovar' : 'Subscrever'} por ${kz(c.price)}/mês</button>`) : '<span class="tag plain" style="justify-content:center;padding:10px">Perfil gratuito · segue para ver</span>'}
   <div class="row" style="gap:8px"><button class="btn out" style="flex:1" data-act="follow" data-id="${c.id}" data-on="${fol ? 1 : 0}">${fol ? 'A seguir' : 'Seguir'}</button>
   <button class="tbtn" style="height:42px;width:42px" data-act="tip" data-id="${c.id}" aria-label="Enviar gorjeta" title="Enviar gorjeta">${ic('gift')}</button>
   <button class="tbtn" style="height:42px;width:42px" data-act="dm" data-id="${c.id}" aria-label="Enviar mensagem" title="Enviar mensagem">${ic('chat')}</button></div>`;
  const tipos = posts.flatMap((p: any) => (p.media || []).map((m: any) => String(m.type || '')));
  const nVideos = tipos.filter((t: string) => t.startsWith('video')).length, nFotos = tipos.length - nVideos;
  const tabs: [string, string, string][] = [['pub', 'doc', `${dots(c.post_count)} Publicações`], ['fotos', 'img', `${dots(nFotos)} Fotos`], ['videos', 'video', `${dots(nVideos)} Vídeos`]];
  if (!tabs.some(([k]) => k === S.ptab)) S.ptab = 'pub';
  if (!mine && !fol) posts.forEach((p: any) => { p.seguir = true; });
  let body = '';
  if (S.ptab === 'pub') body = `<div class="feed">${mine ? caixaPublicar() : ''}${posts.map(postHTML).join('') || `<p class="empty">${mine ? 'Ainda não publicaste nada.' : 'Ainda sem publicações.'}</p>`}</div>`;
  else if (S.ptab === 'fotos' || S.ptab === 'videos') {
    // Fotos e vídeos em separadores próprios. Um ficheiro bloqueado mostra a pré-visualização
    // desfocada com o cadeado; o tipo vem de `media` (que existe mesmo sem acesso).
    const querVideo = S.ptab === 'videos';
    const eVideo = (t: any) => String(t || '').startsWith('video');
    const tiles: Array<{ p: any; m: any }> = posts.flatMap((p: any) => p.canSee
      ? (p.urls || []).filter((m: any) => m.url && eVideo(m.type) === querVideo).map((m: any) => ({ p, m }))
      : ((p.media || []).some((m: any) => eVideo(m.type) === querVideo) ? [{ p, m: null }] : []),
    ).slice(0, 90);
    const tile = ({ p, m }: { p: any; m: any }) => `<a class="gtile" href="#p-${p.id}">${m
      ? (eVideo(m.type) ? `<video src="${esc(m.url)}#t=0.1" muted playsinline preload="metadata"></video><span class="gtile-play">${ic('play')}</span>` : `<img src="${esc(m.url)}" alt="" loading="lazy" decoding="async">`)
      : `${p.preview_url ? `<img class="desf" src="${esc(p.preview_url)}" alt="" loading="lazy" decoding="async">` : ''}<span class="gtile-lock">${ic('lock')}</span>`}</a>`;
    body = tiles.length ? `<div class="mgrid">${tiles.map(tile).join('')}</div>` : `<p class="empty">${querVideo ? 'Sem vídeos.' : 'Sem fotos.'}</p>`;
  }
  const linha = (i: string, t: string) => `<li>${ic(i)}<span>${t}</span></li>`;
  const about = `<div class="box pad sobre"><h3>Sobre ${esc(cname(c))}</h3>
    <ul class="sobre-l">
     ${linha('users', `${dots(c.subscriber_count)} Assinantes`)}
     ${linha('user', `${dots(c.follower_count)} Seguidores`)}
     ${linha('heart', `${dots(posts.reduce((a: number, p: any) => a + Number(p.like_count || 0), 0))} Gostos`)}
     ${linha('pin', `${esc(c.city)}, Angola`)}
     ${linha('star', esc(c.category))}
     ${linha('cal', `Desde ${fmtDate(c.created_at)}`)}
     ${linha('coin', c.price ? `${kz(c.price)} por mês` : 'Subscrição gratuita')}
     ${c.status === 'approved' ? linha('badge', 'Identidade verificada') : ''}
    </ul>
    ${mine ? '' : `<button class="btn link small" data-act="report" data-type="creator" data-id="${c.id}">${ic('flag')}Denunciar perfil</button>`}
   </div>${rodapeLinks()}`;
  return `${c.status !== 'approved' ? `<div class="banner">${ic('clock')}<span><b>O teu perfil está em verificação.</b> Só tu o vês até a equipa aprovar os documentos.</span></div>` : ''}
   <div class="cover" style="${c.cover_url ? `background-image:${cssUrl(c.cover_url)}` : ''}"></div>
   <section class="phead">${prof.avatar_url ? `<div class="big"><img src="${esc(prof.avatar_url)}" alt=""></div>` : `<div class="big">${esc((cname(c) || '?')[0].toUpperCase())}</div>`}
    <div class="info"><h1 style="display:flex;align-items:center;gap:8px">${esc(cname(c))}${c.status === 'approved' ? `<span style="color:var(--acc);display:inline-flex" title="Identidade verificada">${ic('badge', 'style="width:22px;height:22px"')}</span>` : ''}</h1>
     <div class="muted">@${esc(prof.handle)}</div>
     <p style="margin-top:10px;max-width:62ch">${esc((c.bio || '').slice(0, 220))}</p>
     <div class="meta"><span>${ic('pin')}${esc(c.city)}, Angola</span><span>${ic('cal')}Desde ${fmtDate(c.created_at)}</span></div>
     <div class="stats3"><div><b>${dots(c.post_count)}</b><span class="small muted">publicações</span></div><div><b>${dots(c.follower_count)}</b><span class="small muted">seguidores</span></div></div>
    </div><div class="acts">${acts}</div></section>
   <div class="tabs ptabs" role="tablist">${tabs.map(([k, i, l]) => `<button role="tab" aria-selected="${S.ptab === k}" class="${S.ptab === k ? 'on' : ''}" data-act="ptab" data-v="${k}">${ic(i)}${l}</button>`).join('')}</div>
   <div class="profwrap${S.ptab === 'pub' ? '' : ' so'}">${S.ptab === 'pub' ? `<aside class="profside">${about}</aside>` : ''}<div class="profmain">${body}</div></div>`;
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
/* ---------- Guardados ---------- */
/** As publicações que a pessoa guardou (botão «Guardar» de cada publicação), da mais recente para a mais antiga. */
export async function vGuardados() {
  const { data: sv } = await sb.from('saves').select('post_id,created_at').eq('user_id', me_().id).order('created_at', { ascending: false }).limit(60);
  const ids = (sv || []).map((x: any) => x.post_id);
  let posts: any[] = [];
  if (ids.length) {
    const { data } = await sb.from('posts').select(POST_SEL).in('id', ids).eq('status', 'published');
    const ordem = new Map(ids.map((id, k) => [id, k]));
    posts = await enrichPosts((data || []).sort((a: any, b: any) => ordem.get(a.id)! - ordem.get(b.id)!));
  }
  const an = await anuncioLateral();
  return `<div class="feedwrap">${colunaEsquerda(an.esq)}<div class="feedcol"><div class="pagehead"><div><h1>Guardados</h1><p>As publicações que guardaste para ver mais tarde. Só tu vês esta lista.</p></div></div>
   ${posts.length ? posts.map(postHTML).join('') : `<div class="box empty"><h3>Ainda não guardaste nada</h3><p style="margin-top:6px">Toca em ${ic('bookmark', 'style="width:16px;height:16px;vertical-align:-3px"')} <b>Guardar</b> numa publicação e ela fica aqui.</p><a class="btn pri" style="margin-top:14px" href="#explorar">Explorar conteúdos</a></div>`}</div>${await sideRail(an.dir)}</div>`;
}

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
    <p class="small muted">Multicaixa Express, referência Multicaixa, PayPay, cartão Visa ou Mastercard e Pix.</p></div></div>`;
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
    const n = $(`#post-${d.id} .pstats .num`) || el.querySelector('.num');
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
const estadoActions = {
  storyOpen(d: Record<string, string>) { void abrirEstados(d.c); },
  storyNew() { novoEstado(); },
  postMenu(d: Record<string, string>) {
    const url = location.origin + '/p/' + d.id;
    modal(`<h3>Publicação</h3><div class="stack" style="gap:8px">
      <button class="btn out block" data-act="copyPostLink" data-url="${esc(url)}">${ic('link')}Copiar link</button>
      ${d.mine === '1' ? `<button class="btn out block" data-act="postEdit" data-id="${esc(d.id)}">${ic('doc')}Editar publicação</button>` : ''}
      ${d.mine === '1' && d.cm !== undefined ? `<button class="btn out block" data-act="cmToggle" data-id="${esc(d.id)}" data-on="${d.cm}">${ic('chat')}${d.cm === '1' ? 'Desativar comentários' : 'Ativar comentários'}</button>` : ''}
      ${d.mine === '1' ? `<a class="btn out block" href="#estudio" data-act="closeModal">${ic('grid')}Gerir no estúdio</a>` : `<button class="btn out block" data-act="report" data-type="post" data-id="${esc(d.id)}">${ic('flag')}Denunciar</button>`}
    </div>`);
  },
  async comments(d: Record<string, string>) {
    const box = $(`#pcm-${d.id}`); if (!box) return;
    box.hidden = !box.hidden;
    if (!box.hidden) await carregarComentarios(d.id);
  },
  async cmDel(d: Record<string, string>) {
    const { error } = await sb.from('post_comments').delete().eq('id', d.id);
    if (error) return toast(errText(error));
    contarComentario(d.post, -1); await carregarComentarios(d.post);
  },
  async postEdit(d: Record<string, string>) {
    closeModal();
    const [{ data: p, error }, { data: b }] = await Promise.all([
      sb.from('posts').select('*').eq('id', d.id).eq('creator_id', me_().id).maybeSingle(),
      sb.from('post_bodies').select('body').eq('post_id', d.id).maybeSingle(),
    ]);
    if (error || !p) return toast(error ? errText(error) : 'Publicação não encontrada.');
    const c = S.creator, acc = p.access as string;
    const opt = (v: string, l: string) => `<option value="${v}" ${acc === v ? 'selected' : ''}>${l}</option>`;
    modal(`<form id="peForm" class="stack cp" data-id="${esc(p.id)}" data-media="${(p.media || []).length}" novalidate>
      <h3 class="cp-tt">Editar publicação</h3>
      <div class="row" style="gap:10px">${avatarOf(me_(), 'md')}<div class="stack" style="gap:4px"><b style="color:var(--ink)">${esc(me_().name || me_().handle)}</b>
       <select id="peAcc" class="cp-acc" aria-label="Quem pode ver">${opt('free', 'Todos (grátis)')}${opt('subscribers', c?.price ? 'Só subscritores' : 'Só seguidores')}${opt('paid', 'Compra à parte')}</select></div></div>
      <textarea id="peTxt" class="cp-txt" maxlength="2000" placeholder="Em que estás a pensar?">${esc(b?.body || '')}</textarea>
      ${(p.media || []).length ? `<p class="small muted">${ic('img', 'style="width:15px;height:15px;vertical-align:-3px"')} ${(p.media || []).length} ${(p.media || []).length === 1 ? 'ficheiro' : 'ficheiros'} nesta publicação (as fotos e os vídeos não mudam).</p>` : ''}
      ${'comments_enabled' in p ? `<label class="check"><input type="checkbox" id="peCm" ${p.comments_enabled ? 'checked' : ''}><span>Permitir comentários</span></label>` : ''}
      <div class="field" id="pePriceRow" ${acc === 'paid' ? '' : 'hidden'} style="max-width:240px"><label for="pePrice">Preço (Kz)</label><input id="pePrice" type="number" min="${S.cfg.min_price}" step="100" value="${Number(p.price) || 2500}"></div>
      <span class="err" id="peErr" hidden></span>
      <button class="btn pri block lg" id="peBtn">Guardar alterações</button>
     </form>`);
  },
  async cmToggle(d: Record<string, string>) {
    const ligar = d.on !== '1';
    const { error } = await sb.from('posts').update({ comments_enabled: ligar }).eq('id', d.id).eq('creator_id', me_().id);
    closeModal();
    if (error) return toast(errText(error));
    toast(ligar ? 'Comentários ativados' : 'Comentários desativados'); rerender();
  },
  composeOpen() {
    if (S.creator && S.creator.status !== 'approved') {
      return modal(`<div class="payhd"><span class="eyebrow">${ic('clock')}Em verificação</span><h3>Ainda não podes publicar</h3>
        <p class="small muted">O teu perfil está em verificação. Podes publicar assim que a equipa aprovar os documentos, normalmente em 48 horas.</p></div><button class="btn out block" data-act="closeModal">Fechar</button>`);
    }
    if (S.creator) return abrirCompositor();
    modal(`<div class="payhd"><span class="eyebrow">${ic('lock')}Só para criadores</span><h3>Só criadores podem publicar</h3>
      <p class="small muted">Para publicares fotos, vídeos e textos, cria a tua conta de criador. Passas a poder ter subscritores, vender conteúdos e receber gorjetas.</p></div>
      ${isStaff(S.me) ? '<button class="btn out block" data-act="closeModal">Fechar</button>' : `<div class="stack" style="gap:8px"><button class="btn pri block lg" data-act="becomeCreator">${ic('star')}Tornar-me criador</button><button class="btn out block" data-act="closeModal">Agora não</button></div>`}`);
  },
  cpRm(d: Record<string, string>) { cpFiles.splice(+d.i, 1); mostrarAnexos(); },
  async copyPostLink(d: Record<string, string>) { await copyText(d.url); closeModal(); toast('Link copiado.'); },
  async sugRefresh() { const b = $('#sugBox'); if (b) b.innerHTML = await sugestoesHTML(); },
  storyClose() { fecharEstados(); },
  storyProfile(d: Record<string, string>) { fecharEstados(); go('perfil-' + d.h); },
  storyPrev() { avancar(-1); },
  storyNext() { avancar(1); },
  async storyDel(d: Record<string, string>) {
    if (!confirm('Apagar este estado?')) return;
    const e = [...estados.por.values()].flat().find((x) => x.id === d.id);
    const { error } = await sb.from('stories').delete().eq('id', d.id);
    if (error) return toast(errText(error));
    if (e) await sb.storage.from('stories').remove([e.path]);
    fecharEstados();
    toast('Estado apagado.');
  },
};
// Esc fecha o visualizador; as setas recuam e avançam.
document.addEventListener('keydown', (e) => {
  if (!sv) return;
  if (e.key === 'Escape') fecharEstados();
  else if (e.key === 'ArrowRight') avancar(1);
  else if (e.key === 'ArrowLeft') avancar(-1);
});

register({
  actions: { ...fanActions, ...estadoActions },
  submit: async (f) => {
    if (f.id === 'cpForm') { await publicarDoPerfil(); return true; }
    if (f.classList.contains('cmform')) { await comentar(f); return true; }
    if (f.id === 'peForm') { await guardarEdicao(f); return true; }
    if (f.id !== 'storyForm') return false;
    await publicarEstado(f);
    return true;
  },
  change: (t) => {
    const el = t as HTMLInputElement;
    if (el.id === 'cpFile') { cpFiles.push(...[...(el.files || [])].slice(0, 10 - cpFiles.length)); el.value = ''; mostrarAnexos(); return true; }
    if (el.id === 'cpAcc') { const r = $('#cpPriceRow'); if (r) r.hidden = el.value !== 'paid'; return true; }
    if (el.id === 'peAcc') { const r = $('#pePriceRow'); if (r) r.hidden = el.value !== 'paid'; return true; }
    if ((t as HTMLInputElement).id !== 'stFile') return false;
    const n = $('#stNome'), file = (t as HTMLInputElement).files?.[0];
    if (n) n.textContent = file ? file.name : 'Escolher foto ou vídeo';
    return true;
  },
  // Pesquisa do Explorar: redesenha só a grelha, com a última pesquisa a ganhar.
  input: (t) => {
    if (!t.classList.contains('qin')) return false;
    S.q = t.value; clearTimeout(qT);
    document.querySelectorAll<HTMLInputElement>('.qin').forEach((x) => { if (x !== t) x.value = t.value; });
    if (!$('#cgrid')) return true; // fora do Explorar: Enter leva lá
    const seq = ++exploreSeq;
    qT = setTimeout(async () => {
      const html = await exploreGrid();
      if (seq !== exploreSeq) return; // uma pesquisa mais lenta já não interessa
      const g = $('#cgrid'); if (g) { g.innerHTML = html; g.className = S.q.trim() ? 'cgrid' : 'xfeed'; }
    }, 300);
    return true;
  },
});
