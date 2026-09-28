# À Porta Fechada

Plataforma angolana de subscrições para criadores. HTML, CSS e JavaScript com módulos ES
nativos, servidos pela Netlify. Sem framework, sem empacotador, sem passo de build. Os
dados vivem no Supabase; a SPA desenha e envia pedidos, não decide nada.

## Correr localmente

```bash
node serve.mjs 8888
```

Abre http://localhost:8888. O `serve.mjs` replica os headers do `netlify.toml`, por isso
`no-store` local e o que está em produção revalidam do mesmo modo.

Precisas de um servidor estático porque o site usa módulos ES: abrir o `index.html` por
`file://` falha nos imports. O `serve.mjs` só usa o que vem com o Node, sem dependências.

## Verificar antes de publicar

```bash
node check-imports.mjs      # 273 imports contra os exports reais
node --check js/main.js     # e o mesmo para cada .js
```

O `check-imports.mjs` percorre todos os `import` do projecto e confirma que cada nome
importado existe mesmo no módulo de destino. Apanha o tipo de erro que o browser só
descobre em runtime: importar um nome que foi renomeado, ou retirar um `export` que
outro ficheiro ainda usa.

Depois, no browser, com a consola aberta: `#inicio`, `#registar`, as páginas públicas e
`#top` têm de renderizar sem erros.

## Publicar

Netlify lê o `netlify.toml` e publica a raiz do repositório tal como está. Não há build.

**O contrato de cache é `max-age=0, must-revalidate`, e é o que faz as alterações chegarem
a quem já visitou o site.** Só `app.css` e `js/main.js` estão versionados à mão em
`index.html` (`?v=`); os outros 11 módulos são importados sem query string e chegam por
outra via. Se um dia mudares isto para `immutable`, tens de passar a versionar todos os
ficheiros, ou os utilizadores que voltarem ficam com código velho sem dar por isso.

Bump de `?v=` só é preciso para `app.css` e `js/main.js`. Mas se tocares num sub-módulo
e o behavior não mudar no teu browser, é cache: hard reload, e confirma o header.

## Segurança

O que está no repositório é o frontend. A segurança real está nas políticas RLS, nas
funções `SECURITY DEFINER` e nas políticas de storage do Supabase — que até September de
2026 não estavam versionadas em lado nenhum.

- **`supabase/AUDITORIA.md`** — o que foi verificado a 28/09/2026 com a anon key, o que
  está correcto, e as três lacunas encontradas. Começa por aqui.
- **`supabase/migrations/`** — o diagnóstico (só lê, corre primeiro) e as correcções.
- **`supabase/README.md`** — o inventário do backend e porque é que o absence dele é o
  risco mais caro do projecto.

## Estrutura

```
index.html          entrada; arranca o tema e carrega main.js
app.css             estilos
js/config.js        URL do Supabase, anon key, listas (países, categorias, bancos)
js/lib.js           ajudantes: escape, datas, dinheiro, upload, safeHref, assertImage
js/state.js         estado global, sessão, definições, contagens
js/pay.js           preços e pagamento — relê o preço na base de dados antes de cobrar
js/main.js          rotas, despachante global de acções, realtime
js/views/*.js       um ficheiro por área: feed,Criador, estúdio, mensagens, admin, públicas
supabase/           auditoria e migrações SQL (ver acima)
serve.mjs           servidor estático para desenvolvimento
check-imports.mjs   verificador de imports
```

## Notas

- A `anon` key do Supabase é pública por desenho e vive no `js/config.js`. Isso é
  correcto: a segurança está nas políticas RLS. A `service_role` **nunca** vai para o Git,
  e o `.gitignore` cobre `.env*` por causa disso.
- `js/pay.js` ignora o `amount` que o browser lhe manda e relê o preço na tabela. Isto
  remove o HTML do caminho de confiança, mas **não substitui** o servidor a recalcular:
  um `curl` não passa pelo frontend. Ver `supabase/migrations/0004_precos.sql`.
