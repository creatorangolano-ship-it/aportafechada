/**
 * Raiz de composição dos pagamentos: o caso de uso `Pagamentos` com o catálogo,
 * as estratégias e o seguimento do Supabase. Uma única instância (Singleton),
 * criada na primeira utilização.
 */
import { Pagamentos } from '../../application/commerce/pagamentos.ts';
import { catalogoSupabase, estrategiasSupabase, seguimentoSupabase } from '../supabase/commerce';

let instancia: Pagamentos | null = null;
export const pagamentos = (): Pagamentos =>
  (instancia ??= new Pagamentos(catalogoSupabase, estrategiasSupabase, seguimentoSupabase));
