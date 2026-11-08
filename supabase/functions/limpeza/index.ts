// Limpeza de hora a hora (chamada pelo pg_cron, ver supabase/migrations/0014_limpeza.sql).
// Apaga os estados com mais de 24 horas e os ficheiros que ficaram sem publicação ou estado.
// Só aceita pedidos com a chave do Vault no cabeçalho x-limpeza.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const chave = req.headers.get('x-limpeza') || '';
  const { data: valida } = chave ? await admin.rpc('limpeza_chave_valida', { p_chave: chave }) : { data: false };
  if (!valida) return json({ erro: 'Não autorizado' }, 401);

  // 1) Ficheiros a apagar (estados expirados + ficheiros sem dono).
  const { data: lista, error } = await admin.rpc('limpeza_ficheiros');
  if (error) return json({ erro: error.message }, 500);
  const porBucket = new Map<string, string[]>();
  for (const f of (lista || []) as { bucket: string; path: string }[]) {
    if (!porBucket.has(f.bucket)) porBucket.set(f.bucket, []);
    porBucket.get(f.bucket)!.push(f.path);
  }
  const ficheiros: Record<string, number> = {};
  const falhas: string[] = [];
  for (const [bucket, paths] of porBucket) {
    for (let i = 0; i < paths.length; i += 100) {
      const { data, error: e } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (e) falhas.push(`${bucket}: ${e.message}`);
      ficheiros[bucket] = (ficheiros[bucket] || 0) + (data?.length || 0);
    }
  }

  // 2) Linhas dos estados expirados (as visualizações vão em cascata).
  const { count: estados, error: e2 } = await admin.from('stories').delete({ count: 'exact' }).lt('expires_at', new Date().toISOString());
  if (e2) falhas.push(`stories: ${e2.message}`);

  return json({ estados: estados || 0, ficheiros, falhas });
});
