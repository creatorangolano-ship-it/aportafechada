import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/seo-textos';

/** O Google pode ver as páginas públicas e os perfis; as áreas com sessão ficam de fora. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin', '/conta', '/carteira', '/mensagens', '/estudio', '/feed', '/compras', '/subscricoes', '/confirmar', '/nova-senha'],
    },
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
