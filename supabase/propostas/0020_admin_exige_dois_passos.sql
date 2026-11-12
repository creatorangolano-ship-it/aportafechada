-- PROPOSTA (não aplicada): os poderes de administração e moderação só valem numa
-- sessão com a verificação em dois passos feita (aal2).
--
-- Porquê: o site já bloqueia a consola sem o código da app de autenticação, mas isso é
-- só no ecrã. Quem roubasse a palavra-passe de um administrador podia chamar as funções
-- de administração diretamente. Com isto, a base de dados recusa-as sem o segundo passo.
--
-- Antes de aplicar: cada administrador e moderador tem de ATIVAR a verificação em dois
-- passos em Conta › Segurança. Sem ela, deixam de ter poderes de administração (a conta
-- continua a funcionar como conta normal; basta ativar e voltar a entrar).

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'moderator'))
$$;

-- Nota: o aviso do Supabase sugere tirar estas funções ao «anon», mas as regras de
-- acesso (RLS) chamam-nas também para visitantes sem sessão; tirá-las partia a leitura
-- pública. Para um visitante devolvem sempre false, por isso ficam como estão.
