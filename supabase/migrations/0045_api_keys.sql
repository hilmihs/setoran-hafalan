-- =====================================================================
-- Public Read API — tabel api_keys
-- =====================================================================
-- Kunci akses per-konsumen untuk /api/v1/* (read-only, server-to-server).
-- Auth token dicek TIAP request → hash cepat (sha256), bukan bcrypt.
--   key diberikan ke konsumen: mhr_<env>_<prefix8>_<secret32> (ditampilkan sekali)
--   key_prefix : "mhr_<env>_<prefix8>" → lookup O(1) (unik)
--   key_hash   : sha256(full key) hex → dibanding constant-time saat auth
-- Scope membatasi resource: master:read | setoran:read | hits:read
-- =====================================================================

create table api_keys (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  key_prefix    text not null unique,
  key_hash      text not null,
  scopes        text[] not null default '{}',
  active        boolean not null default true,
  expires_at    timestamptz,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  created_by_wa text,
  note          text
);

-- Lookup hot-path hanya butuh key yang aktif.
create index api_keys_prefix_active_idx on api_keys (key_prefix) where active;
