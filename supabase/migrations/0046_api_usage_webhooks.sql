-- =====================================================================
-- Public API — usage analytics + webhooks (push)
-- =====================================================================

-- ── Usage analytics: hitungan request per kunci per hari ──────────────
create table api_key_usage (
  key_id uuid not null references api_keys(id) on delete cascade,
  day    date not null,
  count  bigint not null default 0,
  primary key (key_id, day)
);

-- ── Webhook endpoints (langganan konsumen) ────────────────────────────
create table webhook_endpoints (
  id               uuid primary key default gen_random_uuid(),
  url              text not null,
  secret           text not null,             -- HMAC signing secret (di-generate)
  events           text[] not null default '{}', -- event yang dilanggan; {} = semua
  active           boolean not null default true,
  note             text,
  created_by_wa    text,
  created_at       timestamptz not null default now(),
  last_delivery_at timestamptz,
  failure_count    int not null default 0
);

-- ── Outbox pengiriman (durable + retry) ───────────────────────────────
create table webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  endpoint_id     uuid not null references webhook_endpoints(id) on delete cascade,
  event           text not null,
  payload         jsonb not null,
  status          text not null default 'pending',   -- pending | delivered | failed
  attempts        int not null default 0,
  max_attempts    int not null default 6,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz
);

-- Worker dispatch hanya ambil yang pending & sudah jatuh tempo.
create index webhook_deliveries_due_idx
  on webhook_deliveries (next_attempt_at)
  where status = 'pending';
