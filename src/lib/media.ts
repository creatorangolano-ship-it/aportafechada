// Comprime fotos e vídeos no telemóvel/computador de quem publica, ANTES de os enviar.
//
// Uma foto de telemóvel tem 3–12 MB e um vídeo 50–500 MB; quem vê o site em Angola paga cada
// megabyte. Aqui as fotos passam a ter no máximo 2048 px no lado maior (WebP, ou JPEG onde o
// browser não gera WebP) e os vídeos passam a 720p em H.264 (o formato que todos os telemóveis
// tocam). Se o browser não conseguir (formato estranho, aparelho antigo), envia-se o original:
// comprimir nunca pode impedir alguém de publicar.

/** Lado maior das fotos depois de comprimidas. Chega para ecrãs de computador e telemóveis. */
const FOTO_MAX = 2048;
/** Lado maior dos vídeos depois de comprimidos (720p). */
const VIDEO_MAX = 1280;
/** Abaixo disto o vídeo já é leve e não vale a pena esperar pela compressão. */
const VIDEO_MIN_BYTES = 6e6;

const nomeCom = (nome: string, ext: string) => (nome.replace(/\.\w+$/, '') || 'ficheiro') + '.' + ext;
const par = (n: number) => Math.max(2, Math.round(n / 2) * 2);

async function gerar(c: HTMLCanvasElement, tipo: string, q: number): Promise<Blob | null> {
  return new Promise((r) => c.toBlob(r, tipo, q));
}

/** Reduz e recomprime uma foto. Devolve o original se não for possível ou se não ficar mais leve. */
export async function comprimirImagem(file: File, max = FOTO_MAX): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file; // GIF animado, HEIC, etc.: segue como está
  try {
    const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, max / Math.max(img.width, img.height));
    if (k === 1 && file.size < 400e3) { img.close(); return file; }
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const ctx = c.getContext('2d');
    if (!ctx) { img.close(); return file; }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    img.close();
    // WebP pesa ~30% menos que JPEG com a mesma qualidade; o Safari antigo devolve PNG ao pedir WebP.
    let b = await gerar(c, 'image/webp', 0.82);
    let ext = 'webp';
    if (!b || b.type !== 'image/webp') { b = await gerar(c, 'image/jpeg', 0.84); ext = 'jpg'; }
    if (!b || b.size >= file.size) return file;
    return new File([b], nomeCom(file.name, ext), { type: b.type });
  } catch {
    return file;
  }
}

/**
 * Converte um vídeo para 720p H.264 + AAC, com o índice no início (começa a tocar antes de
 * descarregar tudo). `progresso` recebe 0–1. Devolve o original se não for possível.
 */
export async function comprimirVideo(file: File, progresso?: (p: number) => void): Promise<File> {
  if (!file.type.startsWith('video/') || file.size < VIDEO_MIN_BYTES) return file;
  if (typeof window === 'undefined' || typeof (window as { VideoEncoder?: unknown }).VideoEncoder === 'undefined') return file;
  try {
    const mb = await import('mediabunny'); // só se descarrega quando alguém envia um vídeo
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const conversao = await mb.Conversion.init({
      input, output,
      video: (faixa) => {
        const w = faixa.displayWidth, h = faixa.displayHeight;
        const k = Math.min(1, VIDEO_MAX / Math.max(w, h));
        return { width: par(w * k), height: par(h * k), fit: 'contain', codec: 'avc', bitrate: mb.QUALITY_MEDIUM };
      },
      audio: { codec: 'aac', bitrate: 128e3 },
      showWarnings: false,
    });
    if (!conversao.isValid) return file;
    conversao.onProgress = (p) => progresso?.(p);
    await conversao.execute();
    const buf = target.buffer;
    if (!buf || buf.byteLength >= file.size * 0.9) return file;
    return new File([buf], nomeCom(file.name, 'mp4'), { type: 'video/mp4' });
  } catch {
    return file;
  }
}

/** Foto ou vídeo: escolhe a compressão certa. `progresso` só é chamado nos vídeos. */
export async function prepararParaEnviar(file: File, progresso?: (p: number) => void): Promise<File> {
  if (file.type.startsWith('image/')) return comprimirImagem(file);
  if (file.type.startsWith('video/')) return comprimirVideo(file, progresso);
  return file;
}
