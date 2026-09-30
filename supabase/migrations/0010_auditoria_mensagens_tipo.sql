-- =============================================================================
-- 0010_auditoria_mensagens_tipo.sql — «Abrir» na Auditoria de mensagens falhava
-- =============================================================================
-- profiles.handle é citext e a função declara sender_handle como text. Numa
-- função plpgsql com RETURN QUERY os tipos têm de bater exactamente, por isso
-- cada abertura dava «structure of query does not match function result type».
-- Idempotente.
-- =============================================================================

create or replace function public.admin_thread_messages(p_thread uuid)
 returns table(id uuid, sender_id uuid, sender_handle text, body text, ppv_price integer, media jsonb, created_at timestamp with time zone)
 language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_admin() then raise exception 'Sem permissão.'; end if;
  insert into admin_message_views (admin_id, thread_id) values (auth.uid(), p_thread);
  return query
    select m.id, m.sender_id, p.handle::text, m.body, m.ppv_price, m.media, m.created_at
    from messages m join profiles p on p.id = m.sender_id
    where m.thread_id = p_thread
    order by m.created_at asc;
end $$;

-- A mesma conversão, explícita, na lista de conversas (hoje funciona por ser SQL simples).
create or replace function public.admin_threads()
 returns table(id uuid, fan_handle text, fan_name text, creator_handle text, creator_name text, last_message_at timestamp with time zone, message_count bigint)
 language sql stable security definer set search_path to 'public' as $$
  select t.id, pf.handle::text, pf.name, pc.handle::text, pc.name, t.last_message_at,
         (select count(*) from messages m where m.thread_id = t.id)
  from threads t
  join profiles pf on pf.id = t.fan_id
  join profiles pc on pc.id = t.creator_id
  where public.is_admin()
  order by t.last_message_at desc
  limit 300
$$;
