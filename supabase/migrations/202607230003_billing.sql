create table if not exists public.subscription_plans (
  id text primary key,
  name text not null,
  price_cents integer not null,
  currency text not null default 'BRL',
  billing_interval text not null check (billing_interval in ('month', 'year')),
  trial_days integer not null default 7,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.subscription_plans (id, name, price_cents, billing_interval, trial_days) values
  ('monthly', 'Nutri??o & Fitness Mensal', 990, 'month', 7),
  ('annual', 'Nutri??o & Fitness Anual', 7990, 'year', 7)
on conflict (id) do update set
  name = excluded.name,
  price_cents = excluded.price_cents,
  billing_interval = excluded.billing_interval,
  trial_days = excluded.trial_days,
  active = true;

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.subscription_plans(id),
  status text not null default 'pending' check (status in ('pending', 'trial', 'active', 'past_due', 'paused', 'canceled')),
  mercado_pago_id text,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_subscriptions_user_idx on public.user_subscriptions (user_id);
create unique index if not exists user_subscriptions_mp_idx on public.user_subscriptions (mercado_pago_id) where mercado_pago_id is not null;

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercado_pago',
  event_type text,
  external_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists "subscription plans are public" on public.subscription_plans;
create policy "subscription plans are public" on public.subscription_plans for select using (active = true);

drop policy if exists "users read own subscriptions" on public.user_subscriptions;
create policy "users read own subscriptions" on public.user_subscriptions for select using (auth.uid() = user_id or exists (select 1 from public.system_admins where user_id = auth.uid()));
