# À Porta Fechada

Plataforma angolana de subscrições para criadores. Next.js + TypeScript, alojado na Vercel.
Os dados vivem no Supabase; a SPA desenha e envia pedidos, não decide nada.

## Correr localmente

```bash
npm install
npm run dev
```

Abre http://localhost:8888.

## Verificar antes de publicar

```bash
npm run verify      # tsc --noEmit + next build
```

Depois, no browser, com a consola aberta: `#inicio`, `#registar`, as páginas públicas e
`#top` têm de renderizar sem erros.

## Publicar (Vercel)

A Vercel detecta o Next e constrói com `npm run build` a cada push para `main`. Não há
`vercel.json`: os cabeçalhos de segurança estão no `headers()` de `next.config.mjs`.

Variáveis de ambiente (Vercel → Project → Settings → Environment Variables):

| Variável | Onde se usa |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | API routes (`src/lib/server/guarda.ts`). **Nunca** com prefixo `NEXT_PUBLIC_`. |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `/api/live-token` |
| `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` | `/api/create-order`, `/api/paypal-capture` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | opcionais; o default está em `src/lib/config.ts` |

### Funções do servidor: edge functions vs `/api`

As rotas em `src/app/api/` ainda não têm a lógica de negócio (respondem 501). Até lá, o
`fn()` em `src/lib/lib.ts` continua a chamar as edge functions do Supabase, que são as que
funcionam em produção. Quando uma rota estiver implementada e testada, acrescenta o nome
dela a `ROTAS_PRONTAS` nesse ficheiro.

## Segurança

O que está no repositório é o frontend e as API routes. A segurança real está nas políticas
RLS, nas funções `SECURITY DEFINER` e nas políticas de storage do Supabase.

- **`supabase/AUDITORIA.md`** — o que foi verificado a 28/09/2026 com a anon key, o que
  está correcto, e as lacunas encontradas. Começa por aqui.
- **`supabase/migrations/`** — os diagnósticos (só lêem, correm primeiro) e as correcções.
- **`supabase/README.md`** — o inventário do backend.

## Estrutura

```
src/app/layout.tsx     HTML base, tema, contentores (#hdr, #app, #modalRoot…)
src/app/page.tsx       arranca o roteador (lib/main.ts) no browser
src/app/api/*/route.ts funções do servidor (ver acima)
src/lib/config.ts      URL do Supabase, anon key, listas (países, categorias, bancos)
src/lib/lib.ts         ajudantes: escape, datas, dinheiro, upload, fn(), safeHref
src/lib/state.ts       estado global, sessão, definições, contagens
src/lib/pay.ts         preços e pagamento — relê o preço na base de dados antes de cobrar
src/lib/main.ts        rotas, despachante global de acções, realtime
src/lib/views/*.ts     um ficheiro por área: feed, criador, estúdio, mensagens, admin, públicas
src/lib/server/        código só de servidor (service_role)
public/                imagens e manifest
supabase/              auditoria e migrações SQL
```

Os ficheiros `index.html`, `app.css`, `js/`, `img/`, `serve.mjs` e `check-imports.mjs` são
a versão antiga (sem build). O `scripts/port-views.mjs` ainda lê `js/views/`; podem ser
apagados quando a conversão estiver fechada.

## Notas

- A `anon` key do Supabase é pública por desenho. A `service_role` **nunca** vai para o Git,
  e o `.gitignore` cobre `.env*` por causa disso.
- `pay.ts` ignora o `amount` que o browser lhe manda e relê o preço na tabela. Isto não
  substitui o servidor a recalcular: um `curl` não passa pelo frontend. Ver
  `supabase/migrations/0004_precos.sql`.
