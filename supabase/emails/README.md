# Emails de autenticação

Modelos em português, com a marca, para o Supabase (Authentication → Emails → Templates).
Colar o HTML de cada ficheiro no modelo correspondente e mudar o assunto:

| Modelo no Supabase | Ficheiro | Assunto |
|---|---|---|
| Confirm signup | `confirmar-conta.html` | `{{ .Token }} é o teu código da A Porta Fechada` |
| Reset password | `recuperar-palavra-passe.html` | `Escolhe uma nova palavra-passe` |
| Change email address | `alterar-email.html` | `Confirma o teu novo email` |

O registo do site pede o código de 6 dígitos (`verifyOtp`), por isso o modelo de confirmação mostra
`{{ .Token }}` em grande e o link `{{ .ConfirmationURL }}` como alternativa. O logótipo vem de
`https://aportafechada.net/img/email-logo.png` (PNG, porque o Gmail não mostra SVG).

## Remetente próprio (SMTP)

Sem SMTP próprio, o Supabase envia de um endereço genérico e só aceita poucos emails por hora,
o que bloqueia registos num lançamento. Configuração (feita pelo dono, que guarda as chaves):

1. Criar conta no serviço de envio (ex.: Resend) e adicionar o domínio `aportafechada.net`.
2. Copiar os registos DNS que o serviço indicar (SPF/TXT, DKIM, MX de retorno) para a GoDaddy
   (o DNS do domínio está em `domaincontrol.com`) e esperar a verificação.
3. Criar uma chave de API e, no Supabase → Authentication → Emails → SMTP Settings, ligar
   «Enable custom SMTP» com:
   - Sender email: `nao-responder@aportafechada.net`
   - Sender name: `A Porta Fechada`
   - Host: `smtp.resend.com` · Port: `465` · Username: `resend` · Password: a chave de API
4. Em Authentication → Rate Limits, subir o limite de emails por hora (ex.: 100).
5. Testar: criar uma conta com um email próprio e pedir recuperação de palavra-passe.
