-- Revisão de segurança de 16/11/2026, 2.ª parte. Correr só depois de o site já usar
-- meu_perfil() e admin_nascimentos() (0026).
--
-- Qualquer pessoa com sessão lia, de TODOS os perfis, a data de nascimento, o saldo da
-- carteira, os ganhos, quem a convidou e a preferência de emails. Agora a API só mostra
-- as colunas públicas; cada pessoa lê os próprios dados com meu_perfil().
--
-- Atenção: uma coluna nova em `profiles` fica escondida até ser acrescentada à lista abaixo.

revoke select on public.profiles from anon, authenticated;
grant select (id, handle, name, avatar_url, country, interests, role, onboarded,
              created_at, is_owner, banned_at, banned_until, follower_count)
  on public.profiles to anon, authenticated;
