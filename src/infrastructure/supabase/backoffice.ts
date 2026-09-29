/**
 * Adaptadores Supabase das portas da administração (padrão Adapter).
 *
 * Cada consulta aqui é a que a vista da administração fazia directamente; a
 * diferença é que a vista já não sabe que existe Supabase.
 */
import { sb } from './client';
import { signedUrls } from './storage';
import type { ContagensDasFilas } from '../../domain/backoffice/queue.ts';
import { ESTADOS_POR_TRATAR } from '../../domain/backoffice/payout.ts';
import type { Fila, Linha, RepositoriosDoBackoffice } from '../../application/backoffice/ports.ts';

/** Converte `{ error }` do supabase-js numa excepção (a interface mostra a mensagem). */
function ok<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

const KYC_SEL = '*, user:profiles!kyc_requests_user_id_fkey(handle,name,birthdate,country,avatar_url)';

/** Que estados contam como «por tratar» em cada fila, e em que tabela. */
const FILAS: Record<Fila, { tabela: string; estados: readonly string[] }> = {
  kyc: { tabela: 'kyc_requests', estados: ['pending'] },
  rep: { tabela: 'reports', estados: ['open'] },
  pay: { tabela: 'payouts', estados: ESTADOS_POR_TRATAR },
  ct: { tabela: 'contact_messages', estados: ['open'] },
};

export const repositoriosSupabase: RepositoriosDoBackoffice = {
  filas: {
    async contar(incluirLevantamentos) {
      const n = { count: 'exact' as const, head: true };
      const conta = (f: Fila) => sb.from(FILAS[f].tabela).select('id', n).in('status', [...FILAS[f].estados]);
      const [kyc, rep, ct, pay] = await Promise.all([
        conta('kyc'), conta('rep'), conta('ct'),
        incluirLevantamentos ? conta('pay') : Promise.resolve({ count: 0, error: null }),
      ]);
      // Um erro dá `null`, nunca 0: uma fila que não se consegue ler não está «em dia».
      const c = (r: { count: number | null; error: unknown }) => (r.error ? null : r.count ?? 0);
      return { kyc: c(kyc), rep: c(rep), ct: c(ct), pay: c(pay) } satisfies ContagensDasFilas;
    },
    async maisAntigo(fila) {
      const { tabela, estados } = FILAS[fila];
      const { data } = await sb.from(tabela).select('created_at').in('status', [...estados]).order('created_at', { ascending: true }).limit(1);
      return data?.[0]?.created_at ?? null;
    },
    async estatisticas() { return ok(await sb.rpc('admin_stats')) as Linha; },
  },

  verificacoes: {
    async listar(filtro, limite) {
      // Fila justa: por analisar primeiro (os mais antigos no topo, para ninguém passar à
      // frente), tratados no fim (mais recentes primeiro). As duas consultas correm em paralelo.
      const [pend, done] = await Promise.all([
        filtro === 'done' ? Promise.resolve({ data: [] as Linha[], error: null })
          : sb.from('kyc_requests').select(KYC_SEL).eq('status', 'pending').order('created_at', { ascending: true }).limit(limite),
        filtro === 'pending' ? Promise.resolve({ data: [] as Linha[], error: null })
          : sb.from('kyc_requests').select(KYC_SEL).neq('status', 'pending').order('created_at', { ascending: false }).limit(limite),
      ]);
      return [...(ok(pend) || []), ...(ok(done) || [])].slice(0, limite);
    },
    async detalhe(id) {
      const pedido = ok(await sb.from('kyc_requests').select('*, user:profiles!kyc_requests_user_id_fkey(id,handle,name,birthdate,country)').eq('id', id).single()) as Linha;
      const [c, b, urls] = await Promise.all([
        sb.from('creators').select('*').eq('id', pedido.user_id).maybeSingle(),
        sb.from('payout_info').select('*').eq('user_id', pedido.user_id).maybeSingle(),
        signedUrls('kyc', [pedido.doc_front, pedido.doc_back, pedido.selfie], 600),
      ]);
      return { pedido, criador: c.data, banco: b.data, urls };
    },
    async decidir(id, aprovar, motivo) {
      ok(await sb.rpc('admin_review_kyc', { p_request: id, p_approve: aprovar, p_reason: motivo }));
    },
  },

  denuncias: {
    async listar(filtro, limite) {
      const q = sb.from('reports').select('*, reporter:profiles!reports_reporter_id_fkey(handle)');
      // Abertas: as mais antigas primeiro, como qualquer fila. Todas: as mais recentes primeiro.
      return ok(filtro === 'open'
        ? await q.eq('status', 'open').order('created_at', { ascending: true }).limit(limite)
        : await q.order('created_at', { ascending: false }).limit(limite)) || [];
    },
    async obter(id) {
      return ok(await sb.from('reports').select('target_type,target_id,reason').eq('id', id).maybeSingle());
    },
    async resolver(id, remover) {
      ok(await sb.rpc('admin_resolve_report', { p_report: id, p_remove: remover }));
    },
    async handleDoPerfil(perfilId) {
      const { data } = await sb.from('profiles').select('handle').eq('id', perfilId).maybeSingle();
      return data?.handle ?? null;
    },
  },

  levantamentos: {
    async listar(filtro, limite) {
      const q = sb.from('payouts').select('*, user:profiles!payouts_user_id_fkey(handle,name)');
      return ok(filtro === 'open' ? await q.in('status', [...ESTADOS_POR_TRATAR]).order('created_at', { ascending: true }).limit(limite)
        : filtro === 'all' ? await q.order('created_at', { ascending: false }).limit(limite)
        : await q.eq('status', filtro).order('created_at', { ascending: false }).limit(limite)) || [];
    },
    async mudarEstado(id, estado, nota) {
      ok(await sb.rpc('admin_set_payout', { p_payout: id, p_status: estado, p_note: nota }));
    },
  },

  suporte: {
    async listar(filtro, limite) {
      const [abertos, resolvidos] = await Promise.all([
        filtro === 'resolved' ? Promise.resolve({ data: [] as Linha[], error: null })
          : sb.from('contact_messages').select('*').eq('status', 'open').order('created_at', { ascending: true }).limit(limite),
        filtro === 'open' ? Promise.resolve({ data: [] as Linha[], error: null })
          : sb.from('contact_messages').select('*').eq('status', 'resolved').order('created_at', { ascending: false }).limit(limite),
      ]);
      return [...(ok(abertos) || []), ...(ok(resolvidos) || [])].slice(0, limite);
    },
    async resolver(id) {
      ok(await sb.from('contact_messages').update({ status: 'resolved' }).eq('id', id));
    },
  },

  comunidade: {
    async utilizadores(pesquisa) { return (ok(await sb.rpc('admin_users', { p_search: pesquisa || null })) as Linha[]) || []; },
    async mudarPapel(utilizadorId, papel) { ok(await sb.rpc('admin_set_role', { p_user: utilizadorId, p_role: papel })); },
    async mudarEstadoDoCriador(criadorId, estado) { ok(await sb.rpc('admin_set_creator_status', { p_creator: criadorId, p_status: estado })); },
    async conversas() { return (ok(await sb.rpc('admin_threads')) as Linha[]) || []; },
    async mensagens(conversaId) {
      const mensagens = (ok(await sb.rpc('admin_thread_messages', { p_thread: conversaId })) as Linha[]) || [];
      const paths = mensagens.flatMap((m) => (m.media || []).map((x: Linha) => x.path));
      return { mensagens, urls: paths.length ? await signedUrls('messages', paths, 600) : {} };
    },
  },

  promocoes: {
    async listar() {
      return ok(await sb.from('promos').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false })) || [];
    },
    async obter(id) { return ok(await sb.from('promos').select('*').eq('id', id).maybeSingle()); },
    async guardar(id, dados) {
      const r = id ? await sb.from('promos').update(dados).eq('id', id) : await sb.from('promos').insert(dados);
      // As colunas do banner (mobile_slot, pinned, cta) vêm da migração 0006.
      if (r.error && /mobile_slot|pinned|cta/.test(String((r.error as { message?: string }).message))) {
        throw new Error('Falta aplicar a migração supabase/migrations/0006_promos_banner.sql no Supabase.');
      }
      ok(r);
    },
    async apagar(id) { ok(await sb.from('promos').delete().eq('id', id)); },
    async enviarFicheiro(ficheiro, sufixo) {
      const nome = String(ficheiro.name || 'ficheiro').normalize('NFD').replace(/[^\w.\-]+/g, '_').slice(-60);
      const path = `${Date.now()}-${sufixo}${nome}`;
      const { error } = await sb.storage.from('promos').upload(path, ficheiro, { upsert: true, contentType: ficheiro.type || undefined, cacheControl: '3600' });
      if (error) throw new Error(/Payload too large|exceeded/i.test(error.message) ? 'O ficheiro é demasiado grande.' : error.message);
      return sb.storage.from('promos').getPublicUrl(path).data.publicUrl;
    },
  },

  definicoes: {
    async listar() { return ok(await sb.from('settings').select('*').order('key')) || []; },
    async gravar(linhas) {
      // O PostgREST não tem transacções entre pedidos: a validação acontece toda antes
      // (no domínio), por isso aqui só falha por rede ou permissão.
      for (const l of linhas) ok(await sb.from('settings').update({ value: l.value }).eq('key', l.key));
    },
  },
};
