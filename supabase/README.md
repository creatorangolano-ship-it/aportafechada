# Backend do Supabase

**Esta pasta está vazia de propósito, e é o problema mais caro do projecto.**

Todo o dinheiro e toda a segurança do A Porta Fechada vivem no backend do Supabase —
políticas RLS, funções `SECURITY DEFINER`, gatilhos, e as políticas de storage. Esse código
existe apenas no painel do Supabase, **não está no Git**. O que tens aqui é uma SPA estática
que desenha e envia pedidos; ela não decide nada.

## Porque isto é um risco de negócio, não só de segurança

- **Perda de acesso = perda do projecto.** Se a conta do Supabase for bloqueada, o valor
  expirar, ou alguém sair da organização, o código do servidor vai com ela. O frontend
  no Git não é recuperável. Não tens forma de auditar o que está a correr em produção.
- **Não há revisão.** Ninguém — incluindo tu daqui a seis meses — consegue confirmar que a
  política que protege o dinheiro é a que pensas que está lá.
- **Não há ambiente de testes.** Não se pode testar uma alteração às políticas sem mexer em
  produção.
- **Nada disto se vê em auditoria de segurança**, e é o que um investidor ou parceiro
  perguntaria primeiro.

## Objectivo

Versionar aqui, em migrations SQL numeradas, exactamente o que corre em produção:

```
supabase/
  migrations/
    0001_verificacao.sql   diagnóstico; só lê (28/09/2026)
    0002_rate_limit.sql    limita tentativas em login-handle
    0003_guardas.sql       is_staff()/is_admin() e as guardas das funções admin
    0004_precos.sql        obriga o servidor a recalcular o preço
    0005_esquema.sql       o teu esquema real, exportado
    0006_politicas.sql     as políticas RLS por tabela
    0007_storage.sql       as políticas dos 6 buckets
    0008_gatilhos.sql      updated_at, contadores, notificações
  seed.sql                 dados mínimos para desenvolvimento
  AUDITORIA.md             o que foi verificado a 28/09/2026, e o que falta
  README.md                este ficheiro
```

Os primeiros quatro já estão escritos — são o resultado de uma auditoria feita com a anon
key, sem acesso ao teu painel. Começa por ler o `AUDITORIA.md`.

Não inventes o SQL aqui para "ver se funciona": a fonte da verdade é o que está em produção.
Exporta primeiro (Painel do Supabase → SQL Editor → ou `supabase db dump`), e depois passa
a alterar **aqui** e aplicas com `supabase db push`.

## Inventário

Extraído do código do frontend — cada item abaixo é chamado por algum `sb.rpc()`, `fn()` ou
`sb.from()` em `js/`. Se algum desaparecer do código, remove-se daqui.

### Funções RPC (24)

| Grupo | Funções |
|---|---|
| **Dinheiro** | `pay_with_wallet`, `request_payout`, `admin_set_payout` |
| **Pagamentos** | `create-order` (edge), `paypal-capture` (edge) |
| **Conta** | `complete_profile`, `submit_creator_application`, `appeal_kyc`, `set_auto_renew`, `set_payout_info` |
| **Mensagens** | `open_thread`, `mark_thread_read` |
| **Admin** | `admin_set_role`, `admin_set_creator_status`, `admin_resolve_report`, `admin_review_kyc`, `admin_stats`, `admin_stats_staff`, `admin_users`, `admin_threads`, `admin_thread_messages` |
| **Estatísticas** | `affiliate_stats`, `creator_stats`, `my_subscribers`, `top_creators` |
| **Outros** | `login-handle` (edge), `live-token` (edge), `delete-account` (edge) |

### Edge functions (5)

`create-order`, `paypal-capture`, `live-token`, `login-handle`, `delete-account`

### Tabelas (25)

`profiles` `creators` `posts` `post_bodies` `post_likes` `saves` `media`(?) `threads`
`messages` `purchases` `orders` `wallet_tx` `subscriptions` `follows` `payouts` `payout_info`
`lives` `live_chat` `live_reminders` `reports` `kyc_requests` `notifications` `contact_messages`
`promos` `settings`

### Buckets (6)

`avatars` (público) · `content` · `messages` · `previews` · `kyc` · `promos`

## Requisitos que cada uma tem de cumprir

Isto é o que o frontend **não** consegue garantir. Cada ponto abaixo é um bug se o backend o
ignorar, porque o `js/` já foi revisto e não depende disto.

### 1. O preço é recalculado no servidor — nunca recebido do cliente

`create-order` e `pay_with_wallet` recebem hoje um valor `amount` enviado pelo browser.
**Um `curl` direto burla o frontend inteiro.** O servidor tem de ignorar esse valor e
recalcular a partir da linha da base de dados:

| `kind` | Tabela | Coluna |
|---|---|---|
| `subscription` | `creators` | `price` (e `status = 'approved'`) |
| `post` | `posts` | `price` (e `status = 'published'`) |
| `message` | `messages` | `ppv_price` |
| `ticket` | `lives` | `price` (e `status <> 'ended'`) |
| `tip` | — | validar `>= settings.min_tip` |
| `topup` | — | validar `>= settings.min_topup` |

`js/pay.js` agora relê o preço na base de dados antes de abrir o pagamento, o que elimina o
`data-price` do HTML como fonte — mas isso é defesa em profundidade, **não** a fronteira.

### 2. Uma compra só dá acesso depois de estar paga

`purchases` tem de ter `status`, e as consultas de acesso (`post_bodies`, `messages`,
ficheiros de `content`) têm de filtrar `.eq('status', 'paid')`. O frontend já o faz
(`js/views/messages.js`, `js/views/lives.js`, `js/views/fan.js`), mas **a RLS do
`post_bodies` e do bucket `content` também tem de o fazer** — senão um utilizador lê o
conteúdo pago por um pedido direto ao PostgREST, sem passar pela app.

### 3. O saldo só muda dentro de uma função

`wallet_balance` e `earnings_balance` não podem ser escrevíveis pelo utilizador: só dentro de
`pay_with_wallet` e `request_payout`, com `SECURITY DEFINER` e `search_path` fixo. Debitar
o saldo com um `UPDATE` direto do browser é o ataque mais óbvio contra uma carteira.

### 4. Escalão de permissões: moderator ≠ admin

O frontend já esconde as abas e bloqueia os handlers (`guard()` em `js/views/admin.js`).
O backend é que tem de decidir. Regras que o painel assume:

| | moderator | admin |
|---|---|---|
| Verificações KYC, denúncias, mensagens de contacto | sim | sim |
| Esconder publicação / mensagem / live | sim | sim |
| **Suspender perfil** | **não** | sim |
| **Levantamentos** (dinheiro real) | **não** | sim |
| **Mensagens privadas de outros** | **não** | sim |
| **Promoções** (HTML em todo o site) | **não** | sim |
| **Definições** (taxas, câmbio) | **não** | sim |
| **Mudar papéis** | **não** | sim |

`admin_set_payout` é a mais crítica: `status = 'paid'` é a confirmação de que a transferência
bancária foi feita, e não há como desfazer.

### 5. `settings` é só de leitura para toda a gente

Só `admin` escreve. Hoje qualquer conta autenticada com permissão de `UPDATE` mexe nas taxas
e no câmbio. Uma tabela de definições é uma alavanca de dinheiro: quem a escreve controla o
que os criadores recebem e o que os compradores pagam.

### 6. Prazos de referência e webhooks

`create-order` tem de ter expiração real (o frontend mostra "válida até", mas quem expira é
a base de dados) e o `paypal-capture` tem de ser **idempotente** — o utilizador pode
recarregar a página três vezes enquanto o PayPal responde.

## Como verificar que está tudo

```sql
-- 1. Uma tabela sem policies é tabela aberta para toda a gente. Não pode haver nenhuma.
select tablename, count(*) as policies
from pg_tables t
left join pg_policies p on p.tablename = t.tablename and p.schemaname = t.schemaname
where t.schemaname = 'public' and t.tablename not in ('settings')
group by 1 having count(*) = 0;

-- 2. Uma função que não fixa search_path pode ser sequestrada.
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and prosecdef and (proconfig is null or not exists (
  select 1 from unnest(proconfig) c where c like 'search\_path=%'));

-- 3. A anon key não pode escrever em nada que mexa com dinheiro.
```

Corrige também, no painel: **Authentication → Providers → Email → Confirm email** está ligado
(o que é correcto), mas confirma que a **rate limit** de email é a que queres: 3 tentativas por
hora em produção pode ser Vendor, num país onde a entrega de email é lenta.

## Detalhe descoberto a testar

O registo exige confirmação por email com código de 6 dígitos (`verifyOtp` em
`js/views/public.js:379`). Isso é seguro, mas significa que **qualquer teste de fluxo
autenticado precisa de acesso ao inbox**. Para testes automatizados, cria os utilizadores
com `email_confirm: true` pela Admin API em vez de passares pelo formulário.
