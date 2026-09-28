/**
 * Papéis e permissões.
 *
 * A fronteira real está no backend (RLS e funções SECURITY DEFINER). Esta
 * matriz é a mesma regra do lado do cliente: decide o que a interface mostra e
 * impede que um comando corra por um clique sintético. Uma permissão nova
 * acrescenta-se aqui, e não com `role === 'admin'` espalhado pelas vistas.
 */

export type Role = 'fan' | 'creator' | 'moderator' | 'admin';
export const ROLES: readonly Role[] = ['fan', 'creator', 'moderator', 'admin'];

export type Permissao =
  | 'moderar'                 // verificações, denúncias (arquivar/remover conteúdo), suporte
  | 'suspender_perfis'
  | 'gerir_levantamentos'     // mexe em dinheiro real
  | 'ver_financas'
  | 'ver_mensagens_privadas'  // auditoria de conversas
  | 'gerir_papeis'
  | 'gerir_promocoes'
  | 'gerir_definicoes';

const MATRIZ: Record<Permissao, readonly Role[]> = {
  moderar: ['moderator', 'admin'],
  suspender_perfis: ['admin'],
  gerir_levantamentos: ['admin'],
  ver_financas: ['admin'],
  ver_mensagens_privadas: ['admin'],
  gerir_papeis: ['admin'],
  gerir_promocoes: ['admin'],
  gerir_definicoes: ['admin'],
};

export const pode = (role: Role | null | undefined, p: Permissao): boolean => !!role && MATRIZ[p].includes(role);
export const eStaff = (role: Role | null | undefined): boolean => pode(role, 'moderar');
export const eAdmin = (role: Role | null | undefined): boolean => role === 'admin';

/**
 * Pode `actor` mudar o papel de `alvo` para `novo`? Devolve o motivo da recusa,
 * ou `null`. Ninguém muda o próprio papel: é a forma de a plataforma nunca
 * ficar sem ninguém que a gira.
 */
export function recusaMudarPapel(actor: { id: string; role: Role }, alvoId: string, novo: string): string | null {
  if (!pode(actor.role, 'gerir_papeis')) return 'Sem permissão para esta ação.';
  if (!(ROLES as readonly string[]).includes(novo)) return 'Papel inválido.';
  if (alvoId === actor.id) return 'Não podes mudar o teu próprio papel.';
  return null;
}
