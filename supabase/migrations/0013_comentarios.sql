-- Comentários e visualizações nas publicações.
--
-- * Comentários: quem pode ver a publicação pode comentá-la, se o criador não os tiver
--   desligado (posts.comments_enabled). Apagam o próprio autor, o criador da publicação
--   e a administração. O criador é notificado.
-- * Visualizações: uma por pessoa e publicação, registadas só pela função
--   register_post_view (a tabela não aceita escrita directa), e só de quem pode ver.
--
-- Só acrescenta: colunas novas com valor por omissão, tabelas, funções e políticas novas.

alter table public.posts
  add column if not exists comments_enabled boolean not null default true,
  add column if not exists comment_count integer not null default 0,
  add column if not exists view_count integer not null default 0;

-- ---------- Comentários ----------
create table if not exists public.post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  created_at  timestamptz not null default now()
);
create index if not exists post_comments_post on public.post_comments (post_id, created_at);

alter table public.post_comments enable row level security;

create policy comments_read on public.post_comments for select to authenticated
  using (public.can_view_post(post_id));
create policy comments_insert on public.post_comments for insert to authenticated
  with check (user_id = auth.uid()
              and public.can_view_post(post_id)
              and exists (select 1 from posts p where p.id = post_id and p.comments_enabled));
create policy comments_delete on public.post_comments for delete to authenticated
  using (user_id = auth.uid()
         or public.is_admin()
         or exists (select 1 from posts p where p.id = post_id and p.creator_id = auth.uid()));

create or replace function public.bump_comment()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_creator uuid; v_nome text;
begin
  if tg_op = 'INSERT' then
    update posts set comment_count = comment_count + 1 where id = new.post_id returning creator_id into v_creator;
    if v_creator is not null and v_creator <> new.user_id then
      select coalesce(nullif(name, ''), handle) into v_nome from profiles where id = new.user_id;
      perform public.notify(v_creator, coalesce(v_nome, 'Alguém') || ' comentou a tua publicação.', '#p-' || new.post_id, false);
    end if;
  else
    update posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;

create trigger comments_count after insert or delete on public.post_comments
  for each row execute function public.bump_comment();

-- ---------- Visualizações ----------
create table if not exists public.post_views (
  post_id   uuid not null references public.posts(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  seen_at   timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_views enable row level security;
-- Sem políticas: só a função abaixo escreve, e ninguém lê a lista directamente.

create or replace function public.register_post_view(p_post uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not public.can_view_post(p_post) then return; end if;
  -- O próprio criador não conta para as visualizações das suas publicações.
  if exists (select 1 from posts where id = p_post and creator_id = auth.uid()) then return; end if;
  insert into post_views (post_id, user_id) values (p_post, auth.uid()) on conflict do nothing;
  if found then update posts set view_count = view_count + 1 where id = p_post; end if;
end $$;
revoke all on function public.register_post_view(uuid) from public, anon;
grant execute on function public.register_post_view(uuid) to authenticated;
