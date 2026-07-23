create table if not exists public.system_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.system_admins enable row level security;

drop policy if exists "system admins can read own status" on public.system_admins;
create policy "system admins can read own status" on public.system_admins
  for select using (auth.uid() = user_id);

drop policy if exists "system admins manage global foods" on public.foods;
create policy "system admins manage global foods" on public.foods
  for all
  using (exists (select 1 from public.system_admins where user_id = auth.uid()))
  with check (exists (select 1 from public.system_admins where user_id = auth.uid()));
