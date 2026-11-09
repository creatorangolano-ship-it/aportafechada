-- Só criadores aprovados publicam (pedido do dono, 2026-11-09).
--
-- Antes, a política posts_insert aceitava criadores com estado 'pending': bastava submeter
-- o pedido de verificação para já se poder publicar (as publicações só não apareciam a
-- ninguém até à aprovação). Agora publicar, editar publicações e enviar ficheiros de
-- publicações exige o estado 'approved' — como já acontecia com lives e histórias.

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (creator_id = auth.uid()
              and exists (select 1 from creators c where c.id = auth.uid() and c.status = 'approved')
              and (access <> 'paid' or price >= setting_int('min_price')));

drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid()
              and exists (select 1 from creators c where c.id = auth.uid() and c.status = 'approved'));

drop policy if exists "content write" on storage.objects;
create policy "content write" on storage.objects for insert to authenticated
  with check (bucket_id = 'content'
              and (storage.foldername(name))[1] = auth.uid()::text
              and exists (select 1 from creators c where c.id = auth.uid() and c.status = 'approved'));
