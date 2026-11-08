-- Limpeza automática (de hora a hora), para os ficheiros não ocuparem espaço à toa.
--
-- * Estados (histórias) com mais de 24 horas: apagados da base de dados e o ficheiro do
--   armazenamento (bucket `stories`).
-- * Publicações apagadas: a linha já é apagada na hora (estúdio). Aqui apanham-se os
--   ficheiros que tenham ficado para trás (`content`, `previews`) sem publicação.
--
-- O Supabase não deixa apagar ficheiros por SQL (storage.protect_delete), por isso quem
-- apaga é a Edge Function `limpeza`, com a chave de serviço. O pg_cron chama-a de hora a
-- hora com uma chave guardada no Vault; sem essa chave a função recusa o pedido.

create extension if not exists pg_net;

-- Chave partilhada entre o cron e a função (fica só no Vault).
select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),'limpeza_chave', 'Chave do cron de limpeza')
where not exists (select 1 from vault.secrets where name = 'limpeza_chave');

create or replace function public.limpeza_chave_valida(p_chave text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'limpeza_chave' and decrypted_secret = p_chave);
$$;

-- Ficheiros a apagar: os estados expirados e os ficheiros sem dono (com mais de 6 horas,
-- para não apanhar um envio que ainda esteja a meio).
create or replace function public.limpeza_ficheiros()
returns table (bucket text, path text) language sql stable security definer set search_path to 'public' as $$
  select 'stories', s.path from stories s where s.expires_at < now()
  union
  select o.bucket_id, o.name from storage.objects o
   where o.created_at < now() - interval '6 hours'
     and (
       (o.bucket_id = 'stories' and not exists (select 1 from stories s where s.path = o.name))
    or (o.bucket_id = 'content' and not exists (select 1 from posts p where p.id = public.try_uuid((storage.foldername(o.name))[2])))
    or (o.bucket_id = 'previews' and not exists (select 1 from posts p where p.id = public.try_uuid(split_part(storage.filename(o.name), '.', 1))))
     )
  limit 1000;
$$;

revoke all on function public.limpeza_chave_valida(text) from public, anon, authenticated;
revoke all on function public.limpeza_ficheiros() from public, anon, authenticated;
grant execute on function public.limpeza_chave_valida(text) to service_role;
grant execute on function public.limpeza_ficheiros() to service_role;

-- De hora a hora, ao minuto 40.
select cron.unschedule('apf-limpeza') where exists (select 1 from cron.job where jobname = 'apf-limpeza');
select cron.schedule('apf-limpeza', '40 * * * *', $cron$
  select net.http_post(
    url := 'https://xkcngjrlfmozlsttuxgs.supabase.co/functions/v1/limpeza',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-limpeza', (select decrypted_secret from vault.decrypted_secrets where name = 'limpeza_chave')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
$cron$);
