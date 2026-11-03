-- Sika : une ligne de données par compte utilisateur.
-- À exécuter une seule fois dans Supabase → SQL Editor → New query → Run.

create table if not exists public.sika_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.sika_data enable row level security;

-- Chaque utilisateur ne voit et ne modifie que ses propres données.
drop policy if exists "sika lecture" on public.sika_data;
create policy "sika lecture" on public.sika_data
  for select using (auth.uid() = user_id);

drop policy if exists "sika creation" on public.sika_data;
create policy "sika creation" on public.sika_data
  for insert with check (auth.uid() = user_id);

drop policy if exists "sika modification" on public.sika_data;
create policy "sika modification" on public.sika_data
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
