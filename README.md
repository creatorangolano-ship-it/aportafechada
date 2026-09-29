# A Porta Fechada

Plataforma angolana de subscrições para criadores. Next.js + TypeScript, alojado na Vercel.
Os dados vivem no Supabase; a SPA desenha e envia pedidos, não decide nada.

## Correr localmente

```bash
npm install
vercel env pull .env.local   # traz as variáveis de ambiente da Vercel
npm run dev
```

Abre http://localhost:8888.

## Verificar antes de publicar

```bash
npm run verify      # tipos + testes + regras da arquitetura + next build
npm test            # só os testes (domínio e casos de uso, com node --test)
npm run check:arch  # só as regras das camadas
```

Depois, no browser, com a consola aberta: `#inicio`, `#registar`, as páginas públicas e
`#top` têm de renderizar sem erros.

## Publicar (Vercel)

A Vercel constrói com `npm run build` a cada push para `main`. O `vercel.json` só fixa
`"framework": "nextjs"`: com o projecto como «Other», a Vercel publicava só a pasta `public/` e
a página inicial dava 404. Os cabeçalhos de segurança estão no `headers()` de `next.config.mjs`.

Variáveis de ambiente (Vercel → Project → Settings → Environment Variables):

| Variável | Onde se usa |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | API routes (`src/lib/server/guarda.ts`). **Nunca** com prefixo `NEXT_PUBLIC_`. |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | `/api/live-token` |
| `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` | `/api/create-order`, `/api/paypal-capture` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | obrigatórias; lidas em `src/lib/config.ts`. Na Vercel estão como tipo `config` (públicas). |

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

## Arquitetura

Camadas, com as dependências sempre a apontar para dentro (`npm run check:arch` falha se
alguém as inverter):

```
src/domain/          regras de negócio puras — sem Supabase, sem DOM, testáveis no Node
  shared/              dinheiro, erros de regra
  identity/            papéis e matriz de permissões
  platform/            definições (taxas, mínimos), promoções
  commerce/            o que se compra, a que preço, por que método
  backoffice/          verificações (KYC), denúncias, levantamentos (máquina de estados), filas
src/application/     casos de uso + portas (interfaces dos repositórios e gateways)
  backoffice/          fachada Backoffice: permissão → regra → repositório
  commerce/            Pagamentos: cotar, iniciar (Strategy por método), observar (Observer)
src/infrastructure/  adaptadores e composição
  supabase/            cliente, funções, armazenamento, repositórios, estratégias de pagamento
  composicao/          raízes de composição (Factory/Singleton) — o único sítio que liga tudo
  server/              código só de servidor das API routes (service_role)
src/lib/             interface: roteador, registo de comandos, vistas
  registry.ts          Command + Chain of Responsibility para data-act e formulários
  modulos.ts           cada área é um ficheiro JS carregado só quando é precisa
  views/*.ts           uma área por ficheiro
src/app/             Next: layout, página, API routes
```

**Padrões usados:** Command e Chain of Responsibility (comandos da interface), Facade
(`Backoffice`), Strategy (métodos de pagamento), Observer (estado dos pedidos), State
(ciclo de vida dos levantamentos), Adapter (repositórios Supabase), Factory/Singleton
(composição), Proxy de cache (definições com stale-while-revalidate).

**Estado da migração:** a administração e os pagamentos já passam pela camada de
aplicação. As outras áreas (fã, estúdio, mensagens, lives, conta, pública) ainda chamam o
Supabase directamente — `npm run check:arch` mostra quantas chamadas faltam em cada uma.
Migram-se da mesma forma: regras para `domain`, casos de uso e portas para `application`,
consultas para `infrastructure/supabase`, e a vista fica só com HTML.

## Performance

- Cada área da app é descarregada só quando é visitada; depois da primeira página, as
  áreas prováveis são pré-carregadas em segundo plano.
- O arranque não espera pelas definições (cache local) nem pelas contagens do cabeçalho.
- Tipo de letra alojado pelo site (next/font), `preconnect` ao Supabase, imagem principal
  em AVIF/WebP pré-carregada só para quem vai ver a página de entrada, imagens das listas
  com `loading="lazy"`.

Medido no servidor de produção local, página de entrada: LCP 472 ms → 164 ms.

## Notas

- A `anon` key do Supabase é pública por desenho. A `service_role` **nunca** vai para o Git,
  e o `.gitignore` cobre `.env*` por causa disso.
- `pay.ts` ignora o `amount` que o browser lhe manda e relê o preço na tabela. Isto não
  substitui o servidor a recalcular: um `curl` não passa pelo frontend. Ver
  `supabase/migrations/0004_precos.sql`.
- `index.html`, `app.css`, `js/`, `img/`, `serve.mjs` e `check-imports.mjs` são a versão
  antiga (sem build) e já não são publicados. O `scripts/port-views.mjs` ainda lê
  `js/views/`; podem ser apagados quando a migração estiver fechada.
