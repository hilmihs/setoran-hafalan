-- Migrasi Maahir 2026-08-13 — pemutihan massal (batch)
--
-- Koordinator memutihkan puluhan kelas sekaligus; tanpa identitas batch,
-- membatalkan aksi yang salah berarti mencabut ratusan baris satu per satu.
--
-- 1. `maahir_pemutihan_batch`: satu baris per aksi massal. `kelas_ids` menyimpan
--    snapshot kelas yang dicentang supaya riwayat tetap terbaca meski kelasnya
--    kemudian dihapus atau berganti nama.
-- 2. `maahir_pemutihan.batch_id`: penghubung ke batch. NULL = pemutihan
--    per-orang seperti sebelumnya, jadi baris lama tak berubah artinya.
--
-- Pembatalan batch memakai `dibatalkan_pada` yang sudah ada di kedua tabel,
-- jadi getPemutihan() otomatis mengabaikannya tanpa kode baru.
--
-- Jalankan SEBELUM deploy kode yang men-select kolom baru.
--   npm run db -- "$(cat scripts/sql/2026-08-13-pemutihan-batch.sql)" --confirm

CREATE TABLE IF NOT EXISTS maahir_pemutihan_batch (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Periode laporan 'YYYY-MM' (window 28–27), sama dengan maahir_pemutihan.month.
  month           text        NOT NULL,
  alasan          text,
  -- Snapshot id kelas terpilih, array JSON of uuid-string.
  kelas_ids       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- Jumlah baris pemutihan yang benar-benar dibuat (yang dilewati tak dihitung).
  jumlah_peserta  int         NOT NULL DEFAULT 0,
  dibuat_oleh     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  dibatalkan_pada timestamptz,
  dibatalkan_oleh text
);

CREATE INDEX IF NOT EXISTS maahir_pemutihan_batch_month_idx
  ON maahir_pemutihan_batch (month);

ALTER TABLE maahir_pemutihan
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES maahir_pemutihan_batch(id);

CREATE INDEX IF NOT EXISTS maahir_pemutihan_batch_id_idx
  ON maahir_pemutihan (batch_id) WHERE batch_id IS NOT NULL;
