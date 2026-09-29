-- D1 schema for the Budgeter Worker.
-- Apply with: npx wrangler d1 execute budgeter-db --remote --file=schema.sql

-- The budget document. Row 'current' holds the whole budget JSON (see docs/data-model.md).
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Devices that turned notifications on. Dead subscriptions (404/410) are deleted automatically.
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  last_ok TEXT
);

-- Outgoing notification queue. Insert a row to notify every device; the Worker's cron sends it within a
-- minute and fills sent_at and result. A future created_at (UTC) schedules the message for later.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT DEFAULT '/',
  created_at TEXT DEFAULT (datetime('now')),
  sent_at TEXT,
  result TEXT
);
