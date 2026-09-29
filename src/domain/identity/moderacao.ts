/**
 * Moderação de contas: advertir, banir e pedir banimento.
 *
 * - Só o admin adverte e bane. À 3.ª advertência a conta é banida
 *   automaticamente (permanente, até o admin a reactivar).
 * - Moderadores não banem: pedem o banimento, e o admin decide.
 * - Ninguém age sobre a própria conta, e o perfil principal da plataforma é
 *   intocável.
 * O backend (admin_warn_user, admin_ban_user, mod_request_ban,
 * admin_decide_ban_request) aplica as mesmas regras.
 */
import { pode, type Role } from './role.ts';

/** Motivos de advertência, banimento e pedido de banimento. Todos exigem uma explicação escrita. */
export const MOTIVOS: ReadonlyArray<{ codigo: CodigoMotivo; rotulo: string }> = [
  { codigo: 'suspeito', rotulo: 'Comportamento suspeito' },
  { codigo: 'multiplas_contas', rotulo: 'Múltiplas contas' },
  { codigo: 'desrespeito', rotulo: 'Comportamento desrespeitoso' },
  { codigo: 'perfil_falso', rotulo: 'Perfil falso' },
  { codigo: 'outro', rotulo: 'Outra razão' },
];
export type CodigoMotivo = 'suspeito' | 'multiplas_contas' | 'desrespeito' | 'perfil_falso' | 'outro';

/** À 3.ª advertência, a conta é banida. */
export const ADVERTENCIAS_PARA_BANIMENTO = 3;

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

export const rotuloDoMotivo = (codigo: string): string => MOTIVOS.find((m) => m.codigo === codigo)?.rotulo ?? 'Outra razão';

/** Motivo e explicação válidos? */
export function recusaMotivo(codigo: string, explicacao: string): string | null {
  if (!MOTIVOS.some((m) => m.codigo === codigo)) return 'Escolhe o motivo.';
  const t = explicacao.trim();
  if (t.length < 5) return 'Explica o motivo (pelo menos 5 caracteres).';
  if (t.length > 300) return 'A explicação tem de ter no máximo 300 caracteres.';
  return null;
}

function recusaAlvo(actor: Actor, alvo: Alvo): string | null {
  if (alvo.id === actor.id) return 'Não podes fazer isto à tua própria conta.';
  if (alvo.is_owner) return 'O perfil principal não pode ser banido nem advertido.';
  return null;
}

export function recusaBanimento(actor: Actor, alvo: Alvo, codigo: string, explicacao: string, dias: number | null): string | null {
  if (!pode(actor.role, 'banir_contas')) return 'Sem permissão para esta ação.';
  const r = recusaAlvo(actor, alvo) ?? recusaMotivo(codigo, explicacao);
  if (r) return r;
  return DURACOES_BANIMENTO.some((d) => d.dias === dias) ? null : 'Duração inválida.';
}

export function recusaAdvertencia(actor: Actor, alvo: Alvo, codigo: string, explicacao: string): string | null {
  if (!pode(actor.role, 'banir_contas')) return 'Sem permissão para esta ação.';
  return recusaAlvo(actor, alvo) ?? recusaMotivo(codigo, explicacao);
}

/** Pedir banimento: qualquer membro da equipa (moderador ou admin). */
export function recusaPedidoBanimento(actor: Actor, alvo: Alvo, codigo: string, explicacao: string): string | null {
  if (!pode(actor.role, 'moderar')) return 'Sem permissão para esta ação.';
  return recusaAlvo(actor, alvo) ?? recusaMotivo(codigo, explicacao);
}

/** Esta advertência vai banir a conta? (`jaTem` = advertências que a conta já tem) */
export const advertenciaBane = (jaTem: number): boolean => jaTem + 1 >= ADVERTENCIAS_PARA_BANIMENTO;

/** Está banida agora? (um banimento temporário que já acabou não conta) */
export const banimentoAtivo = (p: { banned_at?: string | null; banned_until?: string | null }, agora: Date = new Date()): boolean =>
  !!p.banned_at && (!p.banned_until || new Date(p.banned_until) > agora);
