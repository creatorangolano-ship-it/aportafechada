-- Testes de segurança de 2026-11-08 (2.ª parte): correcções.
--
-- 1) Pastas de ficheiros com tipo e tamanho máximos. Antes, as pastas públicas (avatars,
--    previews, promos) aceitavam qualquer ficheiro — incluindo páginas HTML ou SVG com
--    código, que ficariam alojadas num endereço público — e nenhuma tinha limite de
--    tamanho (o plano gratuito tem 1 GB no total). SVG fica de fora de propósito: pode
--    levar código. Os tipos e tamanhos cobrem tudo o que o site envia hoje.
-- 2) Limite de tentativas na entrada com nome de utilizador (Edge Function login-handle):
--    a tabela regista as tentativas falhadas por nome e por IP; a função recusa a partir
--    de 5 falhas no mesmo nome ou 20 no mesmo IP em 15 minutos. Ninguém lê nem escreve
--    a tabela pela API (RLS sem políticas); só a função, com a chave de serviço.

update storage.buckets set file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id = 'avatars';
update storage.buckets set file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
  where id = 'previews';
update storage.buckets set file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4']
  where id = 'promos';
update storage.buckets set file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif','video/mp4','video/quicktime','video/webm']
  where id = 'content';
update storage.buckets set file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif','video/mp4','video/quicktime','video/webm']
  where id = 'messages';
update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
  where id = 'kyc';

create table if not exists public.login_tentativas (
  id      bigint generated always as identity primary key,
  chave   text not null,            -- 'h:<nome>' ou 'ip:<endereço>'
  criado  timestamptz not null default now()
);
create index if not exists login_tentativas_chave on public.login_tentativas (chave, criado desc);
alter table public.login_tentativas enable row level security;
revoke all on public.login_tentativas from anon, authenticated;

-- Apagar registos com mais de um dia (uma vez por dia, às 3h20).
select cron.unschedule('apf-login-tentativas') where exists (select 1 from cron.job where jobname = 'apf-login-tentativas');
select cron.schedule('apf-login-tentativas', '20 3 * * *',
  $cron$ delete from public.login_tentativas where criado < now() - interval '1 day' $cron$);
