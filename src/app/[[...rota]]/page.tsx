import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import App from '../App';
import { caminhoDe, rotaDe } from '@/lib/caminhos';
import { DESCRICAO, NOME, PUBLICAS, ROTAS_CONHECIDAS, tituloDe } from '@/lib/seo-textos';
import { perfilPublico } from '../seo';

/** Imagem de partilha por omissão (src/app/og.jpg). */
const OG = [{ url: '/og.jpg', width: 1200, height: 630, alt: NOME }];

/**
 * Todos os endereços da aplicação (/, /sobre, /perfil/<nome>, /feed…) servem a
 * mesma SPA; o que muda por endereço são os metadados, gerados aqui no servidor
 * para o Google e para as pré-visualizações do WhatsApp, Facebook e LinkedIn.
 * Um endereço que não é uma rota dá 404 a sério.
 */
type Props = { params: Promise<{ rota?: string[] }> };

/** As páginas fixas (/, /sobre, /feed…) saem já prontas do build, como antes: nenhum
 *  pedido ao servidor para as abrir. Perfis, publicações e lives geram-se ao primeiro
 *  pedido e ficam em cache 10 minutos. */
export function generateStaticParams() {
  return [...ROTAS_CONHECIDAS].map((r) => ({ rota: caminhoDe(r).split('/').filter(Boolean) }));
}
export const revalidate = 600;

async function rotaDoPedido(params: Props['params']): Promise<string> {
  const { rota = [] } = await params;
  const r = rotaDe('/' + rota.map(encodeURIComponent).join('/'));
  const base = r.split('-')[0];
  const conhecida = ROTAS_CONHECIDAS.has(r) || (['perfil', 'p', 'live'].includes(base) && r.length > base.length + 1);
  if (!conhecida) notFound();
  return r;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await rotaDoPedido(params);

  if (r.startsWith('perfil-')) {
    const c = await perfilPublico(r.slice(7));
    // Perfis de fãs e criadores por aprovar: nunca indexados, sem dados na pré-visualização.
    if (!c) return { title: { absolute: NOME }, robots: { index: false, follow: true } };
    const nome = c.name || c.handle;
    const descricao = (c.bio?.replace(/\s+/g, ' ').trim().slice(0, 155)) ||
      `${[c.category, c.city].filter(Boolean).join(' · ')}. Conteúdos exclusivos de ${nome} na ${NOME}.`;
    const imagem = c.cover_url || c.avatar_url;
    const url = caminhoDe('perfil-' + c.handle);
    return {
      title: `${nome} (@${c.handle})`,
      description: descricao,
      alternates: { canonical: url },
      openGraph: { type: 'profile', url, title: `${nome} (@${c.handle}) · ${NOME}`, description: descricao, siteName: NOME, locale: 'pt_PT', images: imagem ? [{ url: imagem, alt: nome }] : OG },
      twitter: { card: 'summary_large_image', title: `${nome} (@${c.handle})`, description: descricao, images: imagem ? [imagem] : ['/og.jpg'] },
    };
  }

  const p = PUBLICAS[r];
  if (p) {
    const url = caminhoDe(r);
    return {
      title: r === 'inicio' ? { absolute: p.titulo } : p.titulo,
      description: p.descricao,
      alternates: { canonical: url },
      openGraph: { type: 'website', url, title: r === 'inicio' ? p.titulo : `${p.titulo} · ${NOME}`, description: p.descricao, siteName: NOME, locale: 'pt_PT', images: OG },
      twitter: { card: 'summary_large_image', title: p.titulo, description: p.descricao, images: ['/og.jpg'] },
    };
  }

  // Páginas com sessão (feed, mensagens, publicações, lives…): título, mas fora do Google.
  return { title: { absolute: tituloDe(r) }, description: DESCRICAO, robots: { index: false, follow: false } };
}

export default async function Pagina({ params }: Props) {
  const r = await rotaDoPedido(params);
  // Dados estruturados do perfil: o Google percebe que é a página de uma pessoa.
  let ld: string | null = null;
  if (r.startsWith('perfil-')) {
    const c = await perfilPublico(r.slice(7));
    if (c) {
      ld = JSON.stringify({
        '@context': 'https://schema.org', '@type': 'ProfilePage', dateCreated: c.created_at,
        mainEntity: { '@type': 'Person', name: c.name || c.handle, alternateName: '@' + c.handle, description: c.bio || undefined, image: c.avatar_url || undefined,
          interactionStatistic: [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/FollowAction', userInteractionCount: c.follower_count }] },
      }).replace(/</g, '\\u003c');
    }
  }
  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />}
      <App />
    </>
  );
}
