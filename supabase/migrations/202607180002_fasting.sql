create table public.fasting_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  protocol text not null default '16:8',
  fasting_hours integer not null check (fasting_hours between 8 and 24),
  eating_window_hours integer not null check (eating_window_hours between 1 and 16),
  last_meal_time time not null,
  next_meal_time time not null,
  hydration_target_ml integer not null default 2000 check (hydration_target_ml > 0),
  fasting_allowed_intake text[] not null default array['agua', 'cafe_sem_acucar', 'cha_sem_acucar'],
  break_fast_min_kcal integer not null default 350 check (break_fast_min_kcal >= 0),
  break_fast_max_kcal integer not null default 650 check (break_fast_max_kcal >= break_fast_min_kcal),
  protein_min_g integer not null default 25 check (protein_min_g >= 0),
  fiber_min_g integer not null default 8 check (fiber_min_g >= 0),
  safety_notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fasting_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.fasting_plans(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  target_end_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.fasting_plans enable row level security;
alter table public.fasting_sessions enable row level security;

create policy "fasting plans are private" on public.fasting_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "fasting sessions are private" on public.fasting_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index fasting_plans_user_active_idx on public.fasting_plans (user_id, active);
create index fasting_sessions_user_started_idx on public.fasting_sessions (user_id, started_at desc);
