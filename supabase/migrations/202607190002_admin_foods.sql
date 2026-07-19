create table if not exists public.app_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

drop policy if exists "admins can read own admin status" on public.app_admins;
create policy "admins can read own admin status" on public.app_admins
  for select using (auth.uid() = user_id);

drop policy if exists "admins manage global foods" on public.foods;
create policy "admins manage global foods" on public.foods
  for all
  using (exists (select 1 from public.app_admins where user_id = auth.uid()))
  with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
