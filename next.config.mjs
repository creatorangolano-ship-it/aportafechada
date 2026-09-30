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
