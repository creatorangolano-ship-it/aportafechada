-- Conta oficial: a administração publica comunicados que todos vêem (pedido do dono, 15/11/2026).
--
-- Só criadores aprovados publicam (0017). A conta de admin passa a ter um perfil de criador
-- aprovado marcado como oficial (`creators.official`). O site mostra as publicações das contas
-- oficiais no Início de toda a gente, com a marca «Oficial».
--
-- `official` só se muda aqui, por SQL: nem a própria conta o pode ligar ou desligar pelo site.

alter table public.creators add column if not exists official boolean not null default false;

create or replace function public.creators_guarda_oficial()
returns trigger language plpgsql set search_path = public, pg_temp
as $$
begin
  -- Sem SECURITY DEFINER: current_user é o papel de quem fez o pedido (anon/authenticated no site).
  if current_user in ('anon', 'authenticated')
     and new.official is distinct from (case when tg_op = 'INSERT' then false else old.official end) then
    raise exception 'Sem permissão.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists creators_guarda_oficial on public.creators;
create trigger creators_guarda_oficial before insert or update on public.creators
  for each row execute function public.creators_guarda_oficial();

insert into public.creators (id, category, bio, price, status, approved_at, official)
select p.id, 'Oficial', 'Comunicados oficiais da A Porta Fechada.', 0, 'approved', now(), true
  from public.profiles p
 where p.role = 'admin'
on conflict (id) do update set official = true, status = 'approved',
                               approved_at = coalesce(public.creators.approved_at, now());
