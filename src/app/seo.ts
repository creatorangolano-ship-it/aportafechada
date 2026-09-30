/**
 * Dados para os metadados do servidor (título, descrição, imagem de partilha,
 * canónico) e para o sitemap. Só corre no servidor.
 *
 * Os perfis vêm de `perfil_publico` / `criadores_publicos` (funções do Supabase
 * que só devolvem campos públicos de criadores aprovados), com a chave anon —
 * a mesma que qualquer visitante tem no browser.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/infrastructure/config';

export type PerfilPublico = {
  handle: string; name: string | null; avatar_url: string | null; cover_url: string | null; bio: string | null;
  category: string | null; city: string | null; price: number | null; follower_count: number; post_count: number; created_at: string;
};

async function rpc<T>(nome: string, corpo: Record<string, unknown>): Promise<T | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      // Um perfil muda pouco: 10 minutos de cache poupam o Supabase aos robôs.
      next: { revalidate: 600 },
    });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

export async function perfilPublico(handle: string): Promise<PerfilPublico | null> {
  const d = await rpc<PerfilPublico[]>('perfil_publico', { p_handle: handle });
  return d?.[0] ?? null;
}

export async function criadoresPublicos(): Promise<Array<{ handle: string; atualizado: string }>> {
  return (await rpc<Array<{ handle: string; atualizado: string }>>('criadores_publicos', {})) ?? [];
}
