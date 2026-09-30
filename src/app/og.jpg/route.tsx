import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * Imagem de partilha (1200 × 630) que aparece no WhatsApp, Facebook, LinkedIn e X
 * quando alguém partilha um link do site. Gerada uma vez no build.
 * Os perfis de criador usam a capa ou a foto do próprio criador em vez desta.
 * Sai em JPEG: em PNG, por causa da fotografia, passava dos 500 KB, e o WhatsApp
 * deixa de mostrar a pré-visualização em imagens pesadas.
 */
export const dynamic = 'force-static';

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#fff"/><path d="M20 14.5 38.6 11A3 3 0 0 1 42 14v36a3 3 0 0 1-3.4 3L20 49.5A3 3 0 0 1 17.5 46.5V17.5A3 3 0 0 1 20 14.5Z" fill="#D0103C"/><path d="M47 13v38" stroke="#D0103C" stroke-width="3" stroke-linecap="round"/><circle cx="34" cy="32" r="2.6" fill="#fff"/></svg>`;

export async function GET() {
  const foto = await readFile(join(process.cwd(), 'public/img/hero.jpg'));
  const fotoSrc = `data:image/jpeg;base64,${foto.toString('base64')}`;
  const logoSrc = `data:image/svg+xml;base64,${Buffer.from(LOGO).toString('base64')}`;
  const png = new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#D0103C' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 64px', width: 730, color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} width={96} height={96} alt="" />
            <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, marginLeft: 26, letterSpacing: -1.5 }}>A Porta Fechada</div>
          </div>
          <div style={{ display: 'flex', fontSize: 38, lineHeight: 1.3, marginTop: 40, fontWeight: 600 }}>
            Os teus criadores favoritos, os conteúdos que só partilham contigo.
          </div>
          <div style={{ display: 'flex', fontSize: 26, marginTop: 36, opacity: 0.85 }}>aportafechada.net · Pagamentos em kwanzas</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotoSrc} width={470} height={630} alt="" style={{ objectFit: 'cover' }} />
      </div>
    ),
    { width: 1200, height: 630 },
  );
  const jpg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  return new Response(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
}
