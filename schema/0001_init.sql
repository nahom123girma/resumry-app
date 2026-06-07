-- Resumry AI — D1 schema (source of truth)
-- Apply with:  wrangler d1 execute resumry --file=./schema/0001_init.sql

PRAGMA foreign_keys = ON;

-- Users & account data ------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,            -- uuid
  email           TEXT NOT NULL UNIQUE,
  name            TEXT,
  password_hash   TEXT,                        -- PBKDF2 hash (null for OAuth-only)
  password_salt   TEXT,
  provider        TEXT NOT NULL DEFAULT 'password',  -- 'password' | 'google'
  -- Billing (source of truth, updated by Lemon Squeezy webhooks) -----------
  plan            TEXT NOT NULL DEFAULT 'free',       -- 'free' | 'pro' | 'lifetime'
  plan_status     TEXT NOT NULL DEFAULT 'active',     -- 'active' | 'cancelled' | 'expired'
  billing         TEXT,                                -- 'monthly' | 'annual' | 'lifetime'
  download_passes INTEGER NOT NULL DEFAULT 0,          -- one-time clean-export credits
  ls_customer_id  TEXT,
  ls_subscription_id TEXT,
  current_period_end TEXT,                              -- ISO date for subscriptions
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_ls_sub ON users(ls_subscription_id);

-- Server-side sessions ------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,                -- sha-256 of the random session token
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions(expires_at);

-- Resumes (cloud sync; localStorage is only a cache) ------------------------
CREATE TABLE IF NOT EXISTS resumes (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'Untitled',
  template    TEXT NOT NULL DEFAULT 'modern',
  data        TEXT NOT NULL DEFAULT '{}',      -- JSON document
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id, updated_at);

CREATE TABLE IF NOT EXISTS cover_letters (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'Untitled',
  data        TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_covers_user ON cover_letters(user_id, updated_at);

-- AI usage quota (per user, per calendar month) -----------------------------
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id     TEXT NOT NULL,
  period      TEXT NOT NULL,                   -- 'YYYY-MM'
  calls       INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, period)
);

-- Short-window rate limiting (abuse protection) -----------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  rl_key       TEXT PRIMARY KEY,               -- e.g. 'ai:<userId>' or 'ai:ip:<ip>'
  window_start INTEGER NOT NULL,               -- epoch seconds of window start
  count        INTEGER NOT NULL DEFAULT 0
);

-- Webhook idempotency (never double-process an event) -----------------------
CREATE TABLE IF NOT EXISTS webhook_events (
  id           TEXT PRIMARY KEY,               -- Lemon Squeezy event id / hash
  event_name   TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
