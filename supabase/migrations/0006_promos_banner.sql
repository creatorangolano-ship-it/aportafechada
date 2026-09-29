-- =============================================================================
-- 0006_promos_banner.sql — controlos do banner de promoções
-- =============================================================================
-- O banner substitui os cartões antigos (topo / lado esquerdo / lado direito).
-- A administração passa a escolher, por promoção:
--
--   position     (já existia)  coluna no computador: 'esquerda' ou 'direita'.
--                              As linhas antigas com 'topo' passam a 'esquerda'.
--   mobile_slot  (nova)        no telemóvel, depois de que publicação aparece:
--                              1, 2, 3 ou 5; NULL = automática (varia por visita).
--   pinned       (nova)        true = aparece sempre esta (fixa); false = roda
--                              com as outras, uma por visita.
--   cta          (nova)        texto do botão; NULL = «Clica aqui».
--
-- Idempotente: pode correr mais de uma vez. Só acrescenta colunas; não apaga
-- nada. As políticas RLS da tabela ficam como estão (só o admin escreve).
-- =============================================================================

alter table public.promos add column if not exists mobile_slot smallint;
alter table public.promos add column if not exists pinned boolean not null default false;
alter table public.promos add column if not exists cta text;

-- Valores válidos. Feito em DO para não falhar se a restrição já existir.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'promos_mobile_slot_valido') then
    alter table public.promos add constraint promos_mobile_slot_valido
      check (mobile_slot is null or mobile_slot in (1, 2, 3, 5));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'promos_cta_curto') then
    alter table public.promos add constraint promos_cta_curto
      check (cta is null or char_length(cta) between 2 and 30);
  end if;
end $$;

-- As promoções antigas no «topo» passam para a coluna esquerda, e é essa a
-- coluna por omissão das novas. (O CHECK promos_position_chk continua a aceitar
-- 'topo', 'esquerda' e 'direita'; não é preciso mexer nele.)
update public.promos set position = 'esquerda' where position = 'topo';
alter table public.promos alter column position set default 'esquerda';
