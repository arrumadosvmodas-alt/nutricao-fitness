create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  birth_date date,
  sex text check (sex in ('male', 'female')),
  height_cm numeric(5,2),
  current_weight_kg numeric(6,2),
  target_weight_kg numeric(6,2),
  activity_level text not null default 'light',
  goal text not null default 'maintain',
  locale text not null default 'pt-BR',
  timezone text not null default 'America/Fortaleza',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  calories_kcal numeric(7,2) not null,
  protein_g numeric(7,2) not null,
  carbs_g numeric(7,2) not null,
  fat_g numeric(7,2) not null,
  fiber_g numeric(7,2),
  sodium_mg numeric(9,2),
  starts_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table public.foods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  name text not null,
  brand text,
  source text not null default 'user',
  region text not null default 'BR',
  verified boolean not null default false,
  serving_size numeric(9,3) not null default 100,
  serving_unit text not null default 'g',
  calories_kcal numeric(9,3) not null default 0,
  protein_g numeric(9,3) not null default 0,
  carbs_g numeric(9,3) not null default 0,
  fat_g numeric(9,3) not null default 0,
  fiber_g numeric(9,3),
  sugar_g numeric(9,3),
  sodium_mg numeric(9,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null,
  diary_date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  quantity numeric(9,3) not null check (quantity > 0),
  unit text not null default 'g',
  food_name_snapshot text not null,
  calories_kcal numeric(9,3) not null,
  protein_g numeric(9,3) not null,
  carbs_g numeric(9,3) not null,
  fat_g numeric(9,3) not null,
  fiber_g numeric(9,3),
  sodium_mg numeric(9,3),
  created_at timestamptz not null default now()
);

create table public.water_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  diary_date date not null,
  amount_ml integer not null check (amount_ml > 0),
  created_at timestamptz not null default now()
);

create table public.exercise_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  diary_date date not null,
  name text not null,
  duration_minutes integer check (duration_minutes > 0),
  calories_kcal numeric(9,3) check (calories_kcal >= 0),
  created_at timestamptz not null default now()
);

create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(6,2) not null check (weight_kg > 0),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.nutrition_goals enable row level security;
alter table public.foods enable row level security;
alter table public.diary_entries enable row level security;
alter table public.water_entries enable row level security;
alter table public.exercise_entries enable row level security;
alter table public.weight_entries enable row level security;

create policy "profiles are private" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "nutrition goals are private" on public.nutrition_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "foods are public or owned" on public.foods
  for select using (owner_id is null or owner_id = auth.uid());

create policy "users manage own foods" on public.foods
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "diary entries are private" on public.diary_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "water entries are private" on public.water_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "exercise entries are private" on public.exercise_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "weight entries are private" on public.weight_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index foods_search_idx on public.foods using gin (to_tsvector('portuguese', name || ' ' || coalesce(brand, '')));
create index diary_entries_user_date_idx on public.diary_entries (user_id, diary_date);

