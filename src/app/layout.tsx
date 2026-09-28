import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import { SUPABASE_URL } from '@/infrastructure/config';
import './globals.css';

/**
 * Tipo de letra alojado pelo próprio site (next/font), em vez da folha de
 * estilos do Google Fonts: poupa a ida a dois domínios externos antes de o texto
 * aparecer, e o ficheiro vem pré-carregado. Só o subconjunto latino; os eixos
 * de peso e de largura (`wdth`, usado nos títulos) ficam no mesmo ficheiro variável.
 */
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], display: 'swap', variable: '--font-archivo' });

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
 * Aproveita para pré-carregar a imagem principal da página de entrada, mas só
 * quando é essa a página que vai aparecer: sem sessão guardada do Supabase
 * (`sb-*-auth-token`) e sem rota ou em #inicio/#registar. Quem já tem sessão
 * nunca vê essa imagem e não a descarrega.
 *
 * Se activares o CSP em `next.config.mjs`, este é o único script inline da
 * página e precisa do sha256 correspondente — recalcula-o sempre que o mudares.
 */
const THEME_BOOT = `try{document.documentElement.dataset.theme=localStorage.getItem('apf-theme')||'light';var h=location.hash;if((!h||h==='#inicio'||h==='#registar')&&!Object.keys(localStorage).some(function(k){return /^sb-.*-auth-token$/.test(k)})){var l=document.createElement('link');l.rel='preload';l.as='image';l.type='image/avif';l.href='/img/hero.avif';l.setAttribute('fetchpriority','high');document.head.appendChild(l)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" data-theme="light" className={archivo.variable}>
      <head>
        {/* A primeira coisa que a app faz é falar com o Supabase: abrir já a
            ligação (DNS + TLS) enquanto o JavaScript descarrega. */}
        <link rel="preconnect" href={SUPABASE_URL} crossOrigin="anonymous" />
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
