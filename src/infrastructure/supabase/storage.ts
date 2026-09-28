/**
 * Ficheiros no Supabase Storage: URLs assinados (buckets privados, com cache),
 * envio e URLs públicos.
 */
import { sb } from './client';

type Cached = { url: string; exp: number };
const urlCache = new Map<string, Cached>();

/** Limpa as URLs assinadas em cache. Tem de ser chamado ao sair/ trocar de conta: numa máquina
 *  partilhada, o URL assinado de um ficheiro privado ficaria disponível para a conta seguinte. */
export function clearUrlCache(): void { urlCache.clear(); }

/** URLs temporários para ficheiros privados. Os que o utilizador não pode ver ficam em falta. */
export async function signedUrls(bucket: string, paths: string[], ttl = 3600): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  // Filtra entradas vazias: createSignedUrls falha no lote inteiro se alguma for null/undefined.
  const list = [...new Set(paths.filter(Boolean))];
  const need2 = list.filter((p) => {
    const c = urlCache.get(bucket + p);
    if (c && c.exp > Date.now()) { out[p] = c.url; return false; }
    return true;
  });
  if (need2.length) {
    const { data } = await sb.storage.from(bucket).createSignedUrls(need2, ttl);
    for (const r of data || []) {
      if (r.signedUrl && r.path && !r.error) {
        out[r.path] = r.signedUrl;
        urlCache.set(bucket + r.path, { url: r.signedUrl, exp: Date.now() + (ttl - 60) * 1000 });
      }
    }
  }
  return out;
}

export async function upload(bucket: string, path: string, file: File, opts: { upsert?: boolean } = {}): Promise<string> {
  const { error } = await sb.storage.from(bucket).upload(path, file, {
    upsert: !!opts.upsert,
    contentType: file.type || undefined,
    cacheControl: '3600',
  });
  if (error) {
    throw new Error(/Payload too large|exceeded/i.test(error.message)
      ? 'O ficheiro é demasiado grande.'
      : error.message);
  }
  return path;
}

export function publicUrl(bucket: string, path: string): string {
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
