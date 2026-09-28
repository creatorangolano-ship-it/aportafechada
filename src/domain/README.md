# Domínio

Regras de negócio da plataforma, em TypeScript puro.

**Regra da camada:** nada aqui importa Supabase, `document`, `window`, `localStorage`
nem código de `src/application`, `src/infrastructure` ou `src/lib`. Só outros ficheiros
de `src/domain`, sempre com a extensão `.ts` no import (é isso que deixa os testes
correrem com `node --test`, sem compilador). `npm run check:arch` falha se isto for
quebrado.

| Contexto | O que decide |
|---|---|
| `shared/money.ts` | valores em kwanzas escolhidos pelo utilizador, conversão para USD |
| `identity/role.ts` | papéis e a matriz de permissões (quem pode fazer o quê) |
| `platform/settings.ts` | definições da plataforma: limites, validação, parte do criador |
| `commerce/purchase.ts` | o que pode ser comprado, a que preço, por que método |
| `backoffice/*.ts` | verificações (KYC), denúncias, levantamentos e filas de trabalho |

Os testes estão ao lado de cada ficheiro (`*.test.ts`): `npm test`.
