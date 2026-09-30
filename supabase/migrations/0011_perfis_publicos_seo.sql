-- =============================================================================
-- 0011_perfis_publicos_seo.sql — perfis de criador com endereço público
-- =============================================================================
-- As páginas /perfil/<nome> precisam de ser lidas por quem não tem sessão (o
-- Google, o WhatsApp, o Facebook e visitantes novos). As tabelas profiles e
-- creators só se lêem com sessão, por isso estas duas funções devolvem apenas
-- os campos públicos, e só de criadores aprovados e não banidos. Nada de
-- email, data de nascimento, saldos, conteúdos ou perfis de fãs.
-- Idempotente.
-- =============================================================================

create or replace function public.perfil_publico(p_handle text)
 returns table(handle text, name text, avatar_url text, cover_url text, bio text, category text,
               city text, price integer, follower_count integer, post_count integer, created_at timestamptz)
 language sql stable security definer set search_path to 'public' as $$
  select p.handle::text, p.name, p.avatar_url, c.cover_url, c.bio, c.category,
         c.city, c.price, c.follower_count, c.post_count, c.created_at
  from profiles p join creators c on c.id = p.id
  where p.handle = p_handle::citext
    and c.status = 'approved'
    and (p.banned_at is null or (p.banned_until is not null and p.banned_until <= now()))
$$;

-- Lista para o sitemap.xml.
create or replace function public.criadores_publicos()
 returns table(handle text, atualizado timestamptz)
 language sql stable security definer set search_path to 'public' as $$
  select p.handle::text, coalesce(c.approved_at, c.created_at)
  from profiles p join creators c on c.id = p.id
  where c.status = 'approved'
    and (p.banned_at is null or (p.banned_until is not null and p.banned_until <= now()))
  order by c.follower_count desc
  limit 5000
$$;

grant execute on function public.perfil_publico(text) to anon, authenticated;
grant execute on function public.criadores_publicos() to anon, authenticated;

-- Prova social na página de entrada: número real de membros e três fotos de
-- criadores aprovados (nunca um número inventado).
create or replace function public.contagem_publica()
 returns table(membros bigint, fotos text[])
 language sql stable security definer set search_path to 'public' as $$
  select (select count(*) from profiles where onboarded and banned_at is null),
         array(select p.avatar_url from profiles p join creators c on c.id = p.id
               where c.status = 'approved' and p.avatar_url is not null and p.banned_at is null
               order by c.follower_count desc limit 3)
$$;
grant execute on function public.contagem_publica() to anon, authenticated;
