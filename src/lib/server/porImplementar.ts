import 'server-only';

import { erro } from './guarda';

/**
 * A resposta que devolve enquanto a lógica de negócio de uma rota não está
 * escrita.
 *
 * Existe como função, e não como `throw new Error('TODO')`, por uma razão
 * concreta: um `throw` sem tratamento no Next dá um 500 com um digest opaco, e
 * o browser mostra "Erro 500" ao utilizador. Aqui a falha é visível e
 * identificável, e o `501` diz ao programador o que aconteceu — sem o utilizador
 * final ver texto de programador.
 *
 * E o ponto principal: falha **fechado**. O que estas rotas devolvem são dinheiro
 * e acesso a conteúdo pago. Um esboço que devolvesse `{ status: 'paid' }` para o
 * browser aparentemente funcionar seria a pior coisa possível: o
 * `paypal-capture` mentiria sobre um pagamento, e o `refreshMe` logo a seguir
 * trataria isso como compra confirmada e abriria o conteúdo. Nenhuma destas
 * rotas devolve um valor inventado enquanto não souber o valor verdadeiro.
 */
export function porImplementar(nome: string, contrato: string): Response {
  console.error(
    `[api/${nome}] lógica de negócio por implementar. ` +
      'A implementação original vive nas edge functions do Supabase, que não estão neste repositório.',
  );
  return erro(
    `A rota /api/${nome} ainda não tem a lógica de negócio implementada neste repositório. ` +
      `Contrato que o browser espera: ${contrato}`,
    501,
  );
}
