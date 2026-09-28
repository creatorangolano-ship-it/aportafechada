/**
 * Cliente Supabase do browser (chave pública `anon`; a segurança está nas políticas RLS).
 * Um único cliente para toda a app (Singleton): é ele que guarda a sessão.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

export const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});
