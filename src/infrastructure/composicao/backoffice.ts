/**
 * Raiz de composição da administração (padrão Factory).
 *
 * É o único sítio que sabe que o caso de uso `Backoffice` corre sobre os
 * repositórios do Supabase. A interface pede `backoffice(actor)` e recebe a
 * fachada pronta; trocar de base de dados (ou usar repositórios em memória
 * nos testes) muda só este ficheiro.
 */
import { Backoffice, type Actor } from '../../application/backoffice/backoffice.ts';
import { repositoriosSupabase } from '../supabase/backoffice';

export const backoffice = (actor: Actor): Backoffice => new Backoffice(repositoriosSupabase, actor);
