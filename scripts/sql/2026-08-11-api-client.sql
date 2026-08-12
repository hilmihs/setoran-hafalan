-- 2026-08-11-api-client.sql — tabel key konsumen API publik.
-- Apply sekali ke prod: npm run db -- --confirm "$(cat scripts/sql/2026-08-11-api-client.sql)"
create table if not exists api_client (
  id            uuid primary key default gen_random_uuid(),
  nama          text not null unique,
  token_hash    text not null unique,
  token_prefix  text not null,
  scopes        text[] not null,
  active        boolean not null default true,
  expires_at    date,
  keterangan    text,
  created_at    timestamptz not null default now(),
  created_by    text,
  revoked_at    timestamptz,
  revoked_by    text,
  last_used_at  timestamptz,
  request_count bigint not null default 0
);
create index if not exists api_client_token_hash_idx on api_client (token_hash);
