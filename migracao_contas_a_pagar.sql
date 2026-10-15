-- Contas a pagar / a receber (dar baixa)
-- Rode UMA vez em: Supabase > SQL Editor > New query > Run
-- Lançamentos já existentes ficam como "pagos".

alter table public.transactions
  add column if not exists status  text not null default 'paid' check (status in ('paid','pending')),
  add column if not exists paid_at date;

update public.transactions set paid_at = date where status = 'paid' and paid_at is null;

create index if not exists transactions_hh_status_idx on public.transactions (household_id, status);
