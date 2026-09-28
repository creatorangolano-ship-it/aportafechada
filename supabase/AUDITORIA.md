# Auditoria de segurança — 28 de Setembro de 2026

Feita **sem acesso ao painel**: usei a `anon` key, que é pública por desenho e está no
`js/config.js`. A RLS é a fronteira, e a RLS responde a quem lhe perguntas. Todos os testes
abaixo são de leitura ou não-mudam nada.

## Resumo

A RLS está Unexpectedamente bem feita. As 24 tabelas estão trancadas para o anónimo, os
buckets com conteúdo pago e documentos de identidade são privados, e as funções de dinheiro
rejeitam quem não tem sessão. **Não encontrei nenhuma vulnerabilidade explorável sem conta.**

O que encontrei são **três lacunas** e **uma ausência de protection** que precisam de decisão
tua, e que estão listadas abaixo com a evidência exacta.

## O que está correcto (verificado)

### Tabelas

| Teste | Resultado |
|---|---|
| Leitura anónima | 22 de 24 tabelas devolvem 0 linhas. Só `promos` e `settings` são legíveis — ambas por desenho (banner do site, tabela de configuração). |
| Inserção anónima | **0 de 24** permitem INSERT. A role `anon` não tem sequer a permissão. |
| Escrita em `settings` | **Bloqueada.** Provado sem alterar valores: `PATCH` com o valor idêntico e `Prefer: return=representation` devolve `[]` — a RLS filtra a linha, não a deixa passar. Isto importa: `settings` contém `fee_pct`, `usd_rate`, `min_payout`, `min_price`, `affiliate_pct`. Quem escrevesse ali controlava o dinheiro. |

Nota de método: um `HTTP 204` num `PATCH` **não** prova nada — é indistinguível de "a RLS
filtrou a linha e não afectou nenhuma". O discriminador é o `return=representation`, que
devolve a linha apenas se a escrita a tocou. Foi com isso que a conclusão em cima saiu.

### Buckets

| Bucket | Visibilidade | Conteúdo | Correto? |
|---|---|---|---|
| `avatars` | **público** | Fotos de perfil | sim |
| `previews` | **público** | Miniaturas de publicações | sim |
| `promos` | **público** | HTML das promoções do site | sim |
| `content` | **privado** | Corpo das publicações pagas | sim |
| `messages` | **privado** | Anexos de mensagens privadas | sim |
| `kyc` | **privado** | Documentos de identidade | sim |

Este é o melhor resultado da auditoria. Conteúdo pago, conversas privadas e documentos de
identidade **não** são servidos publicamente. Mesmo que alguém saiba o caminho do ficheiro,
o bucket recusa. E os caminhos são derivados de `uuid` pelo `safeName()`, portanto não são
adivinháveis.

### Edge functions

Todas rejeitam o anónimo com `401 "A tua sessão expirou."`:

`create-order` · `paypal-capture` · `live-token` · `delete-account`

Isto significa que `verify_jwt` está desligado mas **cada função faz a verificação por conta
própria**. Funciona, mas depende de haver aí a linha certa — e se alguém criar uma função nova
sem a copiar, nasce uma porta aberta sem ninguém dar por isso. Ver correcção 3.

`login-handle` é a única acessível ao anónimo, e tem de ser: é a entrada por nome de
utilizador. Devolve `400 "Nome de utilizador ou palavra-passe incorretos."` — genérico, igual
para handle inexistente e para senha errada, logo não enumera utilizadores. Correto.

### Funções de servidor (RPC)

**8 de 10** levantam `Sem permissão.` para o anónimo — a verificação de papel está implementada
e a funcionar:

`admin_stats` · `admin_stats_staff` · `admin_thread_messages` · `admin_set_role` ·
`admin_set_payout` · `admin_set_creator_status` · `admin_review_kyc` · `admin_resolve_report`

As de dinheiro também exigem sessão válida (`"Sessão expirada."`): `pay_with_wallet` ·
`request_payout` · `open_thread` · `appeal_kyc`.

### `promos` — legível pelo anónimo, e é por desenho

Única tabela pública com conteúdo. Inspecionei a linha que lá está: dados de teste
(`title` = "ttttttttttttt"), um link do YouTube e uma imagem do bucket público `promos`.
Nada sensível. As 15 colunas são as esperadas.

Três coisas a registar:

- **`html` e `mobile_html` são campos de HTML cru** que se injectam no site inteiro. Um admin
  escreve lá e toda a gente vê. É a superfície de maior privilégio do projecto: quem escreve
  controla o que aparece a cada visitante. O frontend já exige `guard('admin')` e valida o
  esquema do link, mas **o backend tem de exigir o papel de admin** — é o mesmo problema da
  lacuna 1, e resolve-se da mesma maneira.
- **`created_by` está a `null`.** A tabela tem a coluna, mas a promoção de teste não tem autor
  registado. Uma promoção é HTML publicado em nome de toda a gente, e ninguém fica registado
  como autor. Vale a pena garantir que o INSERT preenche `created_by` com `auth.uid()`.
- **Lixo de teste em produção:** `title` = "ttttttttttttt", `sort_order` = 4444, e está
  `active`. Sai da frente de quem vá ao site. Não mexi — é conteúdo teu.

## As três lacunas

### 1. `admin_users` e `admin_threads` não seguem o padrão das outras oito

Chamadas como anónimo com `{}`:

```
admin_users    -> 200 []     (as outras oito: "Sem permissão.")
admin_threads  -> 200 []
```

Não levantam erro de permissão, devolvem lista vazia. Duas leituras possíveis, e **não consigo
distingui-las sem uma sessão**:

- **Seguras** — a função filtra por `auth.uid()`, logo um fã recebe a sua própria linha (ou
  nenhuma) e nunca a lista de todos.
- **Vulneráveis** — a função tem apenas `SECURITY DEFINER` e devolve a tabela toda, e quem a
chamar não precisar de ser staff.

A distinção é grande. `admin_users` devolve **email, papel, saldo e ganhos de todas as contas**.
`admin_threads` devolve o **índice de conversas privadas** — quem fala com quem.

Repara no detalhe: `admin_thread_messages`, que lê o *conteúdo* das mensagens, **tem** verificação.
`admin_threads`, que só dá o *índice*, **não dá**. Está ao contrário do que a cautious exige.

Isto é o que tens de confirmar primeiro. Para isso, `0002_verificacao.sql` dá-te a resposta
definitiva numa colagem.

### 2. `login-handle` não tem limite de tentativas

Seis tentativas seguidas, resposta idêntica, sem contador, sem bloqueio, sem atraso:

```
1..6 -> HTTP 400  "Nome de utilizador ou palavra-passe incorretos."
```

O login por email do Supabase tem rate limit próprio. **Este caminho não passa por ele** — é
código teu, numa edge function à parte, e por isso não herda a protecção. Com um endpoint de
`handle + senha` sem throttling, um atacante faz milhares de tentativas por hora a partir de
uma lista de emails ou handles plausíveis. Correção em `0003_rate_limit.sql`.

### 3. `mark_thread_read` não exige sessão

Respondeu `204` ao anónimo, sem `"Sessão expirada."` — as irmãs `open_thread` e
`pay_with_wallet` recusam. Provavelmente marca zero linhas porque usa `auth.uid()` (que é `null`
no anónimo), e nesse caso o impacto é nulo. Mas é uma função que escreve em dados de outro,
a responder a quem não tem conta, e isso não devia depender de um detalhe interno. Convém
confirmar que filtra por `auth.uid()` e, se não, acrescentar a mesma guarda das restantes.

## O que continua por verificar (precisa de uma conta)

Isto **não** é auditável sem sessão. Não é defeito conhecido — é o que não sei.

| # | Pergunta | Como responder |
|---|---|---|
| 1 | Um fã consegue chamar `admin_users`? | `0002_verificacao.sql` |
| 2 | `create-order` e `pay_with_wallet` **recalculam** o preço, ou aceitam o `amount` do browser? | Abrir a definição das duas. Ver abaixo. |
| 3 | A RLS de `post_bodies` e do bucket `content` exige `purchases.status = 'paid'`? | Abrir as políticas |
| 4 | `wallet_balance` e `earnings_balance` são escrevíveis directamente, ou só dentro das funções? | Abrir as políticas |
| 5 | O backend distingue moderator de admin nos levantamentos e nas promoções? | `0001b_verificacao_papeis.sql` |
| 6 | A fuga de câmara/microfone nas lives está resolvida? | Precisa de uma live a sério |

### Sobre a pergunta 2, que é a que mais pesa

`js/pay.js` agora relê o preço na base de dados antes de abrir o pagamento, e `data-price`
deixou de existir. **Isto não é a fronteira.** Se `create-order` continuar a usar o `amount`
que o browser lhe manda, um `curl` burla o frontend inteiro e o valor pago pelo comprador passa
a ser o que o atacante disser.

O mesmo para `pay_with_wallet`. Uma carteira tem de ser debitada por uma função que calcula o
preço a partir da linha da tabela, nunca a partir de um número que veio de fora.

## Moderador vs admin: as guardas do cliente não chegam

Pergunta levantada a 28/09: *um moderador não devia poder banir directamente; falta validação
do admin.* Verifiquei o frontend e **o frontend está correcto**, em duas camadas:

| Camada | Onde | O que faz |
|---|---|---|
| Render | `admin.ts:71` | Um moderador vê «só o admin suspende» em vez do botão. O botão de banir nem é desenhado. |
| Handler | `admin.ts:149` | `guard('admin')` volta a verificar antes de executar. |

**E é precisamente aqui que está o problema.** O comentário no próprio código (`admin.ts:147`)
é honesto sobre o limite disto:

> RLS é a fronteira real; isto garante que um handler nunca executa por um clique sintético
> (o dispatcher de main.js é global e não verifica rota nem papel).

(o comentário no código ainda diz `main.js`; depois da migração o ficheiro chama-se
`src/lib/main.ts`. A frase não mudou de sentido.)

Ou seja: as guardas do cliente servem para o botão **não aparecer**. Não servem para o botão
ser **impossível**. Um moderador com o DevTools aberto escreve na consola:

```js
sb.rpc('admin_resolve_report', { p_report: 42, p_remove: true })   // bane um perfil
sb.rpc('admin_set_creator_status', { p_creator: 7, p_status: 'suspended' })
sb.rpc('admin_set_payout', { p_payout: 3, p_status: 'paid' })      // dinheiro real
sb.rpc('admin_set_role', { p_user: 9, p_role: 'admin' })           // escalação de privilégio
```

Ou, para as três tabelas que o painel escreve sem RPC pelo meio, um `fetch` directo:
`promos` (HTML injectado no site inteiro), `settings` (`fee_pct`, `usd_rate`, `min_payout` —
quem escreve ali controla o dinheiro de toda a gente) e `contact_messages`.

### Porque a auditoria anterior não respondeu

Provei que o **anónimo** é rejeitado. Isso não diz nada sobre o moderador: o anónimo falha
porque `auth.uid()` é null, e o moderador tem `auth.uid()`. São dois ramos de código
diferentes dentro da mesma função. Uma função cuja guarda é `auth.uid() is not null` barra o
anónimo e deixa passar o moderador — que é precisamente o caso perigoso, porque o moderador
*é* staff e passa num `is_staff()` sem reparar que devia ser `is_admin()`.

Por isso a pergunta 5 da tabela acima só se responde com `0001b_verificacao_papeis.sql`, que
classifica cada função como **«OK, só admin»** ou **«MODERADOR PASSA»**.

### O que já está preparado para a correcção

`0003_guardas.sql` cria `is_admin()`, `assert_admin()` e as políticas de tabela correctas — as
linhas 143–183 são SQL executável e usam `is_admin()` para tudo o que mexe em dinheiro, papéis,
mensagens privadas e promoções. **Mas isso não foi aplicado.**

E a parte decisiva: a secção 3 do `0003`, que é a que reescreve as *funções*, é um **template
vazio** com marcadores de posição — aqui vai literal, tal como está no ficheiro:

```
-- NÃO corras o bloco seguinte sem ter lido o corpo actual em 0002. Precisas
-- da assinatura exacta, que o 0002 imprime na coluna `argumentos`.
```

(A referência a «0002» no interior do `0003` é nomeação antiga e já desactualizada: o
diagnóstico da assinatura chama-se hoje `0001_verificacao.sql`, e o `0001b` imprime-a também.)

As policies de tabela estão escritas; **os corpos de `admin_set_payout`,
`admin_set_creator_status`, `admin_resolve_report` e `admin_set_role` não**.

São eles — e não as tabelas — o caminho pelo qual um moderador chega a banir alguém e mexer no
dinheiro, por uma razão técnica que vale a pena fixar: uma função `SECURITY DEFINER` corre com
os privilégios do dono e **as políticas de RLS não se lhe aplicam**. Ou seja, dentro dessas
funções não há rede nenhuma. A RLS protege as tabelas contra quem escreve nelas directamente;
não protege quem chama a função. A **única** coisa entre um moderador e um ban é a comparação
de papel escrita à mão dentro do corpo da função — exactamente o que o `0003` ainda não preencheu.

É a diferença entre as duas camadas de guarda do frontend: naquele caso a política da tabela é
uma barreira real; neste caso a comparação no corpo é a barreira, e ninguém a reviu.

**Sequência:** correr `0001b` → leer os corpos marcados `MODERADOR PASSA` → preencher a secção 3
do `0003` com a assinatura que o `0001b` imprimir → correr o `0003` completo → reverificar com
`0001b` até dar `OK, só admin` em todas.

## Correcções a aplicar

| Ficheiro | O que resolve |
|---|---|
| `migrations/0001_verificacao.sql` | Diagnóstico. Só lê. Responde às perguntas 1, 2 e 5. **Corre primeiro, é inofensivo.** |
| `migrations/0001b_verificacao_papeis.sql` | Diagnóstico. Só lê. **A pergunta 5 por si só** — se um moderador consegue banir ou mexer no dinheiro. Ver "Moderador vs admin" acima. |
| `migrations/0002_rate_limit.sql` | Limita tentativas em `login-handle` (lacuna 2). |
| `migrations/0003_guardas.sql` | Adiciona `is_staff()`/`is_admin()` reutilizáveis e o modelo para fechar a lacuna 1. **As políticas de tabela estão prontas; a secção 3, a dos corpos das funções, é um template por preencher.** |
| `migrations/0004_precos.sql` | Obriga o servidor a recalcular o preço (pergunta 2). |

Corre pela ordem dos números. O 0001 primeiro, porque os restantes dependem do que ele te
mostrar. Cada ficheiro diz no topo o que tem de correr antes dele.

## O que estas migrações NÃO fazem

- **Não se aplicam sozinhas.** São SQL para colares no painel, não há pipeline de migração
  configurado. O `0001` podes correr já, porque só lê.
- **Não mexem nas edge functions.** `create-order`, `paypal-capture`, `login-handle` e
  `live-token` são código teu que não está no Git. Onde a correcção é dentro delas, o
  ficheiro termina com o código exacto a colar, porque não as posso editar daqui.
- **Não substituem uma revisão de RLS linha a linha.** Isto cobre o que a auditoria com a
  anon key conseguiu apanhar. As políticas de `purchases`, `post_bodies` e do bucket
  `content` — a porta de acesso ao conteúdo pago — precisam de ser lidas por alguém.

## Duas coisas que isto não resolve e devia

**O backend continua fora do Git.** Estes quatro ficheiros são o primeiro passo, mas um
conjunto de SQL solto ao lado do frontend não é o mesmo que ter migrações aplicadas por
comando. Configura `supabase db push` e passa a aplicar tudo como migração, para que
produção e Git não possam divergir outra vez.

**Sem ambiente de testes, isto continua arriscado.** A correcção mais segura numa base de
dados é testá-la noutro sítio primeiro. Provisiona um projecto Supabase de desenvolvimento,
aplica lá estas migrações, e só depois em produção.
