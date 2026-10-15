-- =====================================================================
-- Finanças da Família — schema Supabase
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
-- Requer Postgres 15+ (padrão em projetos Supabase novos).
-- =====================================================================

-- ---------- Tabelas ----------
create table if not exists public.households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  invite_code  text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','member')),
  display_name text not null check (char_length(display_name) between 1 and 60),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)                      -- um usuário participa de uma família
);

create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60),
  type            text not null default 'checking'
                  check (type in ('checking','savings','cash','credit','investment')),
  initial_balance numeric(14,2) not null default 0,
  created_at      timestamptz not null default now(),
  unique (id, household_id)
);

create table if not exists public.categories (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 60),
  kind           text not null check (kind in ('income','expense')),
  color          text not null default '#64748b',
  monthly_budget numeric(14,2) not null default 0 check (monthly_budget >= 0),
  created_at     timestamptz not null default now(),
  unique (id, household_id)
);

create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null default auth.uid(),
  account_id   uuid not null,
  category_id  uuid,
  kind         text not null check (kind in ('income','expense')),
  amount       numeric(14,2) not null check (amount > 0),
  description  text not null check (char_length(description) between 1 and 120),
  date         date not null default current_date,
  created_at   timestamptz not null default now(),
  -- garante que conta/categoria pertencem à mesma família
  foreign key (account_id, household_id)  references public.accounts(id, household_id)   on delete restrict,
  foreign key (category_id, household_id) references public.categories(id, household_id) on delete set null (category_id)
);
create index if not exists transactions_hh_date_idx on public.transactions (household_id, date desc);

create table if not exists public.goals (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 80),
  target_amount  numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  deadline       date,
  created_at     timestamptz not null default now()
);

-- ---------- Funções auxiliares (security definer evita recursão de RLS) ----------
create or replace function public.is_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members
                 where household_id = hid and user_id = auth.uid());
$$;

create or replace function public.is_owner(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members
                 where household_id = hid and user_id = auth.uid() and role = 'owner');
$$;

-- ---------- RPCs ----------
create or replace function public.create_household(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Você já participa de uma família';
  end if;

  insert into households (name, created_by) values (trim(p_name), auth.uid()) returning id into hid;
  insert into household_members (household_id, user_id, role, display_name)
    values (hid, auth.uid(), 'owner', trim(p_display_name));

  insert into accounts (household_id, name, type) values (hid, 'Carteira', 'cash');

  insert into categories (household_id, name, kind, color, monthly_budget) values
    (hid, 'Moradia',           'expense', '#6366f1', 0),
    (hid, 'Mercado',           'expense', '#22c55e', 0),
    (hid, 'Transporte',        'expense', '#f59e0b', 0),
    (hid, 'Saúde',             'expense', '#ef4444', 0),
    (hid, 'Educação',          'expense', '#3b82f6', 0),
    (hid, 'Lazer',             'expense', '#ec4899', 0),
    (hid, 'Restaurantes',      'expense', '#f97316', 0),
    (hid, 'Contas e serviços', 'expense', '#14b8a6', 0),
    (hid, 'Vestuário',         'expense', '#a855f7', 0),
    (hid, 'Outros',            'expense', '#64748b', 0),
    (hid, 'Salário',           'income',  '#16a34a', 0),
    (hid, 'Freelance',         'income',  '#0ea5e9', 0),
    (hid, 'Investimentos',     'income',  '#8b5cf6', 0),
    (hid, 'Outras receitas',   'income',  '#84cc16', 0);
  return hid;
end $$;

create or replace function public.join_household(p_code text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if exists (select 1 from household_members where user_id = auth.uid()) then
    raise exception 'Você já participa de uma família';
  end if;
  select id into hid from households where invite_code = lower(trim(p_code));
  if hid is null then raise exception 'Código de convite inválido'; end if;
  insert into household_members (household_id, user_id, role, display_name)
    values (hid, auth.uid(), 'member', trim(p_display_name));
  return hid;
end $$;

create or replace function public.regenerate_invite_code(p_hid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not is_owner(p_hid) then raise exception 'Apenas o administrador pode gerar novo código'; end if;
  code := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  update households set invite_code = code where id = p_hid;
  return code;
end $$;

revoke all on function public.create_household(text, text)   from public, anon;
revoke all on function public.join_household(text, text)     from public, anon;
revoke all on function public.regenerate_invite_code(uuid)   from public, anon;
grant execute on function public.create_household(text, text)   to authenticated;
grant execute on function public.join_household(text, text)     to authenticated;
grant execute on function public.regenerate_invite_code(uuid)   to authenticated;

-- ---------- Row Level Security ----------
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.accounts          enable row level security;
alter table public.categories        enable row level security;
alter table public.transactions      enable row level security;
alter table public.goals             enable row level security;

-- households
drop policy if exists hh_select on public.households;
drop policy if exists hh_update on public.households;
drop policy if exists hh_delete on public.households;
create policy hh_select on public.households for select to authenticated using (public.is_member(id));
create policy hh_update on public.households for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));
create policy hh_delete on public.households for delete to authenticated using (public.is_owner(id));

-- household_members
drop policy if exists hm_select on public.household_members;
drop policy if exists hm_update on public.household_members;
drop policy if exists hm_delete on public.household_members;
create policy hm_select on public.household_members for select to authenticated using (public.is_member(household_id));
create policy hm_update on public.household_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- só o apelido pode ser alterado diretamente (papel muda apenas via RPC)
revoke update on public.household_members from authenticated, anon;
grant  update (display_name) on public.household_members to authenticated;
create policy hm_delete on public.household_members for delete to authenticated
  using (user_id = auth.uid() or public.is_owner(household_id));

-- tabelas de dados: qualquer membro da família lê e escreve
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','goals'] loop
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_member(household_id)) with check (public.is_member(household_id))',
      t || '_all', t);
  end loop;
end $$;

-- ---------- Realtime (atualização ao vivo entre os membros) ----------
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','transactions','goals','household_members'] loop
    execute format('alter table public.%I replica identity full', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;   -- já adicionada
    end;
  end loop;
end $$;
