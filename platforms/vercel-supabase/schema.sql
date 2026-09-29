-- Supabase (Postgres) schema for Budgeter on Vercel.
-- Run it in the Supabase dashboard: SQL Editor → New query → paste → Run.

-- The budget document. Row 'current' holds the whole budget JSON (see docs/data-model.md).
create table if not exists docs (
  id text primary key,
  body jsonb not null,
  updated_at timestamptz not null default now()
);

-- Devices that turned notifications on. Dead subscriptions (404/410) are deleted automatically.
create table if not exists push_subs (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now(),
  last_ok timestamptz
);

-- Outgoing notification queue. Insert a row to notify every device; it's sent within a minute and
-- sent_at and result are filled in. A future created_at schedules it, e.g.
--   insert into notifications (title, body, created_at) values ('Budget', 'Move the collection', '2026-10-01 08:00 Europe/London');
create table if not exists notifications (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null,
  url text default '/',
  created_at timestamptz default now(),
  sent_at timestamptz,
  result text
);

-- Row Level Security on, with no policies: the browser (publishable key) can't read or write any of
-- this directly. Only the Vercel functions can, with the secret key, after checking who you are.
alter table docs enable row level security;
alter table push_subs enable row level security;
alter table notifications enable row level security;

-- Keep updated_at current on every write to the budget.
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists docs_touch on docs;
create trigger docs_touch before update on docs for each row execute function touch_updated_at();

-- ── Every minute: deliver queued notifications ───────────────────────────────────────────────────
-- Vercel's free (Hobby) cron only runs once a day, so Supabase calls the delivery endpoint instead.
-- Replace the two values, then run this part too. (On Vercel Pro you can use Vercel Cron instead:
-- see docs/vercel-supabase.md.)
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule('budget-deliver', '* * * * *', $$
--   select net.http_post(
--     url := 'https://budget.example.com/api/cron/deliver',
--     headers := jsonb_build_object('Authorization', 'Bearer REPLACE_ME_CRON_SECRET')
--   )
-- $$);
--
-- To stop it: select cron.unschedule('budget-deliver');
