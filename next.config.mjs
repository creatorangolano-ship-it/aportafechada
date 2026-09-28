/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // A app é uma SPA: tudo o que é interface corre no browser. O servidor serve
  // o HTML inicial e as API routes de /api. Não há SSR, porque não há nada
  // para renderizar no servidor — o estado vive no Supabase e no browser, e as
  // páginas mudam por hash, não por URL.
  //
  // Isto é deliberado. Componentes de servidor não trariam nada aqui: o feed,
  // as mensagens, o paywall e as lives dependem de sessão e de realtime no
  // cliente. Forçar SSR só adicionaria uma ida ao servidor por página.
  //
  // Se alguma vez quiseres SSR de verdade (páginas públicas para SEO, por
  // exemplo), tira o 'use client' da página e passa a função a ser async.

  // O alojamento é a Vercel, que detecta o Next sozinha e não precisa de
  // `output: 'standalone'` nem de ficheiro de configuração próprio.

  // Cabeçalhos de segurança. Vivem só aqui: a Vercel aplica o `headers()` do
  // Next, e defini-los também num `vercel.json` seria duplicação — ninguém
  // saberia qual dos dois se aplica.
  async headers() {
    const common = {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    };
    return [
      { source: '/:path*', headers: Object.entries(common).map(([key, value]) => ({ key, value })) },
    ];
  },
};

export default nextConfig;
