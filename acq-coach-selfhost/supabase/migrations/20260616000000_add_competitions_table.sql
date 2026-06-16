-- Competitions feature: team contests scoped to a GHL account.
--
-- This table existed in Lovable's hosted project but was never exported into the
-- self-host migrations, so the Competitions tab errored at runtime with
--   relation "public.competitions" does not exist
-- This migration adds it with the exact shape the frontend expects
-- (see CompetitionsView / CreateCompetitionModal in apps/web/src/ACQCoach.jsx).
--
-- Fully idempotent: safe to replay on an existing cluster (init-db.sh replays
-- every migration on each container start with ON_ERROR_STOP=0).

create table if not exists public.competitions (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references public.ghl_accounts(id) on delete cascade,
  title           text not null,
  category_index  integer,                       -- null = overall score
  metric          text not null default 'absolute'
                    check (metric in ('absolute','improvement','call_count')),
  starts_at       date not null,
  ends_at         date not null,
  prize_label     text,
  created_by      uuid,                           -- auth.users id of creator (informational)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists competitions_account_id_idx on public.competitions (account_id);
create index if not exists competitions_ends_at_idx     on public.competitions (ends_at);

alter table public.competitions enable row level security;

-- Read: any member of the account (super_admin, account_admin, or rep) — mirrors
-- the "tenant view" pattern used by call_scores.
drop policy if exists "tenant view competitions" on public.competitions;
create policy "tenant view competitions" on public.competitions
  for select using (public.is_account_member(auth.uid(), account_id));

-- Write (insert/update/delete): account admins only. is_account_admin already
-- returns true for super_admin, so impersonating super-admins can manage them.
drop policy if exists "tenant write competitions" on public.competitions;
create policy "tenant write competitions" on public.competitions
  using (public.is_account_admin(auth.uid(), account_id))
  with check (public.is_account_admin(auth.uid(), account_id));

-- PostgREST role grants. post-migrations.sql grants existing tables only once
-- (no ALTER DEFAULT PRIVILEGES), so a table added later needs its own grant.
-- RLS above still gates which rows each role can actually touch.
grant select, insert, update, delete on public.competitions to anon, authenticated, service_role;

-- Keep updated_at fresh on edits (same trigger fn the other tables use).
drop trigger if exists update_competitions_updated_at on public.competitions;
create trigger update_competitions_updated_at
  before update on public.competitions
  for each row execute function public.update_updated_at_column();
