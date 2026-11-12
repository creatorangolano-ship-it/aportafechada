'use client';

import { Analytics } from '@vercel/analytics/react';

/**
 * Estatísticas de visitas (Vercel Web Analytics): visitantes, páginas mais vistas,
 * de onde vêm (Facebook, Instagram, Google…), país e aparelho.
 *
 * Sem cookies e sem dados pessoais. O script vem do próprio site
 * (/_vercel/insights), por isso a CSP não precisa de mudar.
 *
 * Usa-se a versão React (e não a do Next) porque as mudanças de página são feitas
 * pelo roteador próprio em `lib/main.ts` com history.pushState: o script segue-as
 * sozinho. A consola de administração não é contada.
 */
export default function Analise() {
  return <Analytics beforeSend={(e) => (/^\/admin(\/|$)/.test(new URL(e.url).pathname) ? null : e)} />;
}
