/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // A app é uma SPA: a interface corre no browser. Cada endereço real (/sobre,
  // /perfil/<nome>, /feed…) serve a mesma SPA a partir de `app/[[...rota]]`, que
  // só gera no servidor os metadados (título, descrição, canónico, imagem de
  // partilha) para o Google e para as pré-visualizações do WhatsApp e Facebook.
  // As páginas fixas saem prontas do build; os perfis ficam em cache 10 minutos.

  // O alojamento é a Vercel, que detecta o Next sozinha e não precisa de
  // `output: 'standalone'` nem de ficheiro de configuração próprio.

  // Cabeçalhos de segurança. Vivem só aqui: a Vercel aplica o `headers()` do
  // Next, e defini-los também num `vercel.json` seria duplicação — ninguém
  // saberia qual dos dois se aplica.
  // O Top 10 saiu do site: links antigos (Google, partilhas) vão para o Explorar.
  async redirects() {
    return [{ source: '/top', destination: '/explorar', permanent: true }];
  },

  async headers() {
    // Política de conteúdo (CSP). O que mais protege:
    // * scripts só deste domínio (nenhum script de outro site corre aqui);
    // * o browser só fala com este site, com o Supabase e com o LiveKit (lives):
    //   um script injetado não consegue enviar sessões ou dados para outro lado;
    // * ninguém pode pôr o site dentro de uma moldura (frame-ancestors).
    // 'unsafe-inline' nos scripts fica porque o Next e o arranque do tema usam
    // scripts embutidos. Imagens e molduras https de qualquer origem ficam
    // permitidas por causa dos banners HTML de publicidade (ex.: AliExpress).
    const supa = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xkcngjrlfmozlsttuxgs.supabase.co';
    const supaWs = supa.replace(/^https:/, 'wss:');
    const dev = process.env.NODE_ENV !== 'production';
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https:`,
      `media-src 'self' blob: ${supa}`,
      "font-src 'self' data:",
      `connect-src 'self' ${supa} ${supaWs} https://*.livekit.cloud wss://*.livekit.cloud${dev ? ' ws: http://localhost:*' : ''}`,
      "frame-src https:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      ...(dev ? [] : ['upgrade-insecure-requests']),
    ].join('; ');
    const common = {
      'Content-Security-Policy': csp,
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'X-Permitted-Cross-Domain-Policies': 'none',
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
