-- Perfis (filhos, veículos, pets…) com foto + foto de quem está logado
-- Supabase > SQL Editor > New query > cole TUDO > Run. Pode rodar mais de uma vez.

-- 1) Foto de cada membro (usuário do app)
alter table public.household_members
  add column if not exists avatar text check (avatar is null or char_length(avatar) < 600000);
grant update (display_name, avatar) on public.household_members to authenticated;

-- 2) Perfis da família: filhos, veículos, pets, outros
create table if not exists public.family_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind         text not null default 'child' check (kind in ('child','person','vehicle','pet','other')),
  name         text not null check (char_length(name) between 1 and 60),
  detail       text check (detail is null or char_length(detail) <= 80),
  birth_date   date,
  photo        text check (photo is null or char_length(photo) < 600000),
  created_at   timestamptz not null default now(),
  unique (id, household_id)
);
alter table public.family_items enable row level security;
drop policy if exists family_items_all on public.family_items;
create policy family_items_all on public.family_items for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- 3) Vincular lançamentos a um perfil (opcional)
alter table public.transactions add column if not exists item_id uuid;
alter table public.transactions drop constraint if exists transactions_item_fk;
alter table public.transactions
  add constraint transactions_item_fk foreign key (item_id, household_id)
  references public.family_items (id, household_id) on delete set null (item_id);
create index if not exists transactions_item_idx on public.transactions (item_id);

-- 4) Atualização ao vivo
alter table public.family_items replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.family_items;
exception when others then null;
end $$;

notify pgrst, 'reload schema';
