/**
 * Moderação de contas: banir e advertir.
 *
 * Qualquer conta pode ser banida ou advertida pelo admin — fã, criador,
 * moderador ou outro admin — excepto duas: a própria (ninguém se bane a si
 * mesmo) e o perfil principal da plataforma, que nenhum admin pode tocar.
 * O backend (admin_ban_user, admin_warn_user) aplica as mesmas regras.
 */
import { pode, type Role } from './role.ts';

/** Durações possíveis de um banimento. `null` = permanente. */
export const DURACOES_BANIMENTO: ReadonlyArray<{ dias: number | null; rotulo: string }> = [
  { dias: 1, rotulo: '1 dia' },
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: null, rotulo: 'Permanente' },
];

export type Actor = { id: string; role: Role };
export type Alvo = { id: string; is_owner?: boolean | null };

function recusaComum(actor: Actor, alvo: Alvo, motivo: string, accao: string): string | null {
  if (!pode(actor.role, 'banir_contas')) return 'Sem permissão para esta ação.';
  if (alvo.id === actor.id) return `Não podes ${accao} a tua própria conta.`;
  if (alvo.is_owner) return `O perfil principal não pode ser ${accao === 'banir' ? 'banido' : 'advertido'}.`;
  if (motivo.trim().length < 5) return `Escreve o motivo ${accao === 'banir' ? 'do banimento' : 'da advertência'}.`;
  if (motivo.trim().length > 300) return 'O motivo tem de ter no máximo 300 caracteres.';
  return null;
}

export function recusaBanimento(actor: Actor, alvo: Alvo, motivo: string, dias: number | null): string | null {
  const r = recusaComum(actor, alvo, motivo, 'banir');
  if (r) return r;
  return DURACOES_BANIMENTO.some((d) => d.dias === dias) ? null : 'Duração inválida.';
}

export const recusaAdvertencia = (actor: Actor, alvo: Alvo, motivo: string): string | null =>
  recusaComum(actor, alvo, motivo, 'advertir');

/** Está banida agora? (um banimento temporário que já acabou não conta) */
export const banimentoAtivo = (p: { banned_at?: string | null; banned_until?: string | null }, agora: Date = new Date()): boolean =>
  !!p.banned_at && (!p.banned_until || new Date(p.banned_until) > agora);
