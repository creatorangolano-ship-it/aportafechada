@AGENTS.md

# Como trabalhar neste projecto (válido em qualquer computador)

- **Idioma:** responder sempre em português (grafia europeia, como o projecto), também nas mensagens curtas entre passos. O dono do projecto não fala inglês.
- **Publicação:** o site https://aportafechada.net é publicado pela Vercel a cada push para `main` no GitHub (`creatorangolano-ship-it/aportafechada`). No fim de cada trabalho verificado (`npm run verify` a passar), fazer commit e push para `main` sem perguntar e confirmar que o deploy ficou pronto.
  - Excepções: quando o dono pede para ver primeiro («mostra antes de implementar», «valida localmente», «não publiques»), trabalhar num ramo local, sem push nem alterações à base de dados de produção (migrações propostas ficam em `supabase/propostas/`).
- **Começar a trabalhar noutro computador:** `git pull` antes de mexer em nada; o GitHub é a fonte da verdade. O `.env.local` não está no git: as duas variáveis (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) estão na Vercel (`vercel env pull .env.local`) e são públicas por desenho.
- **Vercel CLI:** só comandos de leitura (`ls`, `inspect`); nada que altere o projecto sem o dono pedir.
- **Segurança:** não introduzir palavras-passe pelo dono (ele inicia sessão sozinho). Alterações à base de dados de produção (Supabase `xkcngjrlfmozlsttuxgs`) só com o dono a pedir; testes de SQL em transacções desfeitas.
- **Conteúdo honesto:** nunca números, criadores, avaliações ou estatísticas inventados no site.
- **Mudanças visuais:** quando o dono pede para ver antes, mostrar localmente primeiro e só aplicar depois da aprovação.
