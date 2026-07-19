create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_meals enable row level security;

drop policy if exists "saved meals are private" on public.saved_meals;
create policy "saved meals are private" on public.saved_meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists saved_meals_user_idx on public.saved_meals (user_id, created_at desc);