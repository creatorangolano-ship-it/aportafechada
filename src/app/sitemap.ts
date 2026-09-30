import type { MetadataRoute } from 'next';
import { caminhoDe } from '@/lib/caminhos';
import { PUBLICAS, SITE } from '@/lib/seo-textos';
import { criadoresPublicos } from './seo';

/** Actualiza de hora a hora: novos criadores aprovados entram sem novo deploy. */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paginas: MetadataRoute.Sitemap = Object.keys(PUBLICAS).map((r) => ({
    url: SITE + caminhoDe(r),
    changeFrequency: r === 'inicio' || r === 'top' ? 'daily' : 'monthly',
    priority: r === 'inicio' ? 1 : r === 'top' ? 0.8 : 0.5,
  }));
  const perfis: MetadataRoute.Sitemap = (await criadoresPublicos()).map((c) => ({
    url: SITE + caminhoDe('perfil-' + c.handle),
    lastModified: c.atualizado,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));
  return [...paginas, ...perfis];
}
