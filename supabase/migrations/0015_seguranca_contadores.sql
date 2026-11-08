-- Testes de segurança de 2026-11-08: correcções.
--
-- 1) Contadores das publicações (gostos, comentários, visualizações): o criador podia
--    alterá-los directamente na sua própria publicação (a política posts_update deixa-o
--    editar a linha) e assim inflar os números. Agora, quando o pedido vem de um
--    utilizador (roles anon/authenticated), os contadores ficam como estavam (ou a zero,
--    ao criar). Só as funções internas (security definer) os mudam.
-- 2) bump_comment é uma função de gatilho: ninguém a deve chamar pela API.

create or replace function public.posts_proteger_contadores()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.like_count := 0; new.comment_count := 0; new.view_count := 0;
    else
      new.like_count := old.like_count; new.comment_count := old.comment_count; new.view_count := old.view_count;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists posts_contadores on public.posts;
create trigger posts_contadores before insert or update on public.posts
  for each row execute function public.posts_proteger_contadores();

revoke all on function public.posts_proteger_contadores() from public, anon, authenticated;
revoke all on function public.bump_comment() from public, anon, authenticated;
