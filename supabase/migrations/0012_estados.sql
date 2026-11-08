-- Estados (como os do WhatsApp e as histórias do Instagram).
--
-- Só criadores publicam. Cada estado é uma foto ou um vídeo, com legenda opcional,
-- e desaparece 24 horas depois. Vê-os quem segue ou subscreve o criador (e o
-- próprio criador e a administração). O ficheiro vive no bucket privado `stories`,
-- em <criador>/<estado>/<ficheiro>, e só se lê com as mesmas regras da tabela.
--
-- Só acrescenta: não altera nenhuma tabela, função ou política existente.

create table if not exists public.stories (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references public.creators(id) on delete cascade,
  path        text not null,
  media_type  text not null check (media_type in ('image', 'video')),
  caption     text check (char_length(caption) <= 200),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours'
);
create index if not exists stories_creator_ativos on public.stories (creator_id, expires_at desc);

create table if not exists public.story_views (
  story_id  uuid not null references public.stories(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  seen_at   timestamptz not null default now(),
  primary key (story_id, user_id)
);

-- Quem pode ver os estados de um criador.
create or replace function public.can_view_stories(p_creator uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_creator = auth.uid()
      or public.is_admin()
      or (exists (select 1 from creators c where c.id = p_creator and c.status = 'approved')
          and (public.is_subscribed(p_creator)
               or exists (select 1 from follows f where f.creator_id = p_creator and f.follower_id = auth.uid())));
$$;

-- O mesmo, a partir do id do estado (usado pelo storage, que só conhece o caminho).
create or replace function public.can_view_story(p_story uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from stories s where s.id = p_story
                   and (s.creator_id = auth.uid() or (s.expires_at > now() and public.can_view_stories(s.creator_id))));
$$;

alter table public.stories enable row level security;
alter table public.story_views enable row level security;

create policy stories_read on public.stories for select to authenticated
  using (creator_id = auth.uid() or (expires_at > now() and public.can_view_stories(creator_id)));
create policy stories_insert on public.stories for insert to authenticated
  with check (creator_id = auth.uid()
              and exists (select 1 from creators c where c.id = auth.uid() and c.status = 'approved')
              and expires_at <= now() + interval '24 hours 5 minutes');
create policy stories_delete on public.stories for delete to authenticated
  using (creator_id = auth.uid() or public.is_admin());

create policy story_views_read on public.story_views for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from stories s where s.id = story_id and s.creator_id = auth.uid()));
create policy story_views_insert on public.story_views for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_story(story_id));

-- Bucket privado dos ficheiros (até 50 MB, só imagem e vídeo).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stories', 'stories', false, 52428800, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;

create policy "stories read" on storage.objects for select to authenticated
  using (bucket_id = 'stories'
         and ((storage.foldername(name))[1] = auth.uid()::text
              or public.can_view_story(public.try_uuid((storage.foldername(name))[2]))));
create policy "stories write" on storage.objects for insert to authenticated
  with check (bucket_id = 'stories'
              and (storage.foldername(name))[1] = auth.uid()::text
              and exists (select 1 from creators c where c.id = auth.uid() and c.status = 'approved'));
create policy "stories delete" on storage.objects for delete to authenticated
  using (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);
