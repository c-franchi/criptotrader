create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  side text not null check (side in ('compra','venda')),
  status text not null default 'preparada',
  wallet text not null,
  pair_address text,
  amount_in text not null,
  amount_out_min text not null,
  quoted_out text not null,
  slippage_pct numeric not null,
  deadline bigint not null,
  approve_hash text,
  tx_hash text,
  block_number bigint,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.orders to authenticated;
grant all on public.orders to service_role;
alter table public.orders enable row level security;
create policy "own" on public.orders for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());