-- =========================================================
-- Iron System — Supabase schema
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to re-run (idempotent).
-- =========================================================

-- ---------- public profile (username, friend lookups) ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 24),
  created_at   timestamptz not null default now()
);
create unique index if not exists profiles_username_key on public.profiles (username);

-- ---------- public stats (what friends / global ranking can see) ----------
-- Rank, level and records only. Workouts and bodyweight stay private.
create table if not exists public.stats (
  user_id        uuid primary key references public.profiles (id) on delete cascade,
  level          int     not null default 1   check (level between 1 and 1000),
  xp             int     not null default 0   check (xp >= 0),
  mmr            numeric not null default 0   check (mmr >= 0 and mmr < 5000),
  rank_idx       int     not null default 0   check (rank_idx between 0 and 21),
  ranked         boolean not null default false,
  muscles        jsonb   not null default '{}'::jsonb,
  records        jsonb   not null default '[]'::jsonb,
  workouts_count int     not null default 0   check (workouts_count >= 0),
  total_volume   numeric not null default 0   check (total_volume >= 0),
  streak         int     not null default 0   check (streak >= 0),
  updated_at     timestamptz not null default now()
);
create index if not exists stats_mmr_idx on public.stats (mmr desc);

-- ---------- friendships ----------
-- One row per pair. user_id = who sent the request, friend_id = who receives it.
create table if not exists public.friendships (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  friend_id  uuid not null references public.profiles (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index if not exists friendships_friend_idx on public.friendships (friend_id);

-- ---------- private cloud backup / sync of the whole app state ----------
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- row level security ----------
alter table public.profiles    enable row level security;
alter table public.stats       enable row level security;
alter table public.friendships enable row level security;
alter table public.user_data   enable row level security;

-- profiles: any signed-in user can read (to find friends); you can only write your own
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- stats: readable by every signed-in user (global ranking); writable only by the owner
drop policy if exists "stats read" on public.stats;
create policy "stats read" on public.stats for select to authenticated using (true);
drop policy if exists "stats insert own" on public.stats;
create policy "stats insert own" on public.stats for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "stats update own" on public.stats;
create policy "stats update own" on public.stats for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- friendships: only the two people involved can see the row
drop policy if exists "friendships read" on public.friendships;
create policy "friendships read" on public.friendships for select to authenticated
  using (auth.uid() in (user_id, friend_id));
-- you can only send requests as yourself, always as 'pending'
drop policy if exists "friendships request" on public.friendships;
create policy "friendships request" on public.friendships for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
-- only the receiver can accept
drop policy if exists "friendships accept" on public.friendships;
create policy "friendships accept" on public.friendships for update to authenticated
  using (friend_id = auth.uid()) with check (friend_id = auth.uid());
-- either side can decline / remove
drop policy if exists "friendships delete" on public.friendships;
create policy "friendships delete" on public.friendships for delete to authenticated
  using (auth.uid() in (user_id, friend_id));

-- user_data: strictly private
drop policy if exists "user_data own" on public.user_data;
create policy "user_data own" on public.user_data for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- the receiver may only change the status, never re-point the request
create or replace function public.friendships_guard() returns trigger language plpgsql as $$
begin
  if new.user_id <> old.user_id or new.friend_id <> old.friend_id then
    raise exception 'cannot change friendship parties';
  end if;
  return new;
end $$;
drop trigger if exists friendships_guard on public.friendships;
create trigger friendships_guard before update on public.friendships
  for each row execute function public.friendships_guard();

-- keep updated_at honest (server time)
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before insert or update on public.user_data
  for each row execute function public.touch_updated_at();
drop trigger if exists stats_touch on public.stats;
create trigger stats_touch before insert or update on public.stats
  for each row execute function public.touch_updated_at();

-- ---------- API grants ----------
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.stats to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.user_data to authenticated;
