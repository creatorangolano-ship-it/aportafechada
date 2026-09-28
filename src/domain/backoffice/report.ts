/**
 * Denúncias feitas pela comunidade.
 */
import { pode, type Role } from '../identity/role.ts';

export type EstadoDenuncia = 'open' | 'removed' | 'kept';
export type AlvoDenuncia = 'post' | 'creator' | 'message' | 'live';

/**
 * O que quem está a tratar pode fazer a uma denúncia aberta.
 * - Arquivar: sempre (a denúncia fica «mantida»).
 * - Remover: esconder a publicação, apagar a mensagem, terminar a live.
 * - Suspender: só para perfis, e só o admin completo.
 */
export function accoesPossiveis(d: { status: string; target_type: string }, role: Role | null | undefined) {
  if (d.status !== 'open') return { arquivar: false, remover: false, suspender: false, soAdminSuspende: false };
  const ePerfil = d.target_type === 'creator';
  const podeSuspender = pode(role, 'suspender_perfis');
  return {
    arquivar: true,
    remover: !ePerfil,
    suspender: ePerfil && podeSuspender,
    soAdminSuspende: ePerfil && !podeSuspender,
  };
}
