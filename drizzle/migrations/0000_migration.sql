create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  version int not null default 1,
  tracked_wallet text,
  pair_address text,
  config jsonb not null default '{}'::jsonb,
  mode text not null default 'simulacao',
  status text not null default 'parado',
  updated_at timestamptz not null default now()
);
create table public.sim_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  quote_symbol text not null default 'WBNB',
  initial_quote numeric not null,
  quote_balance numeric not null,
  token_balance numeric not null default 0,
  cost_basis numeric not null default 0,
  realized_pnl numeric not null default 0,
  fees_paid numeric not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.sim_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid not null references public.sim_accounts(id) on delete cascade,
  side text not null check (side in ('compra','venda')),
  price numeric not null,
  quote_amount numeric not null,
  token_amount numeric not null,
  fee numeric not null,
  gas_estimate numeric not null default 0,
  slippage_pct numeric not null,
  realized_pnl numeric not null default 0,
  reason text,
  pair_address text,
  created_at timestamptz not null default now()
);
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.strategies, public.sim_accounts, public.sim_trades, public.audit_log to authenticated;
grant all on public.strategies, public.sim_accounts, public.sim_trades, public.audit_log to service_role;
alter table public.strategies enable row level security;
alter table public.sim_accounts enable row level security;
alter table public.sim_trades enable row level security;
alter table public.audit_log enable row level security;
create policy "own" on public.strategies for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on public.sim_accounts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own" on public.sim_trades for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own read" on public.audit_log for select to authenticated using (user_id = auth.uid());
create policy "own insert" on public.audit_log for insert to authenticated with check (user_id = auth.uid());