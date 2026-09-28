/**
 * Erro de regra de negócio. A mensagem é escrita para o utilizador ler: a
 * interface mostra-a tal como está (`errText`), sem traduzir nem esconder.
 */
export class ErroDeRegra extends Error {}

/** Atira `ErroDeRegra` quando `motivo` não é `null` — para as funções `recusa*` do domínio. */
export function exigir(motivo: string | null): void {
  if (motivo) throw new ErroDeRegra(motivo);
}
