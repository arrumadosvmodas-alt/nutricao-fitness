create table if not exists public.nutrition_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text,
  sex text not null default 'female' check (sex in ('female', 'male')),
  age integer not null default 35 check (age between 10 and 120),
  height_cm numeric(5,2) not null default 165 check (height_cm > 0),
  weight_kg numeric(6,2) not null default 70 check (weight_kg > 0),
  goal_weight_kg numeric(6,2) check (goal_weight_kg > 0),
  goal text not null default 'lose' check (goal in ('lose', 'maintain', 'gain')),
  activity_level text not null default 'light' check (activity_level in ('sedentary', 'light', 'moderate', 'active')),
  protein_pct numeric(5,2) not null default 25 check (protein_pct >= 0),
  carbs_pct numeric(5,2) not null default 45 check (carbs_pct >= 0),
  fat_pct numeric(5,2) not null default 30 check (fat_pct >= 0),
  manual_calories_kcal numeric(7,2) check (manual_calories_kcal >= 0),
  calculated_calories_kcal numeric(7,2),
  calculated_protein_g numeric(7,2),
  calculated_carbs_g numeric(7,2),
  calculated_fat_g numeric(7,2),
  bmr_kcal numeric(7,2),
  tdee_kcal numeric(7,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nutrition_profiles enable row level security;

do $$ begin
  create policy "nutrition profiles are private" on public.nutrition_profiles
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end $$;

create index if not exists nutrition_profiles_updated_idx on public.nutrition_profiles (updated_at desc);
