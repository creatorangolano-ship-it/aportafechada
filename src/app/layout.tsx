import type { Metadata, Viewport } from 'next';
import { Archivo } from 'next/font/google';
import { SUPABASE_URL } from '@/infrastructure/config';
import { SITE, NOME, DESCRICAO } from '@/lib/seo-textos';
import { META_PIXEL_ID } from '@/lib/config';
import Analise from './Analise';
import './globals.css';

/**
 * Tipo de letra alojado pelo próprio site (next/font), em vez da folha de
 * estilos do Google Fonts: poupa a ida a dois domínios externos antes de o texto
 * aparecer, e o ficheiro vem pré-carregado. Só o subconjunto latino; os eixos
 * de peso e de largura (`wdth`, usado nos títulos) ficam no mesmo ficheiro variável.
 */
// preload: false — em rede móvel lenta, os 88 KB da letra pré-carregada competiam com o
// JavaScript que desenha a página. Com `swap`, o texto aparece já na letra do sistema.
const archivo = Archivo({ subsets: ['latin'], axes: ['wdth'], display: 'swap', preload: false, variable: '--font-archivo' });

/**
 * Metadados por omissão. Cada endereço (/sobre, /perfil/<nome>…) acrescenta os seus
 * em `[[...rota]]/page.tsx`: título, descrição, canónico e imagem de partilha.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: NOME, template: '%s · ' + NOME },
  description: DESCRICAO,
  applicationName: NOME,
  manifest: '/manifest.webmanifest',
  icons: { icon: '/img/icon.svg' },
  appleWebApp: { capable: true, title: NOME },
  openGraph: { type: 'website', siteName: NOME, locale: 'pt_PT', title: NOME, description: DESCRICAO, images: [{ url: '/og.jpg', width: 1200, height: 630, alt: NOME }] },
  twitter: { card: 'summary_large_image', title: NOME, description: DESCRICAO, images: ['/og.jpg'] },
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
 * (`sb-*-auth-token`) e no endereço / ou /registar. Quem já tem sessão
 * nunca vê essa imagem e não a descarrega.
 *
 * Se activares o CSP em `next.config.mjs`, este é o único script inline da
 * página e precisa do sha256 correspondente — recalcula-o sempre que o mudares.
 */
const THEME_BOOT = `try{document.documentElement.dataset.theme=localStorage.getItem('apf-theme')||'light';var h=location.pathname;if((h==='/'||h==='/registar')&&!Object.keys(localStorage).some(function(k){return /^sb-.*-auth-token$/.test(k)})){var l=document.createElement('link');l.rel='preload';l.as='image';l.type='image/avif';l.href='/img/hero.avif';document.head.appendChild(l)}}catch(e){}`;

/**
 * Píxel da Meta no `<head>`, com o PageView da página de entrada logo à chegada do HTML.
 *
 * Antes, o píxel só arrancava depois de todo o JavaScript da app descarregar e de a
 * primeira página ser desenhada. Em rede móvel isso leva segundos, e a Meta só conta
 * uma «visualização da página de destino» quando o píxel dispara: na campanha de
 * Novembro de 2026 perdiam-se ~60 % dos cliques (754 cliques → 289 visualizações).
 * `fbevents.js` continua assíncrono; não atrasa a página. As mudanças de página
 * seguintes e os eventos (registo, candidatura) continuam em `lib/pixel.ts`.
 * Só em aportafechada.net, e nunca na consola de administração.
 */
const PIXEL_BOOT = `try{var p=location.pathname;if(/(^|\\.)aportafechada\\.net$/.test(location.hostname)&&p.indexOf('/admin')!==0){!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');window.__apfPV=p}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt" data-theme="light" className={archivo.variable}>
      <head>
        {/* A primeira coisa que a app faz é falar com o Supabase: abrir já a
            ligação (DNS + TLS) enquanto o JavaScript descarrega. */}
        <link rel="preconnect" href={SUPABASE_URL} crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: PIXEL_BOOT }} />
      </head>
      <body>
        {/* A estrutura que o roteador em `lib/main.ts` espera. Os ids não são
            decorativos: `header()` escreve em #hdr, `render()` em #app, e os
            modais e toasts vivem em #modalRoot e #toastRoot. */}
        <header className="top"><div className="wrap" id="hdr" /></header>
        {children}
        <footer className="pub-foot" id="foot"><div className="wrap"><nav aria-label="Rodapé"><a href="/sobre">Sobre a plataforma</a><a href="/funciona">Como funciona</a><a href="/termos">Termos e condições</a><a href="/privacidade">Política de privacidade</a><a href="/regras">Regras</a><a href="/faq">Perguntas frequentes</a><a href="/dmca">Direitos de autor</a><a href="/contacto">Contacto</a><a href="/afiliados">Afiliados</a><a href="/blog">Blog</a><a href="/" data-act="installApp">Instalar app</a></nav><div className="co">© <span id="yr">2026</span> A Porta Fechada · <b>Luanda, Angola</b></div></div></footer>
        <div id="floatTheme" />
        <nav className="tabbar" id="tabbar" />
        <div id="modalRoot" />
        <div id="toastRoot" />
        <Analise />
      </body>
    </html>
  );
}
