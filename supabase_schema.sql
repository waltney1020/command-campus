-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Safe to re-run (adds new tables/columns if you already set up v1).
create table if not exists projects (
  id text primary key,
  name text not null,
  platform text not null default 'codex',
  status text not null default 'idle',
  avatar text not null default 'golden',
  agents jsonb not null default '[]'::jsonb,
  sort integer not null default 0,
  updated_at bigint not null default 0
);
alter table projects add column if not exists status_mode text not null default 'manual';
alter table projects add column if not exists heartbeat_minutes integer not null default 10;

create table if not exists notes (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  text text not null,
  created_at bigint not null,
  done boolean not null default false,
  done_at bigint
);
create index if not exists notes_project_idx on notes(project_id, created_at);
alter table notes add column if not exists updated_at bigint not null default 0;

-- Manual usage figures per platform (Codex, Claude, Grok). `quota` is the limit field.
create table if not exists usage (
  id text primary key,
  platform text not null,
  plan text not null default '',
  used text not null default '',
  quota text not null default '',
  reset_date text not null default '',
  note text not null default '',
  url text not null default '',
  updated_at bigint not null default 0
);

-- Agent heartbeats. A physical light can read the latest row per card_id
-- (or use CCMap.derive in status-map.js) for working=green, idle=red, needs_you=amber.
create table if not exists heartbeats (
  id bigint generated always as identity primary key,
  card_id text not null,
  status text not null check (status in ('working', 'idle', 'needs_you')),
  message text not null default '',
  updated_at timestamptz not null default now()
);
create index if not exists heartbeats_card_idx on heartbeats (card_id, updated_at desc);

alter table projects enable row level security;
alter table notes enable row level security;
alter table usage enable row level security;
alter table heartbeats enable row level security;

-- Single-user setup: the anon key can read/write. Keep the key private (see SETUP_SYNC.md).
drop policy if exists "cc open projects" on projects;
drop policy if exists "cc open notes" on notes;
drop policy if exists "cc open usage" on usage;
drop policy if exists "cc read heartbeats" on heartbeats;
drop policy if exists "cc insert heartbeats" on heartbeats;
create policy "cc open projects" on projects for all to anon using (true) with check (true);
create policy "cc open notes" on notes for all to anon using (true) with check (true);
create policy "cc open usage" on usage for all to anon using (true) with check (true);
-- Heartbeats are append-only for agents: insert + read, no update or delete.
create policy "cc read heartbeats" on heartbeats for select to anon using (true);
create policy "cc insert heartbeats" on heartbeats for insert to anon
  with check (status in ('working', 'idle', 'needs_you') and length(card_id) > 0);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.projects to anon, authenticated;
grant select, insert, update, delete on table public.notes to anon, authenticated;
grant select, insert, update, delete on table public.usage to anon, authenticated;
grant select, insert on table public.heartbeats to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
