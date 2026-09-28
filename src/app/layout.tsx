import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * A app inteira é uma SPA que vive no browser: o estado está no Supabase e no
 * localStorage, e as páginas mudam por hash (#feed, #mensagens), não por URL.
 * Por isso não há `metadata` por rota — há um só, aqui.
 */
export const metadata: Metadata = {
  title: 'À Porta Fechada',
  description: 'Conteúdos exclusivos dos teus criadores favoritos, com pagamentos em kwanzas.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/img/icon.svg' },
  appleWebApp: { capable: true, title: 'À Porta Fechada' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#D0103C',
};

/**
 * Script de tema, executado antes da primeira pintura para não haver um flash
 * branco quando o utilizador escolheu o modo escuro.
 *
 * Mantém-se inline (e não como `<Script>` do Next) por uma razão concreta: um
 * script bloqueante em `<head>` garante que o atributo `data-theme` está
 * aplicado antes do browser pintar. O `<Script>` do Next é diferido, o que
 * perderia essa corrida.
 *
 * Se activares o CSP em `next.config.mjs`, este é o único script inline da
 * página e precisa do sha256 correspondente (já está anotado lá).
 */
const THEME_BOOT = `try{document.documentElement.dataset.theme=localStorage.getItem('apf-theme')||'light'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" data-theme="light">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        {/* A estrutura que o roteador em `lib/main.ts` espera. Os ids não são
            decorativos: `header()` escreve em #hdr, `render()` em #app, e os
            modais e toasts vivem em #modalRoot e #toastRoot. */}
        <header className="top"><div className="wrap" id="hdr" /></header>
        {children}
        <footer className="pub-foot" id="foot"><div className="wrap"><nav aria-label="Rodapé"><a href="#sobre">Sobre a plataforma</a><a href="#funciona">Como funciona</a><a href="#top" id="footTop10">Top 10</a><a href="#termos">Termos e condições</a><a href="#privacidade">Política de privacidade</a><a href="#regras">Regras</a><a href="#faq">Perguntas frequentes</a><a href="#dmca">Direitos de autor</a><a href="#contacto">Contacto</a><a href="#afiliados">Afiliados</a><a href="#blog">Blog</a><a href="#inicio" data-act="installApp">Instalar app</a></nav><div className="co">© <span id="yr">2026</span> À Porta Fechada · <b>Luanda, Angola</b></div></div></footer>
        <div id="floatTheme" />
        <nav className="tabbar" id="tabbar" />
        <div id="modalRoot" />
        <div id="toastRoot" />
      </body>
    </html>
  );
}
